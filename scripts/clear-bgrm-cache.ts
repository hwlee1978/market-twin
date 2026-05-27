/**
 * Clear bg-removal cached cutouts for the Le Mouton workspace.
 *
 * Next image generation will re-run Replicate bg-removal fresh on
 * every source asset and re-cache the result. Use this when you
 * suspect the cached cutouts have baked-in artifacts from earlier
 * bad runs (e.g. ghost product outlines from multi-product source
 * photos).
 *
 * Run: DATABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *      NEXT_PUBLIC_SUPABASE_URL=... npx tsx scripts/clear-bgrm-cache.ts
 */

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

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

  const svc = createClient(url, key);
  const prefix = `${wsId}/extracted`;
  const { data: files, error } = await svc.storage
    .from("mrai-content")
    .list(prefix, { limit: 1000 });
  if (error) {
    console.error("list failed:", error.message);
    await c.end();
    return;
  }
  if (!files || files.length === 0) {
    console.log("no cached cutouts to delete.");
    await c.end();
    return;
  }
  console.log(`Found ${files.length} cached cutouts under ${prefix}/`);
  const paths = files.map((f) => `${prefix}/${f.name}`);
  console.log(`Deleting ${paths.length}…`);
  const { data: removed, error: rmErr } = await svc.storage
    .from("mrai-content")
    .remove(paths);
  if (rmErr) {
    console.error("remove failed:", rmErr.message);
  } else {
    console.log(`✓ Removed ${removed?.length ?? 0} files`);
  }
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
