/**
 * Read-only inspection of workspaces with no members.
 *
 * Nobody can reach these through the app — every RLS policy keys off
 * workspace_members — so they are invisible orphans. Before deleting any of
 * them we need to know what a cascade would take with it.
 *
 *   npx tsx --env-file=.env.local scripts/_orphan-workspaces.ts
 */
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL required (use --env-file=.env.local).");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const { rows: orphans } = await client.query<{ id: string; name: string; created_at: string }>(
      `select w.id, w.name, w.created_at::text
       from public.workspaces w
       where not exists (
         select 1 from public.workspace_members m where m.workspace_id = w.id
       )
       order by w.created_at`,
    );

    console.log(`member 0인 워크스페이스: ${orphans.length}개\n`);

    // Every table that references workspaces, so a cascade can't surprise us.
    const { rows: refs } = await client.query<{ table_name: string; column_name: string; delete_rule: string }>(
      `select tc.table_name, kcu.column_name, rc.delete_rule
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name
       join information_schema.referential_constraints rc
         on rc.constraint_name = tc.constraint_name
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name
       where tc.constraint_type = 'FOREIGN KEY'
         and ccu.table_name = 'workspaces'
         and tc.table_schema = 'public'
       order by tc.table_name`,
    );

    for (const o of orphans) {
      console.log(`── ${o.name}  (${o.id})  생성 ${o.created_at.slice(0, 19)}`);
      let total = 0;
      for (const r of refs) {
        const { rows } = await client.query<{ n: string }>(
          `select count(*)::text as n from public.${r.table_name} where ${r.column_name} = $1`,
          [o.id],
        );
        const n = Number(rows[0].n);
        if (n > 0) {
          total += n;
          console.log(`     ${r.table_name}.${r.column_name}: ${n}행  (on delete ${r.delete_rule})`);
        }
      }
      if (total === 0) console.log("     참조 행 없음 — 완전한 빈 껍데기");
      console.log();
    }

    console.log("workspaces를 참조하는 테이블 전체:");
    console.log(
      refs.map((r) => `  ${r.table_name}.${r.column_name} (${r.delete_rule})`).join("\n"),
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
