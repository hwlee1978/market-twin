import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const ws = await c.query<{ id: string }>(
    `select id from public.workspaces where name = '르무통' limit 1`,
  );
  if (!ws.rows[0]) {
    console.log("no workspace");
    await c.end();
    return;
  }
  const wsId = ws.rows[0].id;

  // List cached cutouts via Storage API would need supabase client.
  // Instead, list product/ambassador assets and print their would-be
  // cache paths so the user can open them in Storage UI.
  const r = await c.query<{
    id: string;
    asset_type: string;
    image_url: string;
  }>(
    `select id, asset_type, image_url
     from public.mrai_brand_assets
     where workspace_id = $1 and asset_type in ('product','ambassador')
     order by asset_type, created_at desc`,
    [wsId],
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  console.log(`Workspace: ${wsId}`);
  console.log(`Total cacheable assets: ${r.rows.length}\n`);
  console.log(
    `Cache path pattern: ${wsId}/extracted/{asset_id}.png\n`,
  );

  for (const a of r.rows) {
    const cacheUrl = `${supabaseUrl}/storage/v1/object/public/mrai-content/${wsId}/extracted/${a.id}.png`;
    console.log(`[${a.asset_type}] ${a.id.slice(0, 8)}`);
    console.log(`  source: ${a.image_url}`);
    console.log(`  cache : ${cacheUrl}`);
  }
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
