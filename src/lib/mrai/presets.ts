import { createServiceClient } from "@/lib/supabase/server";

/**
 * Mr. AI Content Presets — workspace-scoped voice/tone/length profiles
 * the Phase 3 draft generator consumes so output stays on-brand and
 * channel-appropriate.
 *
 * Schema lives in migration 0042. A workspace can have many presets
 * (e.g. "임원 톤 LinkedIn", "친근한 인스타", "데이터형 블로그") with at
 * most one marked `is_default` (partial unique index enforces).
 */

export type ContentTone =
  | "professional"
  | "conversational"
  | "data_driven"
  | "witty"
  | "inspirational"
  | "playful"
  | "authoritative";

export type ContentLength =
  | "twitter_280"
  | "instagram_2200"
  | "reddit_long"
  | "blog_800"
  | "blog_1500"
  | "short"
  | "medium"
  | "long";

export type HashtagStrategy = "minimal" | "topical" | "aggressive" | "none";

export type ContentLanguage = "ko" | "en" | "ja" | "zh";

export interface ContentPreset {
  id: string;
  workspaceId: string;
  name: string;
  isDefault: boolean;
  tone: ContentTone | null;
  voice: string | null;
  targetLength: ContentLength | null;
  language: ContentLanguage;
  hashtagStrategy: HashtagStrategy | null;
  doNotUse: string | null;
  referenceExamples: Array<{ snippet: string; whyGood?: string }> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PresetInput {
  name: string;
  isDefault?: boolean;
  tone?: ContentTone | null;
  voice?: string | null;
  targetLength?: ContentLength | null;
  language?: ContentLanguage;
  hashtagStrategy?: HashtagStrategy | null;
  doNotUse?: string | null;
  referenceExamples?: Array<{ snippet: string; whyGood?: string }> | null;
}

function rowToPreset(r: {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  tone: string | null;
  voice: string | null;
  target_length: string | null;
  language: string;
  hashtag_strategy: string | null;
  do_not_use: string | null;
  reference_examples: unknown;
  created_at: string;
  updated_at: string;
}): ContentPreset {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    isDefault: r.is_default,
    tone: r.tone as ContentTone | null,
    voice: r.voice,
    targetLength: r.target_length as ContentLength | null,
    language: (r.language || "ko") as ContentLanguage,
    hashtagStrategy: r.hashtag_strategy as HashtagStrategy | null,
    doNotUse: r.do_not_use,
    referenceExamples: Array.isArray(r.reference_examples)
      ? (r.reference_examples as Array<{ snippet: string; whyGood?: string }>)
      : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listPresets(workspaceId: string): Promise<ContentPreset[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("mrai_content_presets")
    .select(
      "id, workspace_id, name, is_default, tone, voice, target_length, language, hashtag_strategy, do_not_use, reference_examples, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`list presets: ${error.message}`);
  return (data ?? []).map(rowToPreset);
}

export async function getDefaultPreset(
  workspaceId: string,
): Promise<ContentPreset | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("mrai_content_presets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .maybeSingle();
  return data ? rowToPreset(data) : null;
}

export async function createPreset(
  workspaceId: string,
  input: PresetInput,
): Promise<ContentPreset> {
  const admin = createServiceClient();
  // If this is being created as default, clear any previous default
  // first (partial unique index would otherwise reject).
  if (input.isDefault) {
    await admin
      .from("mrai_content_presets")
      .update({ is_default: false })
      .eq("workspace_id", workspaceId)
      .eq("is_default", true);
  }
  const { data, error } = await admin
    .from("mrai_content_presets")
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      is_default: input.isDefault ?? false,
      tone: input.tone ?? null,
      voice: input.voice ?? null,
      target_length: input.targetLength ?? null,
      language: input.language ?? "ko",
      hashtag_strategy: input.hashtagStrategy ?? null,
      do_not_use: input.doNotUse ?? null,
      reference_examples: input.referenceExamples ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`create preset: ${error?.message}`);
  return rowToPreset(data);
}

export async function updatePreset(
  workspaceId: string,
  presetId: string,
  input: Partial<PresetInput>,
): Promise<ContentPreset> {
  const admin = createServiceClient();
  if (input.isDefault) {
    await admin
      .from("mrai_content_presets")
      .update({ is_default: false })
      .eq("workspace_id", workspaceId)
      .eq("is_default", true)
      .neq("id", presetId);
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.isDefault !== undefined) patch.is_default = input.isDefault;
  if (input.tone !== undefined) patch.tone = input.tone;
  if (input.voice !== undefined) patch.voice = input.voice;
  if (input.targetLength !== undefined) patch.target_length = input.targetLength;
  if (input.language !== undefined) patch.language = input.language;
  if (input.hashtagStrategy !== undefined) patch.hashtag_strategy = input.hashtagStrategy;
  if (input.doNotUse !== undefined) patch.do_not_use = input.doNotUse;
  if (input.referenceExamples !== undefined) patch.reference_examples = input.referenceExamples;

  const { data, error } = await admin
    .from("mrai_content_presets")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", presetId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`update preset: ${error?.message}`);
  return rowToPreset(data);
}

export async function deletePreset(
  workspaceId: string,
  presetId: string,
): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("mrai_content_presets")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", presetId);
  if (error) throw new Error(`delete preset: ${error.message}`);
}
