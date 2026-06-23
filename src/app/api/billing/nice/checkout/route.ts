import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { nicePriceKrw, nicePublicClientId } from "@/lib/billing/nice";
import { getPlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  plan: z.enum(["starter", "validator", "growth"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
  locale: z.enum(["ko", "en"]).default("ko"),
});

/**
 * POST /api/billing/nice/checkout
 *
 * 나이스페이먼츠 결제창 단건결제의 1단계. 인증된 사용자가 결제창을 열기
 * 직전에 호출한다:
 *   1. plan/cycle로 금액을 확정
 *   2. orderId↔워크스페이스/플랜/금액 매핑을 nice_pending_orders에 적재
 *   3. 프론트가 AUTHNICE.requestPay에 넘길 파라미터를 반환
 *
 * 결제창 인증 후 NICE가 returnUrl로 cross-site POST(세션 없음)하므로, 결제
 * 맥락 복원은 전적으로 이 pending order(orderId 키)에 의존한다.
 *
 * 단건결제라 빌키(bid)를 만들지 않는다 — 승인 성공 시 1개월/1년 접근만 부여.
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
    return NextResponse.json({ error: "bad_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { plan: planSlug, cycle, locale } = parsed.data;

  const amountKrw = nicePriceKrw(planSlug, cycle);
  if (amountKrw == null) {
    return NextResponse.json({ error: "no_price_for_plan" }, { status: 400 });
  }

  const plan = getPlan(planSlug);
  const orderId = randomUUID();
  const admin = createServiceClient();

  const { error } = await admin.from("nice_pending_orders").insert({
    order_id: orderId,
    workspace_id: ctx.workspaceId,
    plan: planSlug,
    cycle,
    amount_krw: amountKrw,
    locale,
    status: "pending",
  });
  if (error) {
    console.error("[nice checkout] pending order insert failed:", error.message);
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const goodsName = `Market Twin ${plan.name} (${cycle === "annual" ? "Annual" : "Monthly"})`;

  return NextResponse.json({
    clientId: nicePublicClientId(),
    method: "card",
    orderId,
    amount: amountKrw,
    goodsName,
    returnUrl: `${origin}/api/billing/nice/checkout/return`,
  });
}
