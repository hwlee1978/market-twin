/**
 * Exercises the DB health probe the way the monitoring cron does, and then
 * with a deliberately impossible budget, to confirm both the happy path and
 * the failure path behave as intended.
 *
 *   npx tsx --env-file=.env.local scripts/_health-probe.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function ping(budgetMs: number): Promise<number> {
  const admin = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const started = Date.now();
  const { error } = await admin
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .limit(1)
    .abortSignal(AbortSignal.timeout(budgetMs));
  if (error) throw new Error(error.message);
  return Date.now() - started;
}

async function main() {
  if (!url || !key) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required.");
    process.exit(1);
  }

  console.log("happy path (5000ms budget), 5 runs:");
  const times: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const ms = await ping(5000);
    times.push(ms);
    console.log(`  run ${i}: ${ms}ms`);
  }
  const max = Math.max(...times);
  console.log(
    `  max ${max}ms — headroom under the old 2000ms budget: ${2000 - max}ms, ` +
      `under the new 5000ms: ${5000 - max}ms`,
  );

  console.log("\nfailure path (1ms budget — must throw, not hang):");
  const t = Date.now();
  try {
    await ping(1);
    console.log("  UNEXPECTED: succeeded");
  } catch (err) {
    console.log(`  threw after ${Date.now() - t}ms: ${(err as Error).message}`);
  }

  console.log("\nretry path (1ms then 5000ms — the warn case):");
  try {
    await ping(1);
  } catch {
    const ms = await ping(5000);
    console.log(`  retry succeeded in ${ms}ms → would report warn, not fail`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
