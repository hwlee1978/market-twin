import { createServiceClient } from "@/lib/supabase/server";
import { runContentStrategist, type ContentStrategy, type Locale } from "./content-strategist";

/**
 * Content brief lifecycle: create → planning (run strategist) → planned.
 * Sprint 6 will extend with generating → ready transitions for drafts.
 */

export type BriefStatus =
  | "planning"
  | "planned"
  | "generating"
  | "ready"
  | "published"
  | "archived";

export interface BriefRow {
  id: string;
  workspace_id: string;
  created_by: string | null;
  topic: string;
  goal: string | null;
  target_audience: string | null;
  formats: string[] | null;
  tone: string | null;
  status: BriefStatus;
  strategy: ContentStrategy | null;
  strategist_input_tokens: number | null;
  strategist_output_tokens: number | null;
  strategist_ms: number | null;
  locale: Locale;
  created_at: string;
  updated_at: string;
}

export async function createAndPlanBrief(input: {
  workspaceId: string;
  userId: string;
  topic: string;
  goal?: string;
  targetAudience?: string;
  formats?: string[];
  tone?: string;
  locale: Locale;
}): Promise<BriefRow> {
  const supabase = createServiceClient();

  // 1. Insert in "planning" so the UI can immediately show a row + spinner
  // if the user navigates away. Strategist runs synchronously here (1-3s);
  // for batched flows we'd switch to a background job.
  const { data: created, error: insErr } = await supabase
    .from("mrai_content_briefs")
    .insert({
      workspace_id: input.workspaceId,
      created_by: input.userId,
      topic: input.topic,
      goal: input.goal ?? null,
      target_audience: input.targetAudience ?? null,
      formats: input.formats ?? null,
      tone: input.tone ?? null,
      status: "planning",
      locale: input.locale,
    })
    .select("id")
    .single();
  if (insErr || !created) throw new Error(`create brief: ${insErr?.message}`);

  // 2. Run strategist
  let strategy: ContentStrategy | null = null;
  let usage: { input?: number; output?: number } = {};
  let ms = 0;
  try {
    const result = await runContentStrategist({
      workspaceId: input.workspaceId,
      topic: input.topic,
      goal: input.goal,
      targetAudience: input.targetAudience,
      formats: input.formats,
      tone: input.tone,
      locale: input.locale,
    });
    strategy = result.strategy;
    usage = result.usage;
    ms = result.ms;
  } catch (e) {
    console.error("[mrai/content] strategist failed", e);
    // Bubble up — caller surfaces error and leaves brief in "planning"
    // for retry.
    throw e instanceof Error ? e : new Error("strategist_failed");
  }

  // 3. Update row to "planned" with strategy
  const { data: updated, error: updErr } = await supabase
    .from("mrai_content_briefs")
    .update({
      status: "planned",
      strategy,
      strategist_input_tokens: usage.input ?? null,
      strategist_output_tokens: usage.output ?? null,
      strategist_ms: ms,
      updated_at: new Date().toISOString(),
    })
    .eq("id", created.id)
    .select(
      "id, workspace_id, created_by, topic, goal, target_audience, formats, tone, status, strategy, strategist_input_tokens, strategist_output_tokens, strategist_ms, locale, created_at, updated_at",
    )
    .single();
  if (updErr || !updated) throw new Error(`update brief: ${updErr?.message}`);

  return updated as BriefRow;
}

/**
 * Re-run strategist for an existing brief — useful when the workspace
 * has accumulated more memory/KG since the original planning.
 */
export async function regenerateStrategy(input: {
  workspaceId: string;
  briefId: string;
}): Promise<BriefRow> {
  const supabase = createServiceClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("mrai_content_briefs")
    .select(
      "id, workspace_id, topic, goal, target_audience, formats, tone, locale",
    )
    .eq("id", input.briefId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (fetchErr || !existing) throw new Error("brief not found");

  const row = existing as {
    topic: string;
    goal: string | null;
    target_audience: string | null;
    formats: string[] | null;
    tone: string | null;
    locale: Locale;
  };

  await supabase
    .from("mrai_content_briefs")
    .update({ status: "planning", updated_at: new Date().toISOString() })
    .eq("id", input.briefId);

  const result = await runContentStrategist({
    workspaceId: input.workspaceId,
    topic: row.topic,
    goal: row.goal ?? undefined,
    targetAudience: row.target_audience ?? undefined,
    formats: row.formats ?? undefined,
    tone: row.tone ?? undefined,
    locale: row.locale,
  });

  const { data: updated, error: updErr } = await supabase
    .from("mrai_content_briefs")
    .update({
      status: "planned",
      strategy: result.strategy,
      strategist_input_tokens: result.usage.input ?? null,
      strategist_output_tokens: result.usage.output ?? null,
      strategist_ms: result.ms,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.briefId)
    .select(
      "id, workspace_id, created_by, topic, goal, target_audience, formats, tone, status, strategy, strategist_input_tokens, strategist_output_tokens, strategist_ms, locale, created_at, updated_at",
    )
    .single();
  if (updErr || !updated) throw new Error(`update brief: ${updErr?.message}`);
  return updated as BriefRow;
}

export async function listBriefs(workspaceId: string): Promise<BriefRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_content_briefs")
    .select(
      "id, workspace_id, created_by, topic, goal, target_audience, formats, tone, status, strategy, strategist_input_tokens, strategist_output_tokens, strategist_ms, locale, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`list briefs: ${error.message}`);
  return (data ?? []) as BriefRow[];
}

export async function getBrief(input: {
  workspaceId: string;
  briefId: string;
}): Promise<BriefRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_content_briefs")
    .select(
      "id, workspace_id, created_by, topic, goal, target_audience, formats, tone, status, strategy, strategist_input_tokens, strategist_output_tokens, strategist_ms, locale, created_at, updated_at",
    )
    .eq("id", input.briefId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (error) throw new Error(`get brief: ${error.message}`);
  return (data ?? null) as BriefRow | null;
}

export async function deleteBrief(input: {
  workspaceId: string;
  briefId: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("mrai_content_briefs")
    .delete()
    .eq("id", input.briefId)
    .eq("workspace_id", input.workspaceId);
  if (error) throw new Error(`delete brief: ${error.message}`);
}
