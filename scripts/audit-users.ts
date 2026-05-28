/**
 * Pre-cleanup audit: list every auth user + what they own (workspaces /
 * memberships / projects / sims / mrai data). Read-only.
 */
import { Client } from "pg";

const MASTER_EMAIL = "hwlee197874@gmail.com";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const fmt = (v: unknown): string => {
      if (!v) return "-";
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v);
      return s.length >= 10 ? s.slice(0, 10) : s;
    };

    // 1. Users
    const users = await c.query<{
      id: string;
      email: string | null;
      created_at: unknown;
      last_sign_in_at: unknown;
    }>(`select id, email, created_at, last_sign_in_at from auth.users order by created_at`);
    console.log(`\n=== AUTH USERS (${users.rows.length}) ===`);
    console.table(users.rows.map((u) => ({
      email: u.email,
      created: fmt(u.created_at),
      lastSignIn: fmt(u.last_sign_in_at),
      master: u.email === MASTER_EMAIL ? "★ KEEP" : "DELETE",
    })));

    // 2. All workspaces + their members
    const workspaces = await c.query<{
      id: string;
      name: string;
      created_at: unknown;
    }>(`select id, name, created_at from public.workspaces order by created_at`);

    console.log(`\n=== WORKSPACES (${workspaces.rows.length}) ===`);
    for (const w of workspaces.rows) {
      const memberRows = await c.query<{ email: string | null; role: string }>(
        `select u.email, m.role
           from public.workspace_members m
           join auth.users u on u.id = m.user_id
          where m.workspace_id = $1
          order by m.role`,
        [w.id],
      );
      const members = memberRows.rows
        .map((m) => `${m.email}(${m.role})`)
        .join(", ");
      console.log(`  • ${w.name} [${fmt(w.created_at)}] — ${members || "(no members)"}`);
    }

    // 3. Projects per workspace
    console.log("\n=== PROJECTS PER WORKSPACE ===");
    const projectsRows = await c.query<{
      workspace_id: string;
      ws_name: string;
      n: string;
    }>(
      `select p.workspace_id, w.name as ws_name, count(*)::int as n
         from public.projects p
         join public.workspaces w on w.id = p.workspace_id
         group by p.workspace_id, w.name
         order by count(*) desc`,
    );
    console.table(projectsRows.rows.map((r) => ({ workspace: r.ws_name, projects: r.n })));

    // 4. Simulations count (server-side aggregate)
    const simsRows = await c.query<{ ws_name: string; n: string }>(
      `select w.name as ws_name, count(*)::int as n
         from public.simulations s
         join public.projects p on p.id = s.project_id
         join public.workspaces w on w.id = p.workspace_id
         group by w.name
         order by count(*) desc`,
    ).catch(() => ({ rows: [] as Array<{ ws_name: string; n: string }> }));
    if (simsRows.rows.length) {
      console.log("\n=== SIMULATIONS PER WORKSPACE ===");
      console.table(simsRows.rows.map((r) => ({ workspace: r.ws_name, sims: r.n })));
    }

    // 5. Mr.AI footprint per workspace
    const mraiRows = await c.query<{ ws_name: string; n: string }>(
      `select w.name as ws_name, count(*)::int as n
         from public.mrai_memories m
         join public.workspaces w on w.id = m.workspace_id
         group by w.name
         order by count(*) desc`,
    ).catch(() => ({ rows: [] as Array<{ ws_name: string; n: string }> }));
    if (mraiRows.rows.length) {
      console.log("\n=== MR.AI MEMORIES PER WORKSPACE ===");
      console.table(mraiRows.rows.map((r) => ({ workspace: r.ws_name, memories: r.n })));
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
