/**
 * Cross-reference: which fixtures have a completed ensemble vs not.
 *   npx tsx --env-file=.env.local scripts/check-bench-coverage.ts
 */
import { Client } from "pg";
import { loadAllGroundTruth } from "@/lib/validation/loader";

(async () => {
  const ws = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const fixtures = await loadAllGroundTruth();
  console.log(`Total fixtures: ${fixtures.length}\n`);

  type Row = {
    slug: string;
    productName: string;
    projectStatus: string | null;
    latestEnsembleStatus: string | null;
    ensembleAge: number | null;
    completedCount: number;
    failedCount: number;
    runningCount: number;
  };
  const results: Row[] = [];

  for (const f of fixtures) {
    const productName = f.truth.product;
    const { rows: prj } = await c.query<{ id: string; status: string }>(
      `select id::text, status from public.projects
        where workspace_id = $1::uuid and product_name = $2
        order by created_at desc limit 1`,
      [ws, productName],
    );
    const projectId = prj[0]?.id ?? null;
    if (!projectId) {
      results.push({
        slug: f.slug,
        productName,
        projectStatus: null,
        latestEnsembleStatus: null,
        ensembleAge: null,
        completedCount: 0,
        failedCount: 0,
        runningCount: 0,
      });
      continue;
    }
    const { rows: ens } = await c.query<{
      status: string;
      created_at: Date;
      n: string;
    }>(
      `select status,
              max(created_at) as created_at,
              count(*)::text as n
         from public.ensembles
        where project_id = $1::uuid
        group by status`,
      [projectId],
    );
    const completed = Number(ens.find((e) => e.status === "completed")?.n ?? "0");
    const failed = Number(ens.find((e) => e.status === "failed")?.n ?? "0");
    const running = Number(ens.find((e) => e.status === "running")?.n ?? "0");
    const { rows: latest } = await c.query<{ status: string; age_min: string }>(
      `select status, round(extract(epoch from (now() - created_at)) / 60)::text as age_min
         from public.ensembles
        where project_id = $1::uuid
        order by created_at desc limit 1`,
      [projectId],
    );
    results.push({
      slug: f.slug,
      productName,
      projectStatus: prj[0].status,
      latestEnsembleStatus: latest[0]?.status ?? null,
      ensembleAge: latest[0] ? Number(latest[0].age_min) : null,
      completedCount: completed,
      failedCount: failed,
      runningCount: running,
    });
  }

  // Categorize
  const haveCompleted = results.filter((r) => r.completedCount > 0);
  const haveOnlyFailed = results.filter((r) => r.completedCount === 0 && r.failedCount > 0);
  const stillRunning = results.filter((r) => r.completedCount === 0 && r.runningCount > 0);
  const noProject = results.filter((r) => r.projectStatus === null);
  const noEnsemble = results.filter((r) => r.projectStatus !== null && r.completedCount === 0 && r.failedCount === 0 && r.runningCount === 0);

  console.log(`✅ Have completed ensemble: ${haveCompleted.length}/${fixtures.length}`);
  for (const r of haveCompleted) {
    console.log(`   ${r.slug.padEnd(35)} (${r.completedCount} completed)`);
  }

  if (stillRunning.length > 0) {
    console.log(`\n⏳ Still running (${stillRunning.length}):`);
    for (const r of stillRunning) {
      console.log(`   ${r.slug.padEnd(35)} ${r.ensembleAge}min ago`);
    }
  }

  if (haveOnlyFailed.length > 0) {
    console.log(`\n❌ Only failed ensembles (${haveOnlyFailed.length}):`);
    for (const r of haveOnlyFailed) {
      console.log(`   ${r.slug.padEnd(35)} ${r.failedCount} failed`);
    }
  }

  if (noProject.length > 0) {
    console.log(`\n📁 No project yet (${noProject.length}):`);
    for (const r of noProject) console.log(`   ${r.slug}`);
  }

  if (noEnsemble.length > 0) {
    console.log(`\n🚫 Project exists but no ensemble (${noEnsemble.length}):`);
    for (const r of noEnsemble) console.log(`   ${r.slug}`);
  }

  // What's still needed
  const needed = [...stillRunning, ...haveOnlyFailed, ...noProject, ...noEnsemble];
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Still need ensembles for: ${needed.length} fixtures`);
  if (needed.length > 0) {
    console.log(`\nRe-spawn command:`);
    console.log(`npx tsx --env-file=.env.local scripts/spawn-benchmark.ts \\`);
    console.log(`  --workspace-id ${ws} \\`);
    console.log(`  --fixtures ${needed.map((r) => r.slug).join(",")} \\`);
    console.log(`  --concurrency 3 --include-existing`);
  }

  await c.end();
})();
