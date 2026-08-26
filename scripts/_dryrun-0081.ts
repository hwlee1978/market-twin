/**
 * Dry-run for migration 0081 (team seats).
 *
 * Applies the migration inside a transaction against the REAL schema, then
 * exercises the invariants it introduces with synthetic rows, and rolls the
 * whole thing back. Nothing is persisted — the point is to prove the SQL is
 * valid against production's actual schema, which a bare Postgres cannot do
 * because 30 of the 81 migrations depend on Supabase's auth/storage schemas.
 *
 *   npx tsx --env-file=.env.local scripts/_dryrun-0081.ts
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = "0081_workspace_seats.sql";

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, pass: boolean, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Runs a statement that is expected to fail, and reports why.
 *
 * Wrapped in a savepoint: in Postgres a failed statement aborts the entire
 * transaction, so without this the first expected failure would poison every
 * check after it.
 */
let savepointSeq = 0;
async function expectFailure(
  client: Client,
  name: string,
  sql: string,
  params: unknown[],
  expectFragment: string,
) {
  const sp = `sp_${++savepointSeq}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await client.query(sql, params);
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    record(name, false, "statement unexpectedly succeeded");
  } catch (err) {
    const msg = (err as Error).message ?? "";
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    record(name, msg.includes(expectFragment), msg.split("\n")[0]);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL required (use --env-file=.env.local).");
    process.exit(1);
  }

  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", FILE),
    "utf8",
  );

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let rolledBack = false;
  try {
    await client.query("BEGIN");
    console.log(`\nApplying ${FILE} inside a transaction ...`);
    await client.query(sql);
    record("migration applies against the real schema", true);

    // ── Fixtures ──────────────────────────────────────────────────────
    // auth.users rows are needed because workspace_members.user_id has an
    // FK to them. Inserted here and rolled back with everything else.
    const { rows: wsRows } = await client.query<{ id: string }>(
      `insert into public.workspaces (name, company_name)
       values ('__dryrun_seats__', '__dryrun__') returning id`,
    );
    const wsId = wsRows[0].id;

    const userIds: string[] = [];
    for (const tag of ["a", "b"]) {
      const { rows } = await client.query<{ id: string }>(
        `insert into auth.users (id, instance_id, aud, role, email)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
                 'authenticated', 'authenticated', $1)
         returning id`,
        [`__dryrun_${tag}@example.invalid`],
      );
      userIds.push(rows[0].id);
    }
    const [ownerA, ownerB] = userIds;

    await client.query(
      `insert into public.workspace_members (workspace_id, user_id, role)
       values ($1, $2, 'owner')`,
      [wsId, ownerA],
    );

    // ── Invariant 1: the last owner cannot be deleted ──────────────────
    await expectFailure(
      client,
      "last owner cannot be deleted",
      `delete from public.workspace_members where workspace_id = $1 and user_id = $2`,
      [wsId, ownerA],
      "last_owner",
    );

    // ── Invariant 2: the last owner cannot be demoted ──────────────────
    await expectFailure(
      client,
      "last owner cannot be demoted",
      `update public.workspace_members set role = 'analyst'
       where workspace_id = $1 and user_id = $2`,
      [wsId, ownerA],
      "last_owner",
    );

    // ── Invariant 3: with two owners, removing one is allowed ─────────
    await client.query(
      `insert into public.workspace_members (workspace_id, user_id, role)
       values ($1, $2, 'owner')`,
      [wsId, ownerB],
    );
    try {
      await client.query(
        `delete from public.workspace_members where workspace_id = $1 and user_id = $2`,
        [wsId, ownerB],
      );
      record("second owner can be removed", true);
    } catch (err) {
      record("second owner can be removed", false, (err as Error).message);
    }

    // ── Invariant 4: non-owner members are unaffected by the trigger ──
    await client.query(
      `insert into public.workspace_members (workspace_id, user_id, role)
       values ($1, $2, 'analyst')`,
      [wsId, ownerB],
    );
    try {
      await client.query(
        `update public.workspace_members set role = 'viewer'
         where workspace_id = $1 and user_id = $2`,
        [wsId, ownerB],
      );
      await client.query(
        `delete from public.workspace_members where workspace_id = $1 and user_id = $2`,
        [wsId, ownerB],
      );
      record("non-owner rows can be updated and deleted", true);
    } catch (err) {
      record("non-owner rows can be updated and deleted", false, (err as Error).message);
    }

    // ── Invariant 5: one live invitation per (workspace, email) ───────
    const inviteSql = `insert into public.workspace_invitations
        (workspace_id, email, role, token_hash, expires_at)
      values ($1, $2, 'analyst', $3, now() + interval '14 days')`;
    await client.query(inviteSql, [wsId, "dup@example.invalid", "hash-1"]);
    await expectFailure(
      client,
      "duplicate pending invitation is rejected",
      inviteSql,
      [wsId, "dup@example.invalid", "hash-2"],
      "workspace_invitations_pending_unique",
    );

    // ── Invariant 6: revoking frees the address for a re-invite ───────
    await client.query(
      `update public.workspace_invitations set status = 'revoked'
       where workspace_id = $1 and email = $2`,
      [wsId, "dup@example.invalid"],
    );
    try {
      await client.query(inviteSql, [wsId, "dup@example.invalid", "hash-3"]);
      record("re-invite works after revoke", true);
    } catch (err) {
      record("re-invite works after revoke", false, (err as Error).message);
    }

    // ── Invariant 7: status is constrained ────────────────────────────
    await expectFailure(
      client,
      "invalid invitation status is rejected",
      `update public.workspace_invitations set status = 'bogus'
       where workspace_id = $1`,
      [wsId],
      "check constraint",
    );

    // ── Invariant 8: RLS is on for the new table ──────────────────────
    const { rows: rls } = await client.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class
       where oid = 'public.workspace_invitations'::regclass`,
    );
    record("row level security enabled", rls[0]?.relrowsecurity === true);

    const { rows: pol } = await client.query<{ n: string }>(
      `select count(*)::text as n from pg_policies
       where schemaname = 'public' and tablename = 'workspace_invitations'`,
    );
    record("invitation policies created", Number(pol[0]?.n) === 4, `${pol[0]?.n} policies`);

    const { rows: wmPol } = await client.query<{ n: string }>(
      `select count(*)::text as n from pg_policies
       where schemaname = 'public' and tablename = 'workspace_members'
         and policyname in ('wm_update_admins', 'wm_delete_admins_or_self')`,
    );
    record("member management policies created", Number(wmPol[0]?.n) === 2);

    // ── Invariant 9: re-running the migration is safe ─────────────────
    try {
      await client.query(sql);
      record("migration is re-runnable", true);
    } catch (err) {
      record("migration is re-runnable", false, (err as Error).message.split("\n")[0]);
    }
  } finally {
    await client.query("ROLLBACK");
    rolledBack = true;
    await client.end();
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(
    `\nrolled back: ${rolledBack} · ${checks.length - failed.length}/${checks.length} checks passed`,
  );
  if (failed.length > 0) {
    console.log("failed:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log("all invariants hold — nothing was persisted.");
}

main().catch((err) => {
  console.error("dry-run aborted:", err);
  process.exit(1);
});
