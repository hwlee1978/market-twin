import { createServiceClient } from "@/lib/supabase/server";

/**
 * Mr. AI feedback layer — save signals + aggregate into a coaching
 * summary for downstream prompts (briefing, eventually chat).
 *
 * Aggregation logic is intentionally simple — count by kind over the
 * last N days. ML personalization is overkill until we have many
 * months of signal.
 */

export type FeedbackTargetType = "briefing" | "chat_message";
export type FeedbackKind = "useful" | "not_useful" | "acted" | "dismiss";

export interface FeedbackRow {
  id: string;
  target_type: FeedbackTargetType;
  target_id: string;
  kind: FeedbackKind;
  note: string | null;
  created_at: string;
}

const RECENT_DAYS = 14;

/**
 * Upsert a feedback row. (user × target) is UNIQUE so toggling kinds
 * just overwrites; resending the same kind is a no-op timestamp bump.
 */
export async function saveFeedback(input: {
  workspaceId: string;
  userId: string;
  targetType: FeedbackTargetType;
  targetId: string;
  kind: FeedbackKind;
  note?: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("mrai_feedback")
    .upsert(
      {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        target_type: input.targetType,
        target_id: input.targetId,
        kind: input.kind,
        note: input.note ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,user_id,target_type,target_id" },
    );
  if (error) throw new Error(`save feedback: ${error.message}`);
}

/**
 * Remove a feedback row (user clicked the same button to clear it).
 */
export async function clearFeedback(input: {
  workspaceId: string;
  userId: string;
  targetType: FeedbackTargetType;
  targetId: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("mrai_feedback")
    .delete()
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId);
  if (error) throw new Error(`clear feedback: ${error.message}`);
}

/**
 * Get the current user's feedback for a batch of targets — used by the
 * UI to render the active state on each button row.
 */
export async function loadFeedbackFor(input: {
  workspaceId: string;
  userId: string;
  targetType: FeedbackTargetType;
  targetIds: string[];
}): Promise<Map<string, FeedbackKind>> {
  if (input.targetIds.length === 0) return new Map();
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("mrai_feedback")
    .select("target_id, kind")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .eq("target_type", input.targetType)
    .in("target_id", input.targetIds);
  const out = new Map<string, FeedbackKind>();
  for (const row of (data ?? []) as Array<{ target_id: string; kind: FeedbackKind }>) {
    out.set(row.target_id, row.kind);
  }
  return out;
}

export interface FeedbackAggregate {
  windowDays: number;
  totalSignals: number;
  byKind: Record<FeedbackKind, number>;
  briefings: { total: number; byKind: Record<FeedbackKind, number> };
  chatMessages: { total: number; byKind: Record<FeedbackKind, number> };
}

function emptyKindCounts(): Record<FeedbackKind, number> {
  return { useful: 0, not_useful: 0, acted: 0, dismiss: 0 };
}

export async function aggregateRecentFeedback(workspaceId: string): Promise<FeedbackAggregate> {
  const supabase = createServiceClient();
  const sinceIso = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("mrai_feedback")
    .select("target_type, kind")
    .eq("workspace_id", workspaceId)
    .gte("created_at", sinceIso)
    .limit(1000);

  const all = (data ?? []) as Array<{ target_type: FeedbackTargetType; kind: FeedbackKind }>;
  const byKind = emptyKindCounts();
  const briefings = { total: 0, byKind: emptyKindCounts() };
  const chatMessages = { total: 0, byKind: emptyKindCounts() };

  for (const r of all) {
    byKind[r.kind]++;
    if (r.target_type === "briefing") {
      briefings.total++;
      briefings.byKind[r.kind]++;
    } else {
      chatMessages.total++;
      chatMessages.byKind[r.kind]++;
    }
  }

  return {
    windowDays: RECENT_DAYS,
    totalSignals: all.length,
    byKind,
    briefings,
    chatMessages,
  };
}

/**
 * Render the aggregate as a short coaching block the briefing/chat
 * generator can prepend to its system prompt. Returns "" when there's
 * not enough signal yet to be useful (< 3 signals total).
 */
export function formatFeedbackForPrompt(agg: FeedbackAggregate, locale: "ko" | "en" = "ko"): string {
  if (agg.totalSignals < 3) return "";

  const total = agg.byKind.useful + agg.byKind.not_useful + agg.byKind.acted + agg.byKind.dismiss;
  if (total === 0) return "";

  const usefulRate = ((agg.byKind.useful + agg.byKind.acted) / total) * 100;
  const dismissRate = ((agg.byKind.dismiss + agg.byKind.not_useful) / total) * 100;

  // Coaching tone — actionable guidance, not just stats.
  let coaching = "";
  if (dismissRate > 40) {
    coaching =
      locale === "en"
        ? "User has been dismissing many outputs recently — be more concise and lead with the action."
        : "사용자가 최근 많이 dismiss했습니다 — 더 짧게, action부터 먼저.";
  } else if (agg.byKind.acted >= 3) {
    coaching =
      locale === "en"
        ? "User has acted on several items — keep surfacing concrete, actionable signals."
        : "사용자가 여러 항목을 실제로 행동했습니다 — 구체적·실행 가능한 신호를 계속 surface.";
  } else if (usefulRate > 60) {
    coaching =
      locale === "en"
        ? "User finds the current style useful — keep the same depth and format."
        : "사용자가 현재 style을 유용하다고 평가 — 같은 깊이와 형식 유지.";
  }

  const header =
    locale === "en"
      ? `## User feedback (last ${agg.windowDays} days)`
      : `## 사용자 피드백 (최근 ${agg.windowDays}일)`;

  const stats =
    locale === "en"
      ? `${agg.totalSignals} signals · ${agg.byKind.useful}👍 · ${agg.byKind.not_useful}👎 · ${agg.byKind.acted}✅ acted · ${agg.byKind.dismiss}✕ dismissed`
      : `총 ${agg.totalSignals}건 · ${agg.byKind.useful}👍 · ${agg.byKind.not_useful}👎 · ${agg.byKind.acted}✅ 실행 · ${agg.byKind.dismiss}✕ 무시`;

  return `${header}\n${stats}${coaching ? `\n→ ${coaching}` : ""}`;
}
