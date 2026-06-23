import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { cancelPayment, NiceError } from "@/lib/billing/nice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 청약철회(전액환불) 자격: 결제 후 7일 이내 + 시뮬레이션 0건 사용.
const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /api/billing/nice/refund
 *
 * 나이스페이먼츠 단건결제의 자가 환불(청약철회). 결제 공시·전자상거래법
 * §17(청약철회)에 따라, 결제 후 7일 이내이고 시뮬레이션을 한 건도 쓰지
 * 않았으면 전액 환불한다. 그 외(일할 환불 등)는 자동화하지 않고 고객센터
 * (contact@markettwin.ai)로 안내한다.
 *
 *   1. 현재 워크스페이스의 최근 승인 단건결제(nice_pending_orders) 조회
 *   2. 자격 검증: 7일 이내 + 결제 이후 시뮬 0건
 *   3. cancelPayment(tid)로 전액취소 → free_trial 강등(즉시 만료)
 *   4. refunded 이벤트 기록(이중환불 방지: tid 기준 기존 환불 확인)
 *
 * 부분/일할 환불은 NICE 부분취소(cancelAmt)로 가능하지만, 금액 산정·분쟁
 * 소지가 있어 v1에선 수기(고객센터) 처리.
 */
export async function POST() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createServiceClient();

  // 현재 구독이 NICE 단건결제(빌키 없음) active인지 확인.
  const { data: sub } = await admin
    .from("subscriptions")
    .select("payment_provider, nice_bid, status")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!sub || sub.payment_provider !== "nicepay" || sub.nice_bid != null) {
    return NextResponse.json(
      { error: "not_single_payment", message: "환불 가능한 단건결제 구독이 없습니다." },
      { status: 400 },
    );
  }

  // 최근 승인 단건 주문(= 현재 결제 기간).
  const { data: order } = await admin
    .from("nice_pending_orders")
    .select("order_id, tid, amount_krw, plan, approved_at")
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order || !order.tid || !order.approved_at) {
    return NextResponse.json(
      { error: "no_refundable_payment", message: "환불 가능한 결제 내역을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 이중환불 방지 — 같은 tid의 refunded 이벤트가 이미 있으면 거부.
  const { data: prior } = await admin
    .from("subscription_events")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("event", "refunded")
    .eq("metadata->>tid", order.tid)
    .limit(1);
  if (prior && prior.length) {
    return NextResponse.json({ error: "already_refunded", message: "이미 환불된 결제입니다." }, { status: 409 });
  }

  // 자격 1) 7일 이내.
  const paidAtMs = new Date(order.approved_at).getTime();
  if (Date.now() - paidAtMs > REFUND_WINDOW_MS) {
    return NextResponse.json(
      {
        error: "refund_window_expired",
        message: "결제 후 7일이 지나 자동 전액환불 대상이 아닙니다. 일할 환불은 contact@markettwin.ai로 문의해주세요.",
      },
      { status: 403 },
    );
  }

  // 자격 2) 결제 이후 시뮬 0건(취소건 제외).
  const { count: simsSincePaid } = await admin
    .from("simulations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)
    .gte("started_at", order.approved_at)
    .neq("status", "cancelled");
  if ((simsSincePaid ?? 0) > 0) {
    return NextResponse.json(
      {
        error: "sims_used",
        message: "시뮬레이션을 이미 사용해 전액환불 대상이 아닙니다. 일할 환불은 contact@markettwin.ai로 문의해주세요.",
      },
      { status: 403 },
    );
  }

  // NICE 전액취소.
  let cancelledTid: string | undefined;
  try {
    const res = await cancelPayment({
      tid: order.tid,
      reason: "고객 청약철회 (결제 7일 이내, 시뮬레이션 미사용)",
      orderId: randomUUID(),
    });
    cancelledTid = res.cancelledTid;
  } catch (err) {
    const reason = err instanceof NiceError ? `${err.code}:${err.message}` : String(err);
    console.error(`[nice refund] cancel failed ws=${ctx.workspaceId} tid=${order.tid}:`, reason);
    return NextResponse.json({ error: "cancel_failed", detail: reason }, { status: 502 });
  }

  // 환불 성공 → 즉시 free_trial로 강등(접근 종료).
  await admin
    .from("subscriptions")
    .update({
      plan: "free_trial",
      status: "canceled",
      nice_bid: null,
      cancel_at_period_end: false,
      current_period_end: new Date().toISOString(),
      trial_sims_limit: 0,
    })
    .eq("workspace_id", ctx.workspaceId);

  await admin.from("subscription_events").insert({
    workspace_id: ctx.workspaceId,
    event: "refunded",
    from_plan: order.plan as string,
    to_plan: "free_trial",
    to_status: "canceled",
    amount_cents: order.amount_krw * 100, // 전액환불(KRW×100)
    currency: "KRW",
    metadata: {
      tid: order.tid,
      cancelled_tid: cancelledTid ?? null,
      order_id: order.order_id,
      provider: "nicepay",
      mode: "single",
      reason: "withdrawal_7d_unused",
    },
  });

  return NextResponse.json({ ok: true, refundedAmountKrw: order.amount_krw });
}
