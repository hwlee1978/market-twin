/**
 * Undoes a seat round-trip test: removes the invited member and puts the
 * workspace back on its original plan.
 *
 * The accepted invitation row is deliberately left in place — it is the
 * record of what happened, it consumes no seat (only pending invitations
 * do), and deleting history to make a test tidy is the wrong instinct.
 *
 *   npx tsx --env-file=.env.local scripts/_seat-test-cleanup.ts <workspaceId> <memberEmail> <restorePlan>
 */
import { Client } from "pg";

async function main() {
  const [wsId, email, plan] = process.argv.slice(2);
  if (!process.env.DATABASE_URL || !wsId || !email || !plan) {
    console.error("usage: _seat-test-cleanup.ts <workspaceId> <memberEmail> <restorePlan>");
    process.exit(1);
  }

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");

    const { rows: target } = await c.query<{ user_id: string; role: string }>(
      `select m.user_id, m.role
       from public.workspace_members m
       join auth.users u on u.id = m.user_id
       where m.workspace_id = $1 and lower(u.email) = lower($2)`,
      [wsId, email],
    );
    if (target.length === 0) {
      console.log(`${email} 은(는) 이미 멤버가 아님 — 건너뜀`);
    } else {
      if (target[0].role === "owner") {
        throw new Error("소유자는 이 스크립트로 제거하지 않는다 — 의도 확인 필요");
      }
      await c.query(
        `delete from public.workspace_members where workspace_id = $1 and user_id = $2`,
        [wsId, target[0].user_id],
      );
      console.log(`멤버 제거: ${email} (${target[0].role})`);
    }

    const { rows: sub } = await c.query<{ plan: string }>(
      `update public.subscriptions set plan = $2 where workspace_id = $1 returning plan`,
      [wsId, plan],
    );
    console.log(`플랜 원복: ${sub[0]?.plan}`);

    await c.query("COMMIT");

    const { rows: after } = await c.query<{ n: string }>(
      `select count(*)::text as n from public.workspace_members where workspace_id = $1`,
      [wsId],
    );
    console.log(`\n남은 멤버: ${after[0].n}명`);
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
