import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const ws = await c.query<{ id: string }>(
    `select id from public.workspaces where name = '르무통' limit 1`,
  );
  if (ws.rows.length === 0) {
    console.log("No Le Mouton workspace");
    await c.end();
    return;
  }
  const wsId = ws.rows[0].id;
  console.log("workspace:", wsId);

  const r = await c.query<{
    id: string;
    asset_type: string;
    label: string | null;
    image_url: string;
    storage_path: string | null;
    created_by: string | null;
    created_at: string;
    mime_type: string | null;
    file_size_bytes: number | null;
  }>(
    `select id, asset_type, label, image_url, storage_path, created_by, created_at, mime_type, file_size_bytes
     from public.mrai_brand_assets
     where workspace_id = $1 and asset_type = 'ambassador'
     order by created_at desc`,
    [wsId],
  );
  console.log(`\nAmbassador assets: ${r.rows.length}`);
  for (const a of r.rows) {
    console.log(
      `\n id=${a.id}\n  type=${a.asset_type}\n  label=${a.label ?? '(null)'}\n  created_by=${a.created_by ?? '(null)'}\n  created_at=${a.created_at}\n  mime=${a.mime_type}  size=${a.file_size_bytes}\n  url=${a.image_url}`,
    );
  }

  // Show created_by user info if any non-null
  const userIds = Array.from(new Set(r.rows.map(r => r.created_by).filter((x): x is string => Boolean(x))));
  if (userIds.length > 0) {
    const u = await c.query(
      `select id, email, raw_user_meta_data->>'full_name' as name from auth.users where id = any($1::uuid[])`,
      [userIds],
    );
    console.log(`\nUploaders (${u.rows.length}):`);
    for (const row of u.rows) {
      console.log(`  ${row.id} | ${row.email} | ${row.name ?? ''}`);
    }
  } else {
    console.log("\nAll created_by are NULL (uploaded via service role / no user context)");
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
