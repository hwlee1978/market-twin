/**
 * Destructive cleanup: delete 2 specific test users and their workspaces.
 * Run AFTER reviewing audit-users.ts output. Irreversible without a DB backup.
 *
 * KEEP list:
 *   - hwlee197874@gmail.com (master)
 *   - chris@cnkm.kr
 *
 * DELETE list:
 *   - hwlee1978@naver.com
 *   - kr0825kr@gmail.com
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/delete-non-master-users.ts --confirm
 */
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const DELETE_EMAILS = ["hwlee1978@naver.com", "kr0825kr@gmail.com"];

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing to run without --confirm flag. Add it to proceed.");
    process.exit(2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  try {
    // 1. Look up user IDs by email
    const userIds: Array<{ email: string; id: string }> = [];
    for (const email of DELETE_EMAILS) {
      const r = await pg.query<{ id: string }>(
        `select id from auth.users where email = $1`,
        [email],
      );
      if (r.rows.length === 0) {
        console.log(`[skip] ${email} — not found`);
        continue;
      }
      userIds.push({ email, id: r.rows[0].id });
    }
    console.log(`Targeting ${userIds.length} user(s):`, userIds.map((u) => u.email));

    for (const { email, id: userId } of userIds) {
      console.log(`\n--- Deleting ${email} (${userId}) ---`);

      // 2. Find every workspace where this user is the owner. We'll delete
      //    the workspace entirely (cascades to projects, sims, mrai_*).
      //    Workspaces where the user is a non-owner member just lose
      //    their membership (auth.users delete cascades workspace_members).
      const ownedWs = await pg.query<{ id: string; name: string }>(
        `select w.id, w.name
           from public.workspaces w
           join public.workspace_members m
             on m.workspace_id = w.id and m.user_id = $1 and m.role = 'owner'`,
        [userId],
      );
      console.log(`  owns ${ownedWs.rows.length} workspace(s):`, ownedWs.rows.map((w) => w.name));

      for (const ws of ownedWs.rows) {
        const del = await pg.query(
          `delete from public.workspaces where id = $1`,
          [ws.id],
        );
        console.log(`  ✓ deleted workspace "${ws.name}" (${del.rowCount} row)`);
      }

      // 3. Delete the auth user via Supabase admin API.
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) {
        console.error(`  ✗ delete auth user failed: ${error.message}`);
      } else {
        console.log(`  ✓ deleted auth user ${email}`);
      }
    }

    // 4. Verify post-state
    const remaining = await pg.query<{ email: string }>(
      `select email from auth.users order by created_at`,
    );
    console.log(`\n=== REMAINING USERS (${remaining.rows.length}) ===`);
    remaining.rows.forEach((u) => console.log(`  • ${u.email}`));

    const wsRem = await pg.query<{ name: string }>(
      `select name from public.workspaces order by created_at`,
    );
    console.log(`\n=== REMAINING WORKSPACES (${wsRem.rows.length}) ===`);
    wsRem.rows.forEach((w) => console.log(`  • ${w.name}`));
  } finally {
    await pg.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
