/**
 * Verifies the outcome of a seat-invitation round trip for one workspace:
 * who is a member now, and what happened to each invitation.
 *
 *   npx tsx --env-file=.env.local scripts/_invite-verify.ts <workspaceId>
 */
import { Client } from "pg";

async function main() {
  const wsId = process.argv[2];
  if (!process.env.DATABASE_URL || !wsId) {
    console.error("usage: _invite-verify.ts <workspaceId>");
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows: members } = await c.query<{
      email: string; role: string; created_at: string;
    }>(
      `select u.email, m.role, m.created_at::text
       from public.workspace_members m
       join auth.users u on u.id = m.user_id
       where m.workspace_id = $1
       order by m.created_at`,
      [wsId],
    );
    console.log(`멤버 ${members.length}명`);
    for (const m of members) {
      console.log(`  ${m.role.padEnd(8)} ${m.email}   가입 ${m.created_at.slice(0, 19)}`);
    }

    const { rows: invites } = await c.query<{
      email: string; role: string; status: string; created_at: string;
      accepted_at: string | null; accepted_email: string | null;
    }>(
      `select i.email, i.role, i.status, i.created_at::text,
              i.accepted_at::text, u.email as accepted_email
       from public.workspace_invitations i
       left join auth.users u on u.id = i.accepted_by
       where i.workspace_id = $1
       order by i.created_at`,
      [wsId],
    );
    console.log(`\n초대 ${invites.length}건`);
    for (const i of invites) {
      console.log(
        `  [${i.status}] ${i.email} (${i.role})  생성 ${i.created_at.slice(0, 19)}` +
          (i.accepted_at ? `  수락 ${i.accepted_at.slice(0, 19)} by ${i.accepted_email}` : ""),
      );
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
