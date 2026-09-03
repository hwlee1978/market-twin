import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query<{
      id: string; name: string; plan: string | null; role: string | null; user_id: string | null;
    }>(
      `select w.id, w.name, s.plan, m.user_id, m.role
       from public.workspaces w
       left join public.subscriptions s on s.workspace_id = w.id
       left join public.workspace_members m on m.workspace_id = w.id
       where w.name ilike '%test%' or w.name ilike '%review%'
       order by w.created_at`,
    );
    for (const r of rows) {
      console.log(`${r.id} | ${r.name} | plan=${r.plan} | role=${r.role} | user=${r.user_id}`);
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
