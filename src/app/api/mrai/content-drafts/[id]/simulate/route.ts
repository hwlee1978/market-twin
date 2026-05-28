import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  aggregateReactions,
  runPersonaReactor,
  type PersonaForReaction,
} from "@/lib/mrai/content/reactor";

/**
 * Generate a diverse persona pool for a market via Claude Haiku and
 * insert into the personas table. Returns the inserted rows so the
 * caller can immediately use them in this same request.
 *
 * Called when simulate finds an empty pool — prevents the chicken-and-
 * egg where the user couldn't run their first content simulation
 * because no personas existed yet for the market.
 */
async function seedPersonasForMarket(
  workspaceId: string,
  marketCountry: string,
  count: number,
): Promise<PersonaForReaction[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system:
      "Generate a diverse synthetic persona pool for a marketing audience " +
      "simulation. Output JSON ONLY (no preamble, no markdown). Schema:\n" +
      '{ "personas": [\n' +
      '  { "age_range": "25-29" | "30-34" | "35-39" | "40-49" | "50-59" | "20-24" | "18-24",\n' +
      '    "gender": "female" | "male" | "non-binary",\n' +
      '    "income_band": "low" | "median" | "above-median" | "high",\n' +
      '    "profession": "<specific role in target country language>",\n' +
      '    "base_profession": "<broad category in English: designer | engineer | marketer | student | freelancer | retail | service | healthcare | finance | educator | creative | manager>",\n' +
      '    "interests": ["...", "...", "..."],\n' +
      '    "purchase_style": "research-heavy" | "impulse" | "value-driven" | "brand-loyal" | "trend-follower",\n' +
      '    "price_sensitivity": "low" | "moderate" | "high"\n' +
      "  }, ...\n" +
      "] }\n" +
      "Coverage rules:\n" +
      "- Spread across age bands (no more than 5 per band).\n" +
      "- Mix genders ~50/50, with ~5% non-binary.\n" +
      "- Realistic profession distribution for the country.\n" +
      "- Interests 3-5 per persona in the country's native language.",
    messages: [
      {
        role: "user",
        content: `Generate ${count} diverse personas representing the marketing audience in country code ${marketCountry}. Make them feel like real distinct people, not stereotypes.`,
      },
    ],
  });
  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("")
    .trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("LLM returned no JSON");
  type GenPersona = {
    age_range: string;
    gender: string;
    income_band: string;
    profession: string;
    base_profession: string;
    interests: string[];
    purchase_style: string;
    price_sensitivity: string;
  };
  const parsed = JSON.parse(m[0]) as { personas?: GenPersona[] };
  const gen = (parsed.personas ?? []).slice(0, count);
  if (gen.length === 0) throw new Error("LLM returned empty personas array");

  // Insert via service role
  const svc = createServiceClient();
  const rows = gen.map((p) => ({
    workspace_id: workspaceId,
    age_range: p.age_range,
    gender: p.gender,
    country: marketCountry,
    income_band: p.income_band,
    profession: p.profession,
    base_profession: p.base_profession,
    interests: p.interests,
    purchase_style: p.purchase_style,
    price_sensitivity: p.price_sensitivity,
    locale: "ko",
  }));
  const { data: inserted, error: insErr } = await svc
    .from("personas")
    .insert(rows)
    .select(
      "id, age_range, gender, country, income_band, profession, base_profession, interests, purchase_style, price_sensitivity",
    );
  if (insErr) throw new Error(`personas insert: ${insErr.message}`);
  console.log(
    `[simulate/seed] ✓ inserted ${inserted?.length ?? 0} personas for ${marketCountry}`,
  );
  return (inserted ?? []) as PersonaForReaction[];
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const InputSchema = z.object({
  sampleSize: z.number().int().min(5).max(120).optional(),
  marketOverride: z.string().length(2).optional(),
  locale: z.enum(["ko", "en"]).optional(),
});

/**
 * POST /api/mrai/content-drafts/[id]/simulate
 *
 * Runs the persona-reactor against this draft. Samples N personas
 * matching the draft's channel market (or marketOverride), each
 * persona evaluates the content via LLM, the aggregator collapses to
 * rates + reaction_distribution + top quotes + segment breakdown.
 *
 * Persists:
 *   - 1 row in mrai_content_simulations (aggregate)
 *   - N rows in mrai_persona_reactions (per-persona drilldown)
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const sampleSize = parsed.data.sampleSize ?? 30;
  const locale = parsed.data.locale ?? "ko";

  // Load draft + channel
  const supabase = await createClient();
  const { data: draft, error: dErr } = await supabase
    .from("mrai_content_drafts")
    .select(
      `id, marketing_channel_id, campaign_label, variant_label, body_text,
       hashtags, cta_text, image_prompt, seo_title,
       channel:mrai_marketing_channels!marketing_channel_id(platform, handle, display_name, market_country)`,
    )
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (dErr || !draft) {
    return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  }

  const channelData = Array.isArray(draft.channel) ? draft.channel[0] : draft.channel;
  const market = parsed.data.marketOverride ?? channelData?.market_country ?? null;

  // Sample personas from the global pool (shared across workspaces as
  // of v0.1, see runner.ts shared-pool note), filtered to the target
  // market. We over-sample then shuffle in JS so the simulation isn't
  // biased to the lowest-use_count slice every time.
  let query = supabase
    .from("personas")
    .select(
      "id, age_range, gender, country, income_band, profession, base_profession, interests, purchase_style, price_sensitivity",
    )
    .limit(sampleSize * 3);
  if (market) query = query.eq("country", market);
  const { data: poolRows, error: pErr } = await query;
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  let pool = (poolRows ?? []) as PersonaForReaction[];

  // Auto-seed personas if the market pool is empty. Mr.AI's content
  // simulation needs at least some personas to evaluate against, and
  // there was previously a chicken-and-egg dead end where the user
  // could only get personas by running a full Market-Twin ensemble.
  if (pool.length === 0 && market) {
    console.log(
      `[simulate] empty pool for ${market}, auto-seeding ~30 personas`,
    );
    try {
      const seeded = await seedPersonasForMarket(
        wsCtx.workspaceId,
        market,
        30,
      );
      pool = seeded;
    } catch (e) {
      console.warn(
        "[simulate] auto-seed failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (pool.length === 0) {
    return NextResponse.json(
      {
        error: "no_personas_in_market",
        detail: `시장 ${market ?? "(전체)"}의 페르소나 풀이 비어있고 자동 시드도 실패했습니다. ANTHROPIC_API_KEY 확인하세요.`,
      },
      { status: 400 },
    );
  }
  // Fisher-Yates shuffle + take sampleSize
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const sample = pool.slice(0, Math.min(sampleSize, pool.length));

  // Run reactor
  const reactor = await runPersonaReactor({
    draft: {
      body_text: draft.body_text,
      hashtags: draft.hashtags ?? [],
      cta_text: draft.cta_text,
      image_prompt: draft.image_prompt,
      seo_title: draft.seo_title,
      campaign_label: draft.campaign_label,
      variant_label: draft.variant_label,
    },
    channel: {
      platform: channelData?.platform ?? "other",
      handle: channelData?.handle ?? "",
      display_name: channelData?.display_name ?? null,
      market_country: market,
    },
    personas: sample,
    locale,
  });

  // Aggregate
  const agg = aggregateReactions(reactor.reactions);

  // Persist — use service client for both tables (mrai_persona_reactions
  // has an insert-deny RLS policy that requires service-role).
  const svc = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1) aggregate row
  const inputCost = (reactor.inputTokens / 1_000_000) * 1.0; // Haiku 4.5 input $1/MTok
  const outputCost = (reactor.outputTokens / 1_000_000) * 5.0; // Haiku 4.5 output $5/MTok
  const llmCostUsd = Number((inputCost + outputCost).toFixed(4));

  const { data: simRow, error: sErr } = await svc
    .from("mrai_content_simulations")
    .insert({
      workspace_id: wsCtx.workspaceId,
      content_draft_id: id,
      marketing_channel_id: draft.marketing_channel_id,
      persona_sample_size: agg.persona_sample_size,
      sample_market: market,
      sample_demographics: {},
      like_rate: agg.like_rate,
      click_rate: agg.click_rate,
      share_rate: agg.share_rate,
      save_rate: agg.save_rate,
      comment_rate: agg.comment_rate,
      reaction_distribution: agg.reaction_distribution,
      top_positive_quotes: agg.top_positive_quotes,
      top_objection_quotes: agg.top_objection_quotes,
      segment_breakdown: agg.segment_breakdown,
      llm_cost_usd: llmCostUsd,
      llm_input_tokens: reactor.inputTokens,
      llm_output_tokens: reactor.outputTokens,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (sErr || !simRow) {
    return NextResponse.json(
      { error: sErr?.message ?? "sim_insert_failed" },
      { status: 500 },
    );
  }

  // 2) per-persona rows (chunked insert)
  if (reactor.reactions.length > 0) {
    const rows = reactor.reactions.map((r) => ({
      simulation_id: simRow.id,
      persona_id: r.persona_id,
      persona_summary: r.persona_summary,
      reaction: r.reaction,
      like_intent: r.like_intent,
      click_intent: r.click_intent,
      share_intent: r.share_intent,
      save_intent: r.save_intent,
      comment_intent: r.comment_intent,
      comment_text: r.comment_text,
      rejection_reason: r.rejection_reason,
      reaction_quote: r.reaction_quote,
    }));
    const { error: rErr } = await svc.from("mrai_persona_reactions").insert(rows);
    if (rErr) {
      // Aggregate row already saved — surface error but don't fail the response
      console.error("[reactor] persona_reactions insert failed:", rErr.message);
    }
  }

  return NextResponse.json({
    simulation: simRow,
    cost_usd: llmCostUsd,
    ms: reactor.ms,
  });
}
