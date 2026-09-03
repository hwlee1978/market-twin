/**
 * Read-only seat picture per workspace: plan, members, pending invites, and
 * whether an invitation would be accepted right now.
 *
 *   npx tsx --env-file=.env.local scripts/_seat-status.ts
 */
import { Client } from "pg";

// Mirrors src/lib/billing/plans.ts limits.seats.
const SEATS: Record<string, number> = {
  free_trial: 1,
  starter: 1,
  validator: 1,
  growth: 3,
  enterprise: 10,
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL required (use --env-file=.env.local).");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const { rows } = await client.query<{
      id: string;
      name: string;
      plan: string | null;
      status: string | null;
      members: string;
      pending: string;
    }>(
      `select w.id, w.name,
              s.plan, s.status,
              (select count(*) from public.workspace_members m
                where m.workspace_id = w.id)::text as members,
              (select count(*) from public.workspace_invitations i
                where i.workspace_id = w.id and i.status = 'pending'
                  and i.expires_at > now())::text as pending
       from public.workspaces w
       left join public.subscriptions s on s.workspace_id = w.id
       order by w.created_at`,
    );

    console.log("workspace                         plan          seats  used  can invite");
    console.log("-".repeat(78));
    for (const r of rows) {
      const plan = r.plan ?? "free_trial";
      const limit = SEATS[plan] ?? 1;
      const used = Number(r.members) + Number(r.pending);
      const ok = limit < 0 || used < limit;
      console.log(
        `${(r.name ?? "").slice(0, 32).padEnd(33)}${plan.padEnd(14)}${String(limit).padEnd(7)}${String(used).padEnd(6)}${ok ? "yes" : "NO (seat_limit)"}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
