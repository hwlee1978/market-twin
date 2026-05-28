import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const ws = await c.query<{ id: string; name: string }>(
      `select id, name from public.workspaces where name ilike '%mouton%' or name = '르무통' limit 1`,
    );
    if (ws.rows.length === 0) { console.log("no workspace"); return; }
    const w = ws.rows[0];
    console.log("Workspace:", w);

    const srcs = await c.query(
      `select source_type, url, label, brand_filter, enabled, memories_emitted, last_fetched_at
         from public.mrai_crawl_sources
        where workspace_id = $1
        order by source_type, created_at`,
      [w.id],
    );
    console.log(`\n=== CRAWL SOURCES (${srcs.rows.length}) ===`);
    console.table(srcs.rows);

    const briefs = await c.query(
      `select id, generated_at, locale, length(content_md) as md_chars
         from public.mrai_briefings
        where workspace_id = $1
        order by generated_at desc
        limit 6`,
      [w.id],
    );
    console.log(`\n=== RECENT BRIEFINGS (${briefs.rows.length}) ===`);
    console.table(briefs.rows);

    const mems = await c.query(
      `select kind, title, source_type, created_at
         from public.mrai_memories
        where workspace_id = $1
          and (title ilike '%르무통%' or body ilike '%르무통%')
        order by created_at desc
        limit 20`,
      [w.id],
    );
    console.log(`\n=== MEMORIES MENTIONING 르무통 (${mems.rows.length}) ===`);
    console.table(mems.rows);
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
