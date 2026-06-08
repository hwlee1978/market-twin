/**
 * Workspace usage queries — counts simulations / persona-chat messages
 * within the current billing month and resolves the workspace's active
 * subscription. Used by both the wizard pre-flight (canStartSim) and the
 * /billing dashboard (progress bars).
 *
 * "Current billing month" rules:
 *   - For paid plans with current_period_start set, use that as the
 *     boundary (matches Stripe / Toss invoice cycles).
 *   - For trial / never-paid workspaces, fall back to a calendar month
 *     starting on the workspace's creation day-of-month so we don't
 *     reset usage at midnight of the 1st (which would be jarring during
 *     trial). Calendar month is fine for free trial since usage is
 *     gated by trial_sims_limit anyway.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { getPlan, type PlanDefinition, type SubscriptionStatus } from "./plans";

export interface SubscriptionState {
  plan: PlanDefinition;
  status: SubscriptionStatus;
  trialActive: boolean;
  trialEndsAt: string | null;
  trialSimsUsed: number;
  trialSimsLimit: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentProvider: "stripe" | "tosspayments" | null;
}

export interface MonthlyUsage {
  monthStart: string;
  simsUsed: number;
  decisionPlusSimsUsed: number;
  deepSimsUsed: number;
  chatMessagesUsed: number;
}

/**
 * Resolves the workspace's current subscription state. Falls through to
 * a synthetic "free_trial" state if the row is missing — happens for
 * legacy workspaces created before the subscriptions table existed,
 * even after the backfill (race conditions, manual deletes, etc.).
 */
export async function getSubscription(workspaceId: string): Promise<SubscriptionState> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "plan, status, trial_ends_at, trial_sims_used, trial_sims_limit, current_period_start, current_period_end, cancel_at_period_end, payment_provider",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.warn(`[billing] subscription lookup failed for ${workspaceId}:`, error.message);
  }

  const plan = getPlan(data?.plan ?? "free_trial");
  const status = (data?.status ?? "trialing") as SubscriptionStatus;
  const trialEndsAt = data?.trial_ends_at ?? null;
  const trialActive =
    status === "trialing" &&
    (!trialEndsAt || new Date(trialEndsAt).getTime() > Date.now());

  return {
    plan,
    status,
    trialActive,
    trialEndsAt,
    trialSimsUsed: data?.trial_sims_used ?? 0,
    trialSimsLimit: data?.trial_sims_limit ?? plan.limits.simsPerMonth,
    currentPeriodStart: data?.current_period_start ?? null,
    currentPeriodEnd: data?.current_period_end ?? null,
    cancelAtPeriodEnd: !!data?.cancel_at_period_end,
    paymentProvider:
      (data?.payment_provider as "stripe" | "tosspayments" | null) ?? null,
  };
}

/**
 * Counts simulations + chat messages used in the current billing month
 * (or trial window for trial workspaces). Cheap — both queries hit
 * indexed (workspace_id, created_at) columns.
 */
export async function getMonthlyUsage(
  workspaceId: string,
  sub: SubscriptionState,
): Promise<MonthlyUsage> {
  const admin = createServiceClient();
  const monthStart = resolveMonthStart(sub);

  // Sims: count rows in simulations table with started_at >= monthStart.
  // Includes failed sims because LLM costs were already incurred — fair
  // to charge against quota. Excludes 'cancelled' so an immediate user
  // cancel doesn't burn a quota slot.
  const { data: sims } = await admin
    .from("simulations")
    .select("id, ensemble_id, ensembles(tier)")
    .eq("workspace_id", workspaceId)
    .gte("started_at", monthStart.toISOString())
    .neq("status", "cancelled");

  type SimRow = {
    id: string;
    ensemble_id: string | null;
    ensembles: { tier?: string } | { tier?: string }[] | null;
  };
  const simRows = (sims ?? []) as SimRow[];
  const simsUsed = simRows.length;
  const tierOf = (s: SimRow): string | undefined => {
    const ens = s.ensembles;
    return Array.isArray(ens) ? ens[0]?.tier : ens?.tier;
  };
  const decisionPlusSimsUsed = simRows.filter(
    (s) => tierOf(s) === "decision_plus",
  ).length;
  const deepSimsUsed = simRows.filter((s) => {
    const t = tierOf(s);
    return t === "deep" || t === "deep_pro";
  }).length;

  // Chat messages: each user→persona turn writes nothing today (chat is
  // stateless server-side), so we count via the audit_logs entry the
  // /api/persona-chat route emits. Falls back to 0 if logging not yet
  // wired — which is fine since the limit is generous.
  let chatMessagesUsed = 0;
  try {
    const { count } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("action", "persona_chat_message")
      .gte("ts", monthStart.toISOString());
    chatMessagesUsed = count ?? 0;
  } catch {
    // audit_logs schema or RLS could vary across deploys; non-fatal.
  }

  return {
    monthStart: monthStart.toISOString(),
    simsUsed,
    decisionPlusSimsUsed,
    deepSimsUsed,
    chatMessagesUsed,
  };
}

/**
 * Determines the start of the current billing/usage window:
 *   - Paid plan with active period → period_start
 *   - Otherwise → calendar month start (UTC, 1st of month)
 *
 * UTC over local time so a workspace creator in KR vs the US doesn't
 * see different reset moments — billing math has to be consistent
 * regardless of who's looking.
 */
function resolveMonthStart(sub: SubscriptionState): Date {
  if (sub.currentPeriodStart) {
    const d = new Date(sub.currentPeriodStart);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
