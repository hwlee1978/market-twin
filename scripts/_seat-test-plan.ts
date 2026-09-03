/**
 * Temporarily moves one workspace onto the growth plan so the seat-invitation
 * flow can be exercised end to end, and puts it back afterwards.
 *
 * Seats are a Growth-and-above feature (growth = 3, enterprise = 10; every
 * other plan is 1), so with every workspace on a 1-seat plan nobody can send
 * an invitation at all — including us, when trying to verify the feature.
 *
 * The original plan/status is printed before the change and must be passed
 * back to --restore, so the restore cannot silently invent a value.
 *
 *   npx tsx --env-file=.env.local scripts/_seat-test-plan.ts <workspaceId>
 *   npx tsx --env-file=.env.local scripts/_seat-test-plan.ts <workspaceId> --restore <plan>
 */
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  const [wsId, flag, restorePlan] = process.argv.slice(2);
  if (!url || !wsId) {
    console.error("usage: _seat-test-plan.ts <workspaceId> [--restore <plan>]");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows: before } = await client.query<{
      name: string; plan: string | null; status: string | null; members: string;
    }>(
      `select w.name, s.plan, s.status,
              (select count(*) from public.workspace_members m where m.workspace_id = w.id)::text as members
       from public.workspaces w
       left join public.subscriptions s on s.workspace_id = w.id
       where w.id = $1`,
      [wsId],
    );
    if (before.length === 0) {
      console.error("workspace not found:", wsId);
      process.exit(1);
    }
    const cur = before[0];
    console.log(`workspace : ${cur.name}`);
    console.log(`current   : plan=${cur.plan} status=${cur.status} members=${cur.members}`);

    if (flag === "--restore") {
      if (!restorePlan) {
        console.error("--restore 에는 되돌릴 plan 값을 함께 주어야 합니다.");
        process.exit(1);
      }
      await client.query(
        `update public.subscriptions set plan = $2 where workspace_id = $1`,
        [wsId, restorePlan],
      );
      console.log(`restored  : plan=${restorePlan}`);
      return;
    }

    if (cur.plan === "growth") {
      console.log("already on growth — 변경 없음.");
      return;
    }

    await client.query(
      `update public.subscriptions set plan = 'growth' where workspace_id = $1`,
      [wsId],
    );
    console.log(`updated   : plan=growth (seats 3)`);
    console.log(`\n되돌릴 때:\n  npx tsx --env-file=.env.local scripts/_seat-test-plan.ts ${wsId} --restore ${cur.plan}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
