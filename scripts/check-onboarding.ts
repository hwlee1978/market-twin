import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log("─── Workspace onboarding state ──────────────");
  const ws = await c.query<{
    id: string;
    name: string;
    mrai_onboarded_at: string | null;
  }>(`select id, name, mrai_onboarded_at from public.workspaces order by created_at`);
  for (const w of ws.rows) {
    const status = w.mrai_onboarded_at
      ? "✓ " + new Date(w.mrai_onboarded_at).toLocaleString("ko-KR")
      : "✗ 미완료";
    console.log(`  ${w.id.slice(0, 8)} · ${w.name} → ${status}`);
  }

  console.log("\n─── Onboarding steps saved per workspace ────");
  const steps = await c.query<{ workspace_id: string; n: string }>(
    `select workspace_id, count(*) as n from public.mrai_memories where onboarding_step is not null group by workspace_id`,
  );
  if (steps.rows.length === 0) {
    console.log("  (no onboarding memories saved anywhere)");
  } else {
    for (const s of steps.rows) {
      console.log(`  ${s.workspace_id.slice(0, 8)} → ${s.n}/8 steps`);
    }
  }

  console.log("\n─── Active workspace cookie (from your session) ──");
  console.log("  Run: document.cookie in browser console for /mr-ai page");
  console.log("  Look for 'aw_id=...' which is the active workspace id");

  await c.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
