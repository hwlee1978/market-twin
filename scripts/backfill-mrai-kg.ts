/**
 * Backfill the Knowledge Graph from existing mrai_memories.
 *
 * Idempotent — KG upsert dedupes by (workspace, lower(name)) and bumps
 * weight on repeat relations. Re-runnable safely.
 *
 * Usage:
 *   npm run backfill:mrai-kg
 */
import { createClient } from "@supabase/supabase-js";
import { saveKgFromTurn } from "../src/lib/mrai/kg";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Process per-workspace so the existing-entities prompt context stays
  // scoped. Group memories by workspace.
  const { data: rows, error } = await supabase
    .from("mrai_memories")
    .select("id, workspace_id, title, body")
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) throw new Error(`fetch memories: ${error.message}`);

  const memories = (rows ?? []) as Array<{ id: string; workspace_id: string; title: string; body: string }>;
  console.log(`backfilling KG from ${memories.length} memories`);

  let totalEntities = 0;
  let totalRelations = 0;
  for (const m of memories) {
    try {
      // Feed memory as if it were an assistant reply; user message blank.
      // The extractor doesn't care about role — it just needs the text.
      const result = await saveKgFromTurn({
        workspaceId: m.workspace_id,
        userMessage: m.title,
        assistantReply: m.body,
        sourceMemoryId: m.id,
      });
      totalEntities += result.entities;
      totalRelations += result.relations;
      console.log(`  ${m.title.slice(0, 40)} → +${result.entities}e ${result.relations}r`);
    } catch (e) {
      console.error(`  ${m.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`\n✓ done. extracted ${totalEntities} entities · ${totalRelations} relations across ${memories.length} memories`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
