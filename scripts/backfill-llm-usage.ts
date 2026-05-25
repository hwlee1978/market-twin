/**
 * Backfill historical LLM usage rows from existing tables. The
 * llm_usage_log table only captures NEW calls after instrumentation
 * landed (2026-05-26). Past activity isn't directly recoverable —
 * the original token / cost counts weren't persisted — but we can
 * ESTIMATE per source so the dashboard reflects historical patterns:
 *
 *   - ensembles: per-tier cost estimate (hypothesis ~$3, decision
 *     ~$25, deep ~$60, etc.), one row per completed ensemble. Date
 *     = completed_at. Provider = primary in llm_providers[].
 *   - mrai_messages: ~$0.01 per assistant message (Sonnet-class chat
 *     turn, ~3k input + ~500 output tokens). One row per assistant
 *     message. Date = created_at.
 *   - mrai_briefings: ~$0.05 per briefing. One row per briefing.
 *
 * Rows are tagged with stage suffix "-historical" so they're visually
 * distinct from live-logged rows. Workspace, provider, model are
 * filled in best-effort. Token counts back-calculated from cost via
 * Sonnet pricing ($3/M input + $15/M output) at a 4:1 input:output
 * ratio, giving plausible token shapes for the dashboard chart.
 *
 * Idempotent — re-runnable. Checks if a historical row already exists
 * per source row (ensembleId / messageId / briefingId stored in
 * context.source_id) and skips. Delete + re-run if you want to
 * recompute with different estimates.
 *
 * Usage:
 *   npm run backfill:llm-usage             # dry-run (logs counts, no insert)
 *   npm run backfill:llm-usage -- --apply  # actually insert
 */
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

// Tier cost estimates in USD. Reflects v11 benchmark pricing
// (2026-05-20): decision ≈ 6 sims × $4 = $24, deep_pro = 25 sims ×
// ~$3.6 = $90. Rough — actual varies ±30% with persona count.
const TIER_COST_USD: Record<string, number> = {
  hypothesis: 3,
  decision: 25,
  decision_plus: 45,
  deep: 60,
  deep_pro: 90,
};

// Sonnet-class chat turn estimate — typical Mr.AI message handles
// ~3k input tokens (system + memories + history) and ~500 output
// tokens (the assistant reply). At $3/M input + $15/M output that's
// $0.009 + $0.0075 ≈ $0.017. Round to $0.015.
const MRAI_CHAT_COST_USD = 0.015;

// Daily briefing has ~5k input + ~1.5k output → ~$0.0375.
const MRAI_BRIEFING_COST_USD = 0.04;

/** Back-calculate plausible token counts from a USD cost at Sonnet
 *  pricing + a 4:1 input:output ratio. Lets the dashboard show
 *  non-zero token bars even on historical rows. */
function tokensFromCost(costUsd: number): { input: number; output: number } {
  // cost = (input/1M)*3 + (output/1M)*15 ; output = input/4
  //      = input * (3 + 15/4) / 1M
  //      = input * 6.75 / 1M
  //  → input = cost * 1M / 6.75
  const input = Math.round((costUsd * 1_000_000) / 6.75);
  const output = Math.round(input / 4);
  return { input, output };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL required (use --env-file=.env.local)");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(`[backfill] mode = ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  let totalInserted = 0;
  let totalSkipped = 0;

  // ─── 1. Ensembles ────────────────────────────────────────────────
  console.log("[backfill] step 1: ensembles");
  const { rows: ensRows } = await client.query<{
    id: string;
    workspace_id: string;
    tier: string;
    llm_providers: string[];
    completed_at: string | null;
    created_at: string;
  }>(
    `select id, workspace_id, tier, llm_providers, completed_at, created_at
     from public.ensembles
     where status = 'completed'`,
  );
  console.log(`  found ${ensRows.length} completed ensembles`);

  for (const e of ensRows) {
    const cost = TIER_COST_USD[e.tier] ?? 30;
    const ts = e.completed_at ?? e.created_at;
    const provider = e.llm_providers?.[0] ?? "anthropic";
    const { input, output } = tokensFromCost(cost);
    const stage = `ensemble-historical-${e.tier}`;

    // Skip if already backfilled (idempotent)
    const { rows: existing } = await client.query(
      `select 1 from public.llm_usage_log
       where context->>'source_id' = $1 and stage like 'ensemble-historical%'
       limit 1`,
      [e.id],
    );
    if (existing.length > 0) {
      totalSkipped += 1;
      continue;
    }

    if (APPLY) {
      await client.query(
        `insert into public.llm_usage_log
          (workspace_id, provider, model, stage, input_tokens, output_tokens, cost_usd, context, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          e.workspace_id,
          provider,
          "estimated-tier",
          stage,
          input,
          output,
          cost,
          JSON.stringify({ source_id: e.id, source: "ensembles", tier: e.tier, estimated: true }),
          ts,
        ],
      );
    }
    totalInserted += 1;
  }
  console.log(
    `  ensembles → inserted ${totalInserted}, skipped ${totalSkipped} (dupes)\n`,
  );

  // ─── 2. Mr.AI assistant messages ─────────────────────────────────
  console.log("[backfill] step 2: mrai_messages (assistant role)");
  const ensIns = totalInserted;
  const ensSkip = totalSkipped;

  // Some workspaces may not have mrai_messages table populated; try
  // first to detect schema.
  const { rows: msgRows } = await client.query<{
    id: string;
    workspace_id: string;
    created_at: string;
  }>(
    `select m.id, c.workspace_id, m.created_at
     from public.mrai_messages m
     join public.mrai_conversations c on c.id = m.conversation_id
     where m.role = 'assistant'`,
  );
  console.log(`  found ${msgRows.length} assistant messages`);

  for (const m of msgRows) {
    const { rows: existing } = await client.query(
      `select 1 from public.llm_usage_log
       where context->>'source_id' = $1 and stage = 'mrai-chat-historical'
       limit 1`,
      [m.id],
    );
    if (existing.length > 0) {
      totalSkipped += 1;
      continue;
    }
    const { input, output } = tokensFromCost(MRAI_CHAT_COST_USD);
    if (APPLY) {
      await client.query(
        `insert into public.llm_usage_log
          (workspace_id, provider, model, stage, input_tokens, output_tokens, cost_usd, context, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          m.workspace_id,
          "anthropic",
          "estimated-sonnet",
          "mrai-chat-historical",
          input,
          output,
          MRAI_CHAT_COST_USD,
          JSON.stringify({ source_id: m.id, source: "mrai_messages", estimated: true }),
          m.created_at,
        ],
      );
    }
    totalInserted += 1;
  }
  console.log(
    `  mrai_messages → inserted ${totalInserted - ensIns}, skipped ${totalSkipped - ensSkip} (dupes)\n`,
  );

  // ─── 3. Mr.AI briefings ──────────────────────────────────────────
  console.log("[backfill] step 3: mrai_briefings");
  const msgIns = totalInserted;
  const msgSkip = totalSkipped;

  // Briefings table stores actual input/output token counts — use
  // them directly instead of estimating (more accurate than the
  // ensemble/messages fallbacks above).
  const { rows: briefRows } = await client.query<{
    id: string;
    workspace_id: string;
    generated_at: string;
    input_tokens: number | null;
    output_tokens: number | null;
  }>(
    `select id, workspace_id, generated_at, input_tokens, output_tokens
     from public.mrai_briefings`,
  );
  console.log(`  found ${briefRows.length} briefings`);

  for (const b of briefRows) {
    const { rows: existing } = await client.query(
      `select 1 from public.llm_usage_log
       where context->>'source_id' = $1 and stage = 'mrai-briefing-historical'
       limit 1`,
      [b.id],
    );
    if (existing.length > 0) {
      totalSkipped += 1;
      continue;
    }
    // Prefer actual tokens when stored; otherwise estimate.
    const actualInput = b.input_tokens ?? null;
    const actualOutput = b.output_tokens ?? null;
    let input: number;
    let output: number;
    let cost: number;
    let estimated = false;
    if (actualInput != null && actualOutput != null && actualInput > 0) {
      input = actualInput;
      output = actualOutput;
      // Sonnet pricing
      cost =
        Math.round(((input / 1_000_000) * 3 + (output / 1_000_000) * 15) * 1_000_000) /
        1_000_000;
    } else {
      const est = tokensFromCost(MRAI_BRIEFING_COST_USD);
      input = est.input;
      output = est.output;
      cost = MRAI_BRIEFING_COST_USD;
      estimated = true;
    }
    if (APPLY) {
      await client.query(
        `insert into public.llm_usage_log
          (workspace_id, provider, model, stage, input_tokens, output_tokens, cost_usd, context, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          b.workspace_id,
          "anthropic",
          estimated ? "estimated-sonnet" : "claude-sonnet (actual tokens)",
          "mrai-briefing-historical",
          input,
          output,
          cost,
          JSON.stringify({
            source_id: b.id,
            source: "mrai_briefings",
            estimated,
          }),
          b.generated_at,
        ],
      );
    }
    totalInserted += 1;
  }
  console.log(
    `  mrai_briefings → inserted ${totalInserted - msgIns}, skipped ${totalSkipped - msgSkip} (dupes)\n`,
  );

  await client.end();

  console.log(
    `\n[backfill] DONE — total inserted ${totalInserted}, skipped ${totalSkipped}`,
  );
  if (!APPLY) {
    console.log("\n  This was a DRY-RUN. Add --apply to actually insert.");
  }
}

main().catch((err) => {
  console.error("[backfill] FATAL:", err);
  process.exit(1);
});
