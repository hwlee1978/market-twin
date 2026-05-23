/**
 * One-shot backfill: embed all mrai_memories rows that don't have an
 * embedding yet. Idempotent — re-runnable after partial failure.
 *
 * Usage:
 *   npm run backfill:mrai-embeddings
 *   (requires DATABASE_URL + OPENAI_API_KEY in .env.local)
 *
 * Batches of 64 to stay well under OpenAI's per-request token cap.
 */
import { createClient } from "@supabase/supabase-js";
import { embedTexts } from "../src/lib/mrai/embedding";

const BATCH_SIZE = 64;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Loop until no more rows without embedding.
  let totalBackfilled = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("mrai_memories")
      .select("id, title, body")
      .is("embedding", null)
      .limit(BATCH_SIZE);
    if (error) throw new Error(`fetch: ${error.message}`);
    const rows = (data ?? []) as Array<{ id: string; title: string; body: string }>;
    if (rows.length === 0) break;

    const inputs = rows.map((r) => `${r.title} :: ${r.body}`);
    let embeddings: number[][];
    try {
      embeddings = await embedTexts(inputs);
    } catch (e) {
      console.error("embed batch failed; stopping:", e);
      throw e;
    }

    // Update each row individually — supabase JS doesn't have a bulk
    // upsert that updates a single column without rewriting unrelated
    // fields. N updates per batch is acceptable since each is a tiny
    // primary-key write.
    for (let i = 0; i < rows.length; i++) {
      const { error: uErr } = await supabase
        .from("mrai_memories")
        .update({ embedding: embeddings[i] })
        .eq("id", rows[i].id);
      if (uErr) {
        console.error(`update ${rows[i].id} failed:`, uErr.message);
      } else {
        totalBackfilled++;
      }
    }
    console.log(`backfilled ${totalBackfilled} so far`);
  }
  console.log(`✓ done. backfilled ${totalBackfilled} memories`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
