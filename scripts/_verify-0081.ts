/**
 * Post-apply verification for migration 0081 — read-only.
 *
 * Confirms the objects exist in the live database and reports the current
 * seat picture per workspace so we can see whether anything is already over
 * its plan limit before invitations go out.
 *
 *   npx tsx --env-file=.env.local scripts/_verify-0081.ts
 */
import { Client } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL required (use --env-file=.env.local).");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: tbl } = await client.query(
      `select to_regclass('public.workspace_invitations') as t`,
    );
    console.log("workspace_invitations:", tbl[0].t ?? "MISSING");

    const { rows: fns } = await client.query(
      `select proname from pg_proc
       where proname in ('is_workspace_admin', 'prevent_last_owner_removal')
       order by proname`,
    );
    console.log("functions:", fns.map((r) => r.proname).join(", ") || "MISSING");

    const { rows: trg } = await client.query(
      `select tgname, tgenabled from pg_trigger
       where tgname = 'workspace_members_last_owner'`,
    );
    console.log(
      "trigger:",
      trg[0] ? `${trg[0].tgname} (enabled=${trg[0].tgenabled})` : "MISSING",
    );

    const { rows: pols } = await client.query(
      `select tablename, policyname from pg_policies
       where schemaname = 'public'
         and (tablename = 'workspace_invitations'
              or policyname in ('wm_update_admins', 'wm_delete_admins_or_self'))
       order by tablename, policyname`,
    );
    console.log("policies:");
    for (const p of pols) console.log(`  ${p.tablename}.${p.policyname}`);

    const { rows: idx } = await client.query(
      `select indexname from pg_indexes
       where schemaname = 'public' and tablename = 'workspace_invitations'
       order by indexname`,
    );
    console.log("indexes:", idx.map((r) => r.indexname).join(", "));

    // Current seat picture. Workspaces with more members than their plan
    // allows would already be over the limit before any invitation is sent.
    const { rows: seats } = await client.query(
      `select w.id, w.name, coalesce(s.plan, 'free_trial') as plan,
              count(m.user_id)::int as members
       from public.workspaces w
       left join public.workspace_members m on m.workspace_id = w.id
       left join public.subscriptions s on s.workspace_id = w.id
       group by w.id, w.name, s.plan
       having count(m.user_id) > 1
       order by members desc`,
    );
    console.log(`\nworkspaces with more than one member: ${seats.length}`);
    for (const r of seats) {
      console.log(`  ${r.name} — plan=${r.plan}, members=${r.members}`);
    }

    const { rows: owners } = await client.query(
      `select count(*)::int as n from (
         select workspace_id from public.workspace_members
         group by workspace_id
         having count(*) filter (where role = 'owner') = 0
       ) x`,
    );
    console.log(`workspaces with no owner (trigger can't fix these): ${owners[0].n}`);

    const { rows: inv } = await client.query(
      `select count(*)::int as n from public.workspace_invitations`,
    );
    console.log(`existing invitations: ${inv[0].n}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
