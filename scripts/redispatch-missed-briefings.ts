/**
 * One-off redispatch script — resends any briefing that has NO
 * matching row in mrai_dispatches yet. Run after the cron dispatch
 * fix so users (Le Mouton in particular) get the 5/25 + 5/26
 * briefings that the broken fire-and-forget path skipped.
 *
 * Idempotent — only sends briefings without existing dispatch rows.
 * Re-runs are safe.
 */
import { Client } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Find briefings without a successful dispatch
  const { rows } = await client.query<{
    id: string;
    workspace_id: string;
    locale: string;
    content_md: string;
    generated_at: string;
    workspace_name: string;
  }>(
    `select b.id, b.workspace_id, b.locale, b.content_md, b.generated_at,
            w.name as workspace_name
     from public.mrai_briefings b
     join public.workspaces w on w.id = b.workspace_id
     where not exists (
       select 1 from public.mrai_dispatches d
       where d.source_type = 'briefing' and d.source_id = b.id and d.status = 'sent'
     )
     order by b.generated_at desc`,
  );

  console.log(`Found ${rows.length} briefings without successful dispatch:\n`);
  for (const b of rows) {
    console.log(
      `  ${b.generated_at} · [${b.workspace_id.slice(0, 8)}] ${b.workspace_name} · ${b.locale} · ${b.id}`,
    );
  }

  await client.end();

  if (rows.length === 0) {
    console.log("\nNothing to redispatch. Done.");
    return;
  }

  if (!process.argv.includes("--apply")) {
    console.log("\nDRY-RUN. Add --apply to redispatch.");
    return;
  }

  // Re-call the dispatch logic. Import inline so the script can be
  // run standalone (not via the route bundle).
  const { dispatchToAllChannels } = await import("@/lib/mrai/channels");

  for (const b of rows) {
    const title =
      b.locale === "en"
        ? `Mr. AI Briefing · ${new Date(b.generated_at).toLocaleDateString("en-US")} (resent)`
        : `Mr. AI 브리핑 · ${new Date(b.generated_at).toLocaleDateString("ko-KR")} (재발송)`;
    try {
      const result = await dispatchToAllChannels({
        workspaceId: b.workspace_id,
        event: "briefing",
        payload: { title, body: b.content_md },
        sourceId: b.id,
      });
      console.log(
        `  ✓ ${b.id.slice(0, 8)} · ${b.workspace_name} → ${result.length} channels`,
      );
    } catch (e) {
      console.error(`  ✗ ${b.id.slice(0, 8)} · ${b.workspace_name}:`, e);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
