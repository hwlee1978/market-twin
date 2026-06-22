import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/billing/nice/webhook
 *
 * 나이스페이먼츠(V2) 결제 통보(웹훅) 수신부. Toss webhook의 짝. NICE는 결제
 * 상태변화(paid / cancelled / failed / expired 등)를 POST로 통보하므로,
 * 갱신 cron이 발견하기 전에 실시간으로 상태를 동기화한다.
 *
 * 등록: 포스타트 대시보드 → 개발정보 > 웹훅(URL 통보) > 추가 →
 *   {APP_BASE_URL}/api/billing/nice/webhook
 *
 * 서명 검증 (NICE 매뉴얼 api/hook.md):
 *   signature = hex(sha256(tid + amount + ediDate + SecretKey))
 *   별도 웹훅 시크릿이 없고 발급키와 같은 NICE_SECRET_KEY를 쓴다.
 *
 * ⚠️ 응답 규약: 반드시 HTTP 200 + body 정확히 "OK"(text/html)를 돌려줘야
 *   한다. "OK"가 없으면 NICE는 실패로 보고 재전송한다. 그래서 위변조/중복
 *   같은 무시 케이스도 200 "OK"로 답해 재전송 루프를 막되, 서명 불일치만은
 *   거부(미인증 페이로드를 신뢰하지 않음)한다.
 *
 * 워크스페이스 매핑: NICE 키인은 Toss의 customerKey가 없다. 대신 issue/renew
 * 가 결제 시 남긴 subscription_events.metadata.tid로 역추적한다.
 *
 * cron이 여전히 필요한 이유: 웹훅은 *우리가 일으킨* 과금의 상태통보일 뿐,
 * 매 주기 과금을 *시작*하는 건 cron(nice/renew)이다. 상호보완 관계.
 */

interface NiceWebhookPayload {
  resultCode?: string;
  resultMsg?: string;
  tid?: string;
  orderId?: string;
  ediDate?: string;
  signature?: string;
  status?: string; // paid | cancelled | partialCancelled | failed | expired | ready
  paidAt?: string;
  amount?: number;
  goodsName?: string;
  currency?: string;
}

const OK = () =>
  new Response("OK", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

/** signature = hex(sha256(tid + amount + ediDate + SecretKey)), 상수시간 비교. */
function verifySignature(p: NiceWebhookPayload): boolean {
  const secret = process.env.NICE_SECRET_KEY;
  if (!secret) {
    console.warn("[nice/webhook] NICE_SECRET_KEY not set — rejecting all webhooks");
    return false;
  }
  if (!p.signature || !p.tid || p.amount == null || !p.ediDate) return false;
  const expected = createHash("sha256")
    .update(`${p.tid}${p.amount}${p.ediDate}${secret}`)
    .digest("hex");
  // 둘 다 동일 길이 hex라 단순 비교로도 길이 누수는 없지만, 상수시간 비교로
  // 통일한다. (hex 문자열이라 인코딩 길이 동일.)
  if (expected.length !== p.signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ p.signature.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  let payload: NiceWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as NiceWebhookPayload;
  } catch {
    return new Response("invalid_json", { status: 400 });
  }

  if (!verifySignature(payload)) {
    // 미인증 — "OK"를 주지 않아 NICE가 재전송하게 두고, 우리는 신뢰하지 않음.
    return new Response("invalid_signature", { status: 401 });
  }

  const tid = payload.tid ?? null;
  const status = payload.status ?? null;
  console.log(`[nice/webhook] status=${status} tid=${tid} orderId=${payload.orderId ?? ""}`);

  const svc = createServiceClient();

  // 멱등성: NICE는 안정적 eventId가 없어 (tid + status + ediDate) 합성키로
  // 중복 전송을 건너뛴다.
  const eventKey = `${tid ?? "no-tid"}-${status ?? "no-status"}-${payload.ediDate ?? ""}`;
  const { data: existing } = await svc
    .from("subscription_events")
    .select("id")
    .eq("metadata->>nice_event_key", eventKey)
    .maybeSingle();
  if (existing) return OK();

  // 워크스페이스 역추적: issue/renew가 남긴 결제 이벤트의 metadata.tid로 매칭.
  let workspaceId: string | null = null;
  if (tid) {
    const { data: prior } = await svc
      .from("subscription_events")
      .select("workspace_id")
      .eq("metadata->>tid", tid)
      .maybeSingle();
    if (prior) workspaceId = prior.workspace_id as string;
  }

  // 매핑 실패 — subscription_events.workspace_id는 NOT NULL이라 기록할 수
  // 없다. 무한 재전송을 막기 위해 로그만 남기고 "OK"로 응답한다(우리가
  // 일으키지 않은/이미 정리된 결제의 통보일 수 있음).
  if (!workspaceId) {
    console.warn(`[nice/webhook] unmapped webhook tid=${tid} status=${status} — acked without persist`);
    return OK();
  }

  // NICE status → 우리 구독 상태 부수효과.
  // 정상 paid/cancelled는 issue/renew/cancel가 이미 반영하므로 여기선 로그만.
  // failed/expired는 cron이 아직 못 본 비동기 실패일 수 있어 past_due로 덮는다.
  let appliedStatusChange: string | null = null;
  if (workspaceId && (status === "failed" || status === "expired")) {
    await svc
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("workspace_id", workspaceId)
      .eq("payment_provider", "nicepay");
    appliedStatusChange = "past_due";
  }

  const event =
    status === "paid"
      ? "payment_succeeded"
      : status === "cancelled" || status === "partialCancelled"
        ? "canceled"
        : status === "failed" || status === "expired"
          ? "payment_failed"
          : "status_changed";

  await svc.from("subscription_events").insert({
    workspace_id: workspaceId,
    event,
    to_status: appliedStatusChange,
    amount_cents: payload.amount != null ? payload.amount * 100 : null,
    currency: "KRW",
    metadata: {
      nice_event_key: eventKey,
      tid,
      order_id: payload.orderId ?? null,
      status,
      result_code: payload.resultCode ?? null,
      paid_at: payload.paidAt ?? null,
      applied_status_change: appliedStatusChange,
      provider: "nicepay",
      webhook: true,
    },
  });

  return OK();
}
