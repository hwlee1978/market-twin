import { createServiceClient } from "@/lib/supabase/server";
import {
  ONBOARDING_STEPS,
  getStep,
  type OnboardingStep,
  type OnboardingStepId,
  type OnboardingState,
} from "./onboarding-spec";

export {
  ONBOARDING_STEPS,
  getStep,
  type OnboardingStep,
  type OnboardingStepId,
  type OnboardingState,
};

/**
 * Server-side helpers for the guided onboarding interview. The step
 * catalog itself lives in onboarding-spec.ts (no server imports) so
 * client components can render it without dragging next/headers into
 * the browser bundle.
 */

/**
 * Inspect both workspaces.mrai_onboarded_at and mrai_memories.onboarding_step
 * to figure out where the user is. Resume rules:
 *   - If onboarded_at is set → completed, currentStep = null.
 *   - Otherwise the next un-answered step (in canonical order) is current.
 *   - If all 8 are answered but onboarded_at isn't set, currentStep = null
 *     and the UI shows the "Complete" screen.
 */
export async function getOnboardingState(workspaceId: string): Promise<OnboardingState> {
  const supabase = createServiceClient();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("mrai_onboarded_at")
    .eq("id", workspaceId)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("mrai_memories")
    .select("onboarding_step")
    .eq("workspace_id", workspaceId)
    .not("onboarding_step", "is", null);

  const answered = new Set<string>(
    (rows ?? []).map((r: { onboarding_step: string | null }) => r.onboarding_step as string),
  );
  const answeredSteps = ONBOARDING_STEPS
    .filter((s) => answered.has(s.id))
    .map((s) => s.id);

  const completedAt = (ws?.mrai_onboarded_at as string | null) ?? null;
  const completed = Boolean(completedAt);

  let currentStep: OnboardingStep | null = null;
  if (!completed) {
    currentStep = ONBOARDING_STEPS.find((s) => !answered.has(s.id)) ?? null;
  }

  return {
    completed,
    completedAt,
    totalSteps: ONBOARDING_STEPS.length,
    answeredSteps,
    currentStep,
  };
}

/**
 * Persist (upsert) one step's answer. Strips whitespace; rejects empty
 * answers for required steps (returns { skipped: true } if optional & empty).
 */
export async function saveStepAnswer(input: {
  workspaceId: string;
  userId: string;
  stepId: OnboardingStepId;
  answer: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const step = getStep(input.stepId);
  if (!step) return { ok: false, error: "unknown_step" };

  const trimmed = input.answer.trim();
  if (!trimmed) {
    if (step.required) return { ok: false, error: "required" };
    return upsertMemory({
      workspaceId: input.workspaceId,
      userId: input.userId,
      step,
      body: "(건너뜀)",
    });
  }

  return upsertMemory({
    workspaceId: input.workspaceId,
    userId: input.userId,
    step,
    body: trimmed,
  });
}

async function upsertMemory(input: {
  workspaceId: string;
  userId: string;
  step: OnboardingStep;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Manual upsert: Supabase's .upsert() with onConflict requires a real
  // UNIQUE CONSTRAINT, but our (workspace_id, onboarding_step) uniqueness
  // is enforced by a PARTIAL unique index (so NULL onboarding_step rows —
  // i.e. normal user memories — don't collide). PostgREST won't accept a
  // partial index for ON CONFLICT, so we do the select-then-write dance
  // by hand. Concurrent double-submits on the same step are guarded by
  // the unique index throwing 23505 on the insert path; we treat that as
  // success and recurse to update.
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("mrai_memories")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("onboarding_step", input.step.id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("mrai_memories")
      .update({
        kind: input.step.memoryKind,
        title: input.step.memoryTitle,
        body: input.body,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from("mrai_memories").insert({
    workspace_id: input.workspaceId,
    kind: input.step.memoryKind,
    title: input.step.memoryTitle,
    body: input.body,
    created_by: input.userId,
    onboarding_step: input.step.id,
  });
  if (error) {
    // Race: another request beat us. Re-read the row and update it.
    if ((error as { code?: string }).code === "23505") {
      return upsertMemory(input);
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function markOnboardingComplete(workspaceId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("workspaces")
    .update({ mrai_onboarded_at: new Date().toISOString() })
    .eq("id", workspaceId);
}

/**
 * Dev/admin helper: wipes onboarding memories + clears completed_at so the
 * interview restarts from step 1.
 */
export async function resetOnboarding(workspaceId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("mrai_memories")
    .delete()
    .eq("workspace_id", workspaceId)
    .not("onboarding_step", "is", null);
  await supabase
    .from("workspaces")
    .update({ mrai_onboarded_at: null })
    .eq("id", workspaceId);
}
