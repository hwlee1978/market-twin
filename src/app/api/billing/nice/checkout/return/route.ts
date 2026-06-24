import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { approvePayment, verifyAuthSignature, NiceError } from "@/lib/billing/nice";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import { notifyPaymentSucceeded } from "@/lib/email/billing-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/billing/nice/checkout/return
 *
 * 나이스페이먼츠 결제창 단건결제의 2단계(returnUrl). 결제창 인증 후 NICE가
 * 이 엔드포인트로 form-urlencoded POST(top-level navigation)를 보낸다.
 * 세션 쿠키는 실리지 않으므로(cross-site), orderId로 nice_pending_orders를
 * 조회해 결제 맥락을 복원한다.
 *
 *   1. authResultCode/서명 검증 — 실패면 실패 페이지로 redirect
 *   2. pending order 조회 + 금액 대조(위변조 방지)
 *   3. approvePayment(tid)로 실제 승인(매출)
 *   4. 성공 시 1개월/1년 접근 부여(빌키 없음) + order=approved + 이벤트 로그
 *   5. 브라우저를 /{locale}/billing로 303 redirect
 *
 * 멱등성: 같은 order가 이미 approved면 재승인 없이 성공 redirect.
 */
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const redirectTo = (locale: string, status: "success" | "failed" | "error") =>
    NextResponse.redirect(new URL(`/${locale}/billing?checkout=${status}`, origin), 303);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return redirectTo("ko", "error");
  }
  const f = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : null;
  };

  const authResultCode = f("authResultCode");
  const tid = f("tid");
  const orderId = f("orderId");
  const amountStr = f("amount");
  const authToken = f("authToken");
  const signature = f("signature");

  const admin = createServiceClient();

  // orderId 없이는 어떤 결제인지 알 수 없다 → 기본 locale로 실패 처리.
  if (!orderId) {
    console.warn("[nice return] missing orderId");
    return redirectTo("ko", "error");
  }

  const { data: order } = await admin
    .from("nice_pending_orders")
    .select("order_id, workspace_id, plan, cycle, amount_krw, locale, status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!order) {
    console.warn(`[nice return] unknown orderId=${orderId}`);
    return redirectTo("ko", "error");
  }
  const locale = order.locale === "en" ? "en" : "ko";

  // 멱등성 — 이미 승인된 주문의 중복 통보면 그대로 성공 처리.
  if (order.status === "approved") {
    return redirectTo(locale, "success");
  }

  const markFailed = async () => {
    await admin.from("nice_pending_orders").update({ status: "failed" }).eq("order_id", orderId);
  };

  // 인증 실패(사용자 취소/카드사 거절 등).
  if (authResultCode !== "0000" || !tid || !authToken || !signature || !amountStr) {
    console.warn(`[nice return] auth not successful: code=${authResultCode} order=${orderId}`);
    await markFailed();
    return redirectTo(locale, "failed");
  }

  // 위변조 검증 — (1) 서명(authToken+clientId+amount+secret) (2) 금액이 우리가
  // 적재한 주문 금액과 일치하는지. 둘 다 통과해야 승인으로 진행.
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount !== order.amount_krw) {
    console.error(`[nice return] amount mismatch order=${orderId} got=${amountStr} expected=${order.amount_krw}`);
    await markFailed();
    return redirectTo(locale, "error");
  }
  if (!verifyAuthSignature({ authToken, amount, signature })) {
    console.error(`[nice return] signature verify failed order=${orderId}`);
    await markFailed();
    return redirectTo(locale, "error");
  }

  // 최종 승인(매출 발생).
  try {
    await approvePayment({ tid, amountKrw: amount });
  } catch (err) {
    const reason = err instanceof NiceError ? `${err.code}:${err.message}` : String(err);
    console.error(`[nice return] approve failed order=${orderId}:`, reason);
    await markFailed();
    return redirectTo(locale, "failed");
  }

  const planSlug = order.plan as PlanSlug;
  const cycle = (order.cycle === "annual" ? "annual" : "monthly") as "monthly" | "annual";
  const plan = getPlan(planSlug);
  const workspaceId = order.workspace_id as string;

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  if (cycle === "annual") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  // 단건결제: 빌키 없이 기간 접근만 부여. nice_bid는 null로 둬 갱신 cron이
  // 자동과금하지 않게 하고, 만료는 cron의 단건 sweep이 처리한다.
  await admin
    .from("subscriptions")
    .update({
      plan: planSlug,
      status: "active",
      payment_provider: "nicepay",
      nice_bid: null,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      billing_currency: "KRW",
      billing_interval: cycle,
    })
    .eq("workspace_id", workspaceId);

  await admin
    .from("nice_pending_orders")
    .update({ status: "approved", tid, approved_at: new Date().toISOString() })
    .eq("order_id", orderId);

  await admin.from("subscription_events").insert({
    workspace_id: workspaceId,
    event: "payment_succeeded",
    to_plan: planSlug,
    to_status: "active",
    amount_cents: amount * 100, // 부가세 포함 총액 KRW × 100 (plans.ts 컨벤션)
    currency: "KRW",
    metadata: {
      tid,
      order_id: orderId,
      cycle,
      provider: "nicepay",
      mode: "single", // 단건(빌키 없음) 구분
      // 세금계산서 분리발행용 — amount는 부가세 포함 총액, 공급가/부가세로 분해.
      vat_included: true,
      supply_krw: Math.round(amount / 1.1),
      vat_krw: amount - Math.round(amount / 1.1),
    },
  });

  void notifyPaymentSucceeded({
    workspaceId,
    planName: plan.name,
    amountCents: amount * 100,
    currency: "KRW",
    isRenewal: false,
  });

  return redirectTo(locale, "success");
}
