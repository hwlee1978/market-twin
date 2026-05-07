/**
 * 토스페이먼츠 (Toss Payments) client. Used for KRW recurring billing
 * via the 빌링키 (billing key) flow:
 *
 *   1. Frontend opens the Toss SDK widget — user enters card details
 *      → Toss returns an `authKey` to our success URL
 *   2. We exchange authKey + customerKey for a `billingKey` (server-side)
 *   3. Store billingKey on subscriptions; immediately charge the first
 *      period using it
 *   4. For renewals, our cron / scheduler fires a charge via billingKey
 *      every billing_interval — Toss does NOT auto-renew like Stripe
 *
 * Docs: https://docs.tosspayments.com/reference#빌링키-결제
 *
 * The secret key is base64-prefixed with "Basic" for HTTP Basic auth in
 * every API call. Test mode keys start `test_sk_`, live keys `live_sk_`.
 */

import type { PlanSlug } from "./plans";

const TOSS_API_BASE = "https://api.tosspayments.com/v1";

interface TossErrorBody {
  code?: string;
  message?: string;
}

class TossError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(`[toss ${status}] ${code}: ${message}`);
    this.name = "TossError";
    this.code = code;
    this.status = status;
  }
}

function tossSecret(): string {
  const v = process.env.TOSS_SECRET_KEY;
  if (!v) throw new Error("TOSS_SECRET_KEY is not set.");
  return v;
}

function tossAuthHeader(): string {
  // Toss expects HTTP Basic where username = secretKey, password = empty.
  // Encoding: base64("<secret>:")
  const token = Buffer.from(`${tossSecret()}:`).toString("base64");
  return `Basic ${token}`;
}

async function tossRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${TOSS_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: tossAuthHeader(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { code: "INVALID_RESPONSE", message: text };
  }

  if (!res.ok) {
    const err = (json as TossErrorBody) ?? {};
    throw new TossError(res.status, err.code ?? "UNKNOWN", err.message ?? "Toss API error");
  }
  return json as T;
}

/**
 * Issue a billingKey from an authKey returned by the Toss widget.
 *
 * customerKey is the same value we sent when opening the widget —
 * UUID per workspace, persisted in subscriptions.toss_customer_key
 * so renewals reference the same customer.
 */
export async function issueBillingKey(opts: {
  authKey: string;
  customerKey: string;
}): Promise<{ billingKey: string; cardCompany: string; cardNumberMasked: string }> {
  type Resp = {
    billingKey: string;
    customerKey: string;
    cardCompany: string;
    cardNumber: string; // already masked
  };
  const data = await tossRequest<Resp>("POST", "/billing/authorizations/issue", {
    authKey: opts.authKey,
    customerKey: opts.customerKey,
  });
  return {
    billingKey: data.billingKey,
    cardCompany: data.cardCompany,
    cardNumberMasked: data.cardNumber,
  };
}

/**
 * Charge a stored billingKey for the given amount. Used for both the
 * initial subscription charge and every recurring renewal. The order
 * id must be unique per charge; we use a workspace-scoped UUID so a
 * webhook retry doesn't double-charge.
 */
export async function chargeBillingKey(opts: {
  billingKey: string;
  customerKey: string;
  amountKrw: number;
  orderId: string;
  orderName: string; // human-readable, shown on card statement & receipt
  customerEmail?: string;
}): Promise<{ paymentKey: string; status: string; approvedAt: string }> {
  type Resp = {
    paymentKey: string;
    status: string;
    approvedAt: string;
  };
  const data = await tossRequest<Resp>("POST", `/billing/${opts.billingKey}`, {
    customerKey: opts.customerKey,
    amount: opts.amountKrw,
    orderId: opts.orderId,
    orderName: opts.orderName,
    customerEmail: opts.customerEmail,
  });
  return data;
}

/**
 * Cancel a settled payment (refund). Used when an admin needs to undo
 * a charge — e.g. the workspace was incorrectly charged after a manual
 * cancellation. For subscription-level cancellation, just stop calling
 * chargeBillingKey — there's no Toss-side recurring to cancel.
 */
export async function cancelPayment(opts: {
  paymentKey: string;
  reason: string;
}): Promise<void> {
  await tossRequest("POST", `/payments/${opts.paymentKey}/cancel`, {
    cancelReason: opts.reason,
  });
}

/**
 * KRW price for a given plan/cycle. Mirrors the structure in plans.ts
 * but applies the annual = monthly × 10 (16.7% off) rule directly.
 */
export function tossPriceKrw(plan: PlanSlug, cycle: "monthly" | "annual"): number | null {
  // Hardcoded mirror of plans.ts.priceMonthly.krw (already in KRW × 100
  // there) — divide by 100 to get the integer KRW Toss expects.
  const monthly: Record<PlanSlug, number | null> = {
    free_trial: null,
    starter: 52000,
    validator: 360000,
    growth: 1400000,
    enterprise: null,
  };
  const m = monthly[plan];
  if (m == null) return null;
  return cycle === "annual" ? m * 10 : m;
}

/** Stable per-workspace customerKey. Sent to Toss on every billing call. */
export function workspaceCustomerKey(workspaceId: string): string {
  // Workspace UUIDs are already opaque + unique. Toss accepts up to
  // 50 chars; UUIDs are 36 chars. No transformation needed.
  return workspaceId;
}
