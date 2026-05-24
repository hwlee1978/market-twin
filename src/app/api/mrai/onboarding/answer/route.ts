import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  saveStepAnswer,
  getOnboardingState,
  markOnboardingComplete,
  ONBOARDING_STEPS,
  type OnboardingStepId,
} from "@/lib/mrai/onboarding";

export const dynamic = "force-dynamic";

const Body = z.object({
  stepId: z.enum([
    "business",
    "scale",
    "products",
    "channels",
    "competitors",
    "executive",
    "decisions",
    "kpi",
  ]),
  answer: z.string().max(4000),
});

/**
 * POST /api/mrai/onboarding/answer
 *
 * Saves one step's answer to mrai_memories (upsert keyed on
 * (workspace_id, onboarding_step) so re-answering is safe). Auto-marks
 * the workspace as onboarded when the last required step is answered.
 *
 * Returns the next un-answered step so the UI can transition without
 * a second status round-trip.
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await saveStepAnswer({
    workspaceId: ctx.workspaceId,
    userId: user.id,
    stepId: parsed.data.stepId as OnboardingStepId,
    answer: parsed.data.answer,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Re-read state so the response reflects the just-written memory.
  const state = await getOnboardingState(ctx.workspaceId);

  // Auto-complete when every step has been answered (required or skipped).
  const allDone = state.answeredSteps.length >= ONBOARDING_STEPS.length;
  if (allDone && !state.completed) {
    await markOnboardingComplete(ctx.workspaceId);
    const final = await getOnboardingState(ctx.workspaceId);
    return NextResponse.json({ ok: true, state: final });
  }

  return NextResponse.json({ ok: true, state });
}
