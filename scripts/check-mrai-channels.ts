import { Client } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("─── workspaces ──────────────────────────────");
  const ws = await client.query(
    `select id, name from public.workspaces order by created_at`,
  );
  for (const w of ws.rows) {
    console.log(`  ${w.id.slice(0, 8)} · ${w.name}`);
  }

  console.log("\n─── mrai_channels (all rows) ────────────────");
  const ch = await client.query(
    `select id, workspace_id, channel_type, name, enabled, send_briefing,
            config, created_at
     from public.mrai_channels order by created_at desc`,
  );
  if (ch.rows.length === 0) {
    console.log("  (no channels configured)");
  } else {
    for (const c of ch.rows) {
      console.log(
        `  [${c.workspace_id.slice(0, 8)}] ${c.channel_type} · "${c.name}" · enabled=${c.enabled} · send_briefing=${c.send_briefing}`,
      );
      console.log(`    config: ${JSON.stringify(c.config)}`);
    }
  }

  console.log("\n─── mrai_briefings (latest 5) ───────────────");
  const br = await client.query(
    `select id, workspace_id, generated_at, locale,
            length(content_md) as body_len
     from public.mrai_briefings order by generated_at desc limit 5`,
  );
  for (const b of br.rows) {
    console.log(
      `  [${b.workspace_id.slice(0, 8)}] ${b.generated_at} · ${b.locale} · ${b.body_len} chars · id=${b.id.slice(0, 8)}`,
    );
  }

  console.log("\n─── mrai_dispatches (latest 10) ─────────────");
  const dp = await client.query(
    `select id, channel_id, source_type, source_id, status, error,
            dispatched_at
     from public.mrai_dispatches order by dispatched_at desc limit 10`,
  );
  if (dp.rows.length === 0) {
    console.log("  (no dispatches recorded)");
  } else {
    for (const d of dp.rows) {
      console.log(
        `  ${d.dispatched_at} · ${d.source_type} · channel=${(d.channel_id ?? "").slice(0, 8)} · ${d.status}${d.error ? " · " + d.error.slice(0, 100) : ""}`,
      );
    }
  }

  console.log("\n─── env check (Slack/Email/Resend) ──────────");
  console.log(`  SLACK_WEBHOOK_URL          : ${process.env.SLACK_WEBHOOK_URL ? "✓ set" : "✗ missing"}`);
  console.log(`  RESEND_API_KEY             : ${process.env.RESEND_API_KEY ? "✓ set" : "✗ missing"}`);
  console.log(`  RESEND_FROM_EMAIL          : ${process.env.RESEND_FROM_EMAIL ? "✓ set (" + process.env.RESEND_FROM_EMAIL + ")" : "✗ missing"}`);

  await client.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
