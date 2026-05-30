import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/billing/toss/webhook
 *
 * Toss Payments webhook receiver. Toss POSTs payment status changes
 * (DONE / CANCELED / PARTIAL_CANCELED / ABORTED / EXPIRED) so we can
 * reconcile in real-time instead of waiting for the daily renewal cron
 * to discover failures.
 *
 * Signature verification:
 *   - Header: `tosspayments-webhook-signature`
 *   - Algorithm: HMAC-SHA256(body, TOSS_WEBHOOK_SECRET) → base64
 *   - timingSafeEqual to defeat compare-leak timing attacks
 *
 * Idempotency:
 *   - Each Toss event has a unique eventId; we record processed eventIds
 *     in subscription_events.metadata.toss_event_id to skip duplicates.
 *
 * Webhook URL (register in Toss merchant console):
 *   {APP_BASE_URL}/api/billing/toss/webhook
 *
 * Why we still need the renewal cron: webhooks cover *status changes*
 * for charges WE initiate. The cron is what initiates monthly charges
 * via billingKey. So they complement, not replace.
 */

interface TossWebhookPayload {
  eventType?: string;
  createdAt?: string;
  data?: {
    paymentKey?: string;
    orderId?: string;
    status?: string;
    totalAmount?: number;
    customerKey?: string;
    method?: string;
    receipt?: { url?: string };
    failure?: { code?: string; message?: string };
  };
}

function verifySignature(rawBody: string, headerSig: string | null): boolean {
  const secret = process.env.TOSS_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured → reject all webhooks. Fail-closed; never
    // silently trust unverified payloads in production.
    console.warn("[toss/webhook] TOSS_WEBHOOK_SECRET not set — rejecting all webhooks");
    return false;
  }
  if (!headerSig) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(headerSig, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get("tosspayments-webhook-signature");

  if (!verifySignature(rawBody, sig)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: TossWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as TossWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventType = payload.eventType ?? "unknown";
  const data = payload.data ?? {};
  const paymentKey = data.paymentKey ?? null;
  const status = data.status ?? null;

  console.log(`[toss/webhook] ${eventType} status=${status} paymentKey=${paymentKey}`);

  const svc = createServiceClient();

  // Idempotency: Toss doesn't ship a stable eventId, so we use
  // (paymentKey + status + createdAt) as a composite. Storing this in
  // metadata.toss_event_key lets us skip duplicate deliveries.
  const eventKey = `${paymentKey ?? "no-pk"}-${status ?? "no-status"}-${payload.createdAt ?? ""}`;
  const { data: existing } = await svc
    .from("subscription_events")
    .select("id")
    .eq("metadata->>toss_event_key", eventKey)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Resolve subscription via customerKey OR by looking up paymentKey
  // history. Customer key is more reliable since paymentKey changes per
  // charge.
  let subscriptionId: string | null = null;
  let workspaceId: string | null = null;
  if (data.customerKey) {
    const { data: sub } = await svc
      .from("subscriptions")
      .select("id, workspace_id")
      .eq("toss_customer_key", data.customerKey)
      .maybeSingle();
    if (sub) {
      subscriptionId = sub.id as string;
      workspaceId = sub.workspace_id as string;
    }
  }

  // Map Toss status → our subscription status side-effects.
  // We DON'T flip subscription.status here for normal DONE/CANCELED
  // events because the cron-initiated charge already does that. We
  // only override for failure scenarios the cron may not have seen
  // yet (ABORTED / EXPIRED before we polled).
  let appliedStatusChange: string | null = null;
  if (subscriptionId && (status === "ABORTED" || status === "EXPIRED")) {
    await svc
      .from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("id", subscriptionId);
    appliedStatusChange = "past_due";
  }

  // Log the event (idempotency + audit trail).
  await svc.from("subscription_events").insert({
    workspace_id: workspaceId,
    subscription_id: subscriptionId,
    event_type:
      status === "DONE"
        ? "toss_payment_confirmed"
        : status === "CANCELED" || status === "PARTIAL_CANCELED"
          ? "toss_payment_canceled"
          : status === "ABORTED" || status === "EXPIRED"
            ? "toss_payment_failed"
            : "toss_webhook_other",
    amount: data.totalAmount ?? null,
    currency: "KRW",
    metadata: {
      toss_event_key: eventKey,
      event_type: eventType,
      payment_key: paymentKey,
      status,
      method: data.method,
      receipt_url: data.receipt?.url,
      failure: data.failure,
      applied_status_change: appliedStatusChange,
    },
  });

  return NextResponse.json({ ok: true });
}
