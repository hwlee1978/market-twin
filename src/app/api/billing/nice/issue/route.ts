import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  registBillingKey,
  chargeBillingKey,
  expireBillingKey,
  nicePriceKrw,
} from "@/lib/billing/nice";
import { getPlan } from "@/lib/billing/plans";
import { notifyPaymentSucceeded } from "@/lib/email/billing-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Card fields for 키인(REST) 빌키발급. 포스타트(V2)는 결제창에서 빌키를
 * 발급하지 않으므로(NICE 답변 2026-06-22) 가맹 자체 폼에서 카드정보를
 * 받아 서버에서 AES 암호화 → /v1/subscribe/regist 한다.
 *
 * ⚠️ 이 필드들은 평문 카드정보다. 절대 로깅/저장하지 말 것 — bid 발급
 * 직후 메모리에서 사라지고, 영속화하는 건 bid(빌키)와 마스킹된 카드명뿐.
 */
const RequestSchema = z.object({
  card: z.object({
    cardNo: z.string().regex(/^\d{15,16}$/),
    expYear: z.string().regex(/^\d{2}$/), // YY
    expMonth: z.string().regex(/^(0[1-9]|1[0-2])$/), // MM
    idNo: z.string().regex(/^\d{6,10}$/), // 개인 생년월일6 또는 사업자번호10
    cardPw: z.string().regex(/^\d{2}$/), // 비밀번호 앞 2자리
  }),
  plan: z.enum(["starter", "validator", "growth"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
});

/**
 * POST /api/billing/nice/issue
 *
 * 나이스페이먼츠(V2 키인) 빌키 발급 흐름의 최종 단계. Toss issue의 짝이지만
 * authKey 교환 대신 카드 평문을 직접 받는다:
 *   1. 프론트 카드입력 폼 → 이 엔드포인트로 카드필드 POST
 *   2. registBillingKey → bid (NICE가 카드 AES 암호화분을 받아 빌키 발급)
 *   3. 같은 호출 흐름에서 첫 주기 즉시 과금(chargeBillingKey)
 *   4. 성공 시 구독을 active로 영속화 + nice_bid 저장
 *
 * 첫 과금이 실패하면 방금 발급한 bid를 NICE 쪽에서 expire 해 고아 빌키를
 * 남기지 않는다(우리는 저장 전이라 로컬엔 흔적 없음).
 *
 * 갱신은 cron(/api/billing/nice/renew)이 매 주기 chargeBillingKey 호출.
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    // flatten()은 입력값을 담지 않는다 — 카드정보가 에러 응답에 새지 않음.
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { card, plan: planSlug, cycle } = parsed.data;

  const amountKrw = nicePriceKrw(planSlug, cycle);
  if (amountKrw == null) {
    return NextResponse.json({ error: "no_price_for_plan" }, { status: 400 });
  }

  const admin = createServiceClient();
  const plan = getPlan(planSlug);

  // 1) 빌키 발급. card는 nice.ts 내부에서만 AES 암호화에 쓰이고 여기서
  //    다시 참조하지 않는다. 실패 로그에 card를 절대 넣지 말 것.
  let bid: string;
  let cardName: string | undefined;
  try {
    const issued = await registBillingKey({
      card,
      orderId: randomUUID(),
      buyerName: undefined,
      buyerEmail: ctx.email,
    });
    bid = issued.bid;
    cardName = issued.cardName;
  } catch (err) {
    console.error("[nice issue] billing key regist failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "billing_key_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // 2) 첫 과금 — 주기 경계를 이 호출에서 확정. 실패 시 방금 발급한 bid를
  //    NICE 쪽에서 만료시켜 고아 빌키를 남기지 않는다.
  const orderId = randomUUID();
  const goodsName = `Market Twin ${plan.name} (${cycle === "annual" ? "Annual" : "Monthly"})`;
  let tid: string;
  let paidAt: string | undefined;
  try {
    const charge = await chargeBillingKey({
      bid,
      amountKrw,
      orderId,
      goodsName,
      buyerEmail: ctx.email,
    });
    tid = charge.tid;
    paidAt = charge.paidAt;
  } catch (err) {
    console.error("[nice issue] first charge failed:", err instanceof Error ? err.message : err);
    try {
      await expireBillingKey({ bid, orderId: randomUUID() });
    } catch (expireErr) {
      console.warn(
        "[nice issue] orphan bid expire failed:",
        expireErr instanceof Error ? expireErr.message : expireErr,
      );
    }
    return NextResponse.json(
      { error: "first_charge_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const periodStart = paidAt ? new Date(paidAt) : new Date();
  const periodEnd = new Date(periodStart);
  if (cycle === "annual") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  await admin
    .from("subscriptions")
    .update({
      plan: planSlug,
      status: "active",
      payment_provider: "nicepay",
      nice_bid: bid,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      billing_currency: "KRW",
      billing_interval: cycle,
    })
    .eq("workspace_id", ctx.workspaceId);

  await admin.from("subscription_events").insert({
    workspace_id: ctx.workspaceId,
    event: "payment_succeeded",
    to_plan: planSlug,
    to_status: "active",
    amount_cents: amountKrw * 100, // KRW × 100 (plans.ts 컨벤션)
    currency: "KRW",
    metadata: {
      tid,
      order_id: orderId,
      cycle,
      card_name: cardName ?? null,
      provider: "nicepay",
    },
  });

  void notifyPaymentSucceeded({
    workspaceId: ctx.workspaceId,
    planName: plan.name,
    amountCents: amountKrw * 100,
    currency: "KRW",
    isRenewal: false,
  });

  return NextResponse.json({
    ok: true,
    plan: planSlug,
    cycle,
    cardName: cardName ?? null,
  });
}
