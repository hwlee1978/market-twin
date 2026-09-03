/**
 * Deletes workspaces that have no members.
 *
 * Such a workspace is unreachable through the app — every RLS policy keys
 * off workspace_members — so it is invisible rather than merely unused.
 * Inspection (scripts/_orphan-workspaces.ts) showed the two present ones
 * hold nothing but their bootstrap subscription rows.
 *
 * The member-count check is re-run inside the transaction: between
 * inspecting and deleting, someone could have accepted an invitation into
 * one of these. Guarding there rather than in the caller means the check and
 * the delete cannot drift apart.
 *
 *   npx tsx --env-file=.env.local scripts/_cleanup-orphan-workspaces.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/_cleanup-orphan-workspaces.ts
 */
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL required (use --env-file=.env.local).");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");

    const { rows: orphans } = await client.query<{ id: string; name: string }>(
      `select w.id, w.name
       from public.workspaces w
       where not exists (
         select 1 from public.workspace_members m where m.workspace_id = w.id
       )
       for update`,
    );

    if (orphans.length === 0) {
      console.log("member 0인 워크스페이스 없음 — 할 일 없음.");
      await client.query("ROLLBACK");
      return;
    }

    for (const o of orphans) {
      const { rows: subs } = await client.query<{ n: string }>(
        `select count(*)::text as n from public.subscriptions where workspace_id = $1`,
        [o.id],
      );
      const { rows: evts } = await client.query<{ n: string }>(
        `select count(*)::text as n from public.subscription_events where workspace_id = $1`,
        [o.id],
      );
      console.log(
        `${DRY_RUN ? "would delete" : "deleting"}  ${o.name}  (${o.id})  ` +
          `subscriptions=${subs[0].n} events=${evts[0].n}`,
      );
      if (!DRY_RUN) {
        await client.query(`delete from public.workspaces where id = $1`, [o.id]);
      }
    }

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log(`\n--dry-run: ${orphans.length}개 대상, 아무것도 삭제하지 않음.`);
      return;
    }

    const { rows: left } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.workspaces w
       where not exists (select 1 from public.workspace_members m where m.workspace_id = w.id)`,
    );
    if (Number(left[0].n) !== 0) {
      throw new Error(`삭제 후에도 orphan ${left[0].n}개 남음 — 롤백`);
    }

    await client.query("COMMIT");
    console.log(`\n${orphans.length}개 삭제 완료. 남은 orphan 0개.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
