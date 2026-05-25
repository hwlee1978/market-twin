import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { runAutoSeed } from "@/lib/mrai/auto-seed";
import { getOnboardingState } from "@/lib/mrai/onboarding";
import { withLLMContext } from "@/lib/llm-context";

export const dynamic = "force-dynamic";
// Generous so 5 Tavily searches + 1 Sonnet pass can run sequentially
// without Vercel killing the function. Typical wall-clock is 25-45s.
export const maxDuration = 120;

const Body = z.object({
  companyName: z.string().trim().min(2).max(120),
  websiteUrl: z.string().trim().url().max(400).optional(),
  extraContext: z.string().trim().max(6000).optional(),
});

/**
 * POST /api/mrai/onboarding/auto-seed
 *
 * Runs the auto-seed orchestrator for the caller's active workspace.
 * Returns the draft answers + post-run onboarding state so the UI can
 * transition into "review mode" without a second status round-trip.
 *
 * Cost note: ~$0.10-0.30 per call (we eat it for v0.1). When usage
 * scales we'll either gate behind a one-per-workspace limit or shift
 * cost to a paid plan tier — the cost field is already in the response
 * so the UI can surface it.
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

  try {
    const result = await withLLMContext(
      { workspaceId: ctx.workspaceId, stageLabel: "mrai-auto-seed" },
      () =>
        runAutoSeed({
          workspaceId: ctx.workspaceId,
          userId: user.id,
          companyName: parsed.data.companyName,
          websiteUrl: parsed.data.websiteUrl,
          extraContext: parsed.data.extraContext,
        }),
    );

    const state = await getOnboardingState(ctx.workspaceId);
    return NextResponse.json({
      ok: true,
      answers: result.answers,
      sourceUrls: result.sourceUrls,
      costEstimateUsd: result.costEstimateUsd,
      savedSteps: result.savedSteps,
      errors: result.errors,
      state,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "auto_seed_failed";
    console.error("[mrai/onboarding/auto-seed]", msg);
    return NextResponse.json({ error: "auto_seed_failed", detail: msg }, { status: 500 });
  }
}
