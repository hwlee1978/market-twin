/**
 * Backfill historical LLM usage rows from existing tables. The
 * llm_usage_log table only captures NEW calls after instrumentation
 * landed (2026-05-26). Past activity is recovered as follows:
 *
 *   1. simulations table — has ACCURATE per-sim total_input_tokens /
 *      total_output_tokens / total_cost_cents (populated by the
 *      runner since migration 0016). One row per simulation. Same
 *      authoritative source `/admin/billing` already uses.
 *   2. mrai_messages (assistant role) — no token counts stored, so
 *      we use a flat per-message estimate (~$0.015 / 3k input +
 *      500 output Sonnet turn).
 *   3. mrai_briefings — has ACTUAL input_tokens / output_tokens
 *      stored on the row; uses those when present, falls back to
 *      $0.04 estimate.
 *
 * Idempotent — re-runnable. Each backfilled row carries
 * context.source_id (simulationId / messageId / briefingId); the
 * script SELECTs first to skip dupes.
 *
 * Rows are tagged with stage suffix "-historical" so they're
 * visually distinct from live-logged rows. Live instrumentation
 * (2026-05-26 onwards) writes the same table without the suffix.
 *
 * Usage:
 *   npm run backfill:llm-usage             # dry-run
 *   npm run backfill:llm-usage -- --apply  # actually insert
 */
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

// Sonnet-class chat turn estimate — typical Mr.AI message handles
// ~3k input tokens (system + memories + history) and ~500 output
// tokens (the assistant reply). At $3/M input + $15/M output that's
// $0.009 + $0.0075 ≈ $0.017. Round to $0.015.
const MRAI_CHAT_COST_USD = 0.015;

// Daily briefing fallback when actual tokens missing — ~5k input +
// ~1.5k output → ~$0.0375.
const MRAI_BRIEFING_COST_USD = 0.04;

/** Back-calculate plausible token counts from a USD cost at Sonnet
 *  pricing + a 4:1 input:output ratio. */
function tokensFromCost(costUsd: number): { input: number; output: number } {
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

  // ─── 0. Clean up the bad earlier backfill ────────────────────────
  // The first pass of this script wrote one row per ENSEMBLE with a
  // coarse tier-based USD estimate (hypothesis $3 / decision $25 /
  // deep $60 / deep_pro $90). That's 3-4× too high vs the per-sim
  // truth in simulations.total_cost_cents. Delete those rows first
  // so this re-run produces accurate numbers.
  console.log("[backfill] step 0: cleaning up prior coarse backfill (ensemble-historical-*)");
  if (APPLY) {
    const del = await client.query(
      `delete from public.llm_usage_log where stage like 'ensemble-historical-%'`,
    );
    console.log(`  deleted ${del.rowCount} rows\n`);
  } else {
    const { rows: priorCount } = await client.query<{ count: string }>(
      `select count(*)::text from public.llm_usage_log where stage like 'ensemble-historical-%'`,
    );
    console.log(`  would delete ${priorCount[0]?.count ?? "0"} prior rows\n`);
  }

  let totalInserted = 0;
  let totalSkipped = 0;

  // ─── 1. Simulations (authoritative) ──────────────────────────────
  console.log("[backfill] step 1: simulations (with real token + cost data)");
  const { rows: simRows } = await client.query<{
    id: string;
    workspace_id: string;
    status: string;
    model_provider: string | null;
    total_input_tokens: number | null;
    total_output_tokens: number | null;
    total_cost_cents: number | null;
    completed_at: string | null;
    started_at: string | null;
  }>(
    `select id, workspace_id, status, model_provider,
            total_input_tokens, total_output_tokens, total_cost_cents,
            completed_at, started_at
     from public.simulations
     where total_cost_cents is not null`,
  );
  console.log(`  found ${simRows.length} simulations with cost data`);

  for (const s of simRows) {
    const { rows: existing } = await client.query(
      `select 1 from public.llm_usage_log
       where context->>'source_id' = $1 and stage like 'sim-historical%'
       limit 1`,
      [s.id],
    );
    if (existing.length > 0) {
      totalSkipped += 1;
      continue;
    }
    const ts = s.completed_at ?? s.started_at ?? new Date().toISOString();
    const provider = (s.model_provider ?? "anthropic").toLowerCase();
    const input = s.total_input_tokens ?? 0;
    const output = s.total_output_tokens ?? 0;
    const cents = s.total_cost_cents ?? 0;
    const costUsd = Math.round((cents / 100) * 1_000_000) / 1_000_000;
    // Status tag in stage so cancelled/failed/completed sims are
    // separable on the dashboard (mirrors /admin/billing's "wasted
    // spend" KPI).
    const statusTag =
      s.status === "completed"
        ? "completed"
        : s.status === "cancelled" || s.status === "failed"
          ? "wasted"
          : s.status;
    if (APPLY) {
      await client.query(
        `insert into public.llm_usage_log
          (workspace_id, provider, model, stage, input_tokens, output_tokens, cost_usd, context, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          s.workspace_id,
          provider,
          "actual-from-sim",
          `sim-historical-${statusTag}`,
          input,
          output,
          costUsd,
          JSON.stringify({
            source_id: s.id,
            source: "simulations",
            sim_status: s.status,
          }),
          ts,
        ],
      );
    }
    totalInserted += 1;
  }
  const simInserted = totalInserted;
  console.log(
    `  simulations → inserted ${simInserted}, skipped ${totalSkipped} (dupes)\n`,
  );

  // ─── 2. Mr.AI assistant messages ─────────────────────────────────
  console.log("[backfill] step 2: mrai_messages (assistant role)");
  const ensSkip = totalSkipped;
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
    `  mrai_messages → inserted ${totalInserted - simInserted}, skipped ${totalSkipped - ensSkip} (dupes)\n`,
  );

  // ─── 3. Mr.AI briefings (uses real tokens when present) ──────────
  console.log("[backfill] step 3: mrai_briefings");
  const msgIns = totalInserted;
  const msgSkip = totalSkipped;

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
    const actualInput = b.input_tokens ?? null;
    const actualOutput = b.output_tokens ?? null;
    let input: number;
    let output: number;
    let cost: number;
    let estimated = false;
    if (actualInput != null && actualOutput != null && actualInput > 0) {
      input = actualInput;
      output = actualOutput;
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
