import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log("─── HubSpot env (.env.local) ────────────────");
  console.log(
    `  HUBSPOT_CLIENT_ID      : ${process.env.HUBSPOT_CLIENT_ID ? "✓ set" : "✗ missing"}`,
  );
  console.log(
    `  HUBSPOT_CLIENT_SECRET  : ${process.env.HUBSPOT_CLIENT_SECRET ? "✓ set" : "✗ missing"}`,
  );
  console.log(
    `  HUBSPOT_REDIRECT_URI   : ${process.env.HUBSPOT_REDIRECT_URI ?? "✗ missing (필수)"}`,
  );

  console.log("\n─── mrai_integrations (DB) ──────────────────");
  // Check if the integrations table exists at all
  const tbl = await c.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'mrai_integrations'
    order by ordinal_position
  `);
  if (tbl.rows.length === 0) {
    console.log("  (mrai_integrations table not yet created)");
  } else {
    console.log(`  columns: ${tbl.rows.map((r) => r.column_name).join(", ")}`);
    const colNames = tbl.rows.map((r) => r.column_name as string);
    const hasCreated = colNames.includes("created_at");
    const orderCol = hasCreated ? "created_at" : "updated_at";
    const r = await c.query(
      `select workspace_id, provider, access_token is not null as has_token,
              refresh_token is not null as has_refresh, expires_at, scope, ${orderCol} as sort_ts
       from public.mrai_integrations
       order by ${orderCol} desc`,
    );
    console.log(`\n  rows: ${r.rows.length}`);
    for (const row of r.rows) {
      console.log(
        `    ws=${row.workspace_id.slice(0, 8)} · ${row.provider} · token=${row.has_token} · refresh=${row.has_refresh} · expires=${row.expires_at ?? "—"}`,
      );
      if (row.scope) console.log(`      scope: ${row.scope.slice(0, 100)}`);
    }
  }

  await c.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
