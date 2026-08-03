import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { nicePriceKrw, nicePackPriceKrw, nicePublicClientId } from "@/lib/billing/nice";
import { getPlan, getSinglePack } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

// 구독 플랜 결제이거나(pack 미지정), 단건 이용권(pack) 결제. 정확히 하나만 온다.
const RequestSchema = z
  .object({
    plan: z.enum(["starter", "validator", "growth"]).optional(),
    cycle: z.enum(["monthly", "annual"]).default("monthly"),
    pack: z.string().optional(),
    locale: z.enum(["ko", "en"]).default("ko"),
  })
  .refine((v) => !!v.plan !== !!v.pack, { message: "exactly one of plan|pack required" });

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
  const { plan: planSlug, cycle, pack: packSlug, locale } = parsed.data;

  // 단건 이용권(1회권) vs 구독 플랜 분기. 주문의 plan 컬럼에 pack slug(pack_*)를
  // 넣고 cycle='single'로 적재해 return 라우트가 entitlement 부여로 분기한다.
  let orderPlan: string;
  let orderCycle: "monthly" | "annual" | "single";
  let amountKrw: number | null;
  let goodsName: string;

  if (packSlug) {
    const pack = getSinglePack(packSlug);
    if (!pack) return NextResponse.json({ error: "unknown_pack" }, { status: 400 });
    amountKrw = nicePackPriceKrw(packSlug);
    orderPlan = packSlug;
    orderCycle = "single";
    goodsName = `Market Twin ${pack.name.ko} · 부가세 포함`;
  } else {
    amountKrw = nicePriceKrw(planSlug!, cycle);
    const plan = getPlan(planSlug!);
    orderPlan = planSlug!;
    orderCycle = cycle;
    goodsName = `Market Twin ${plan.name} (${cycle === "annual" ? "Annual" : "Monthly"}) · 부가세 포함`;
  }
  if (amountKrw == null) {
    return NextResponse.json({ error: "no_price_for_plan" }, { status: 400 });
  }

  const orderId = randomUUID();
  const admin = createServiceClient();

  const { error } = await admin.from("nice_pending_orders").insert({
    order_id: orderId,
    workspace_id: ctx.workspaceId,
    plan: orderPlan,
    cycle: orderCycle,
    amount_krw: amountKrw,
    locale,
    status: "pending",
  });
  if (error) {
    console.error("[nice checkout] pending order insert failed:", error.message);
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;

  return NextResponse.json({
    clientId: nicePublicClientId(),
    method: "card",
    orderId,
    amount: amountKrw,
    goodsName,
    returnUrl: `${origin}/api/billing/nice/checkout/return`,
  });
}
