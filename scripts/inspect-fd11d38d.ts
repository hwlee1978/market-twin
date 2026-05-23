import { Client } from "pg";
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const eid = "fd11d38d-631e-44ac-99e2-97a2632157be";
  const { rows: ens } = await c.query<{
    id: string;
    status: string;
    aggregate_result: unknown;
    project_id: string;
  }>(`select id::text as id, status, aggregate_result, project_id::text as project_id
        from public.ensembles where id = $1`, [eid]);
  if (!ens.length) { console.log("not found"); await c.end(); return; }
  const e = ens[0];
  const agg = (e.aggregate_result ?? {}) as Record<string, unknown> & {
    recommendation?: { country?: string; consensusPercent?: number; confidence?: string; consensusType?: string };
    bestCountryDistribution?: Array<{ country: string; count: number; percent: number }>;
    countryStats?: Array<{ country: string; finalScore?: { mean?: number; median?: number; std?: number }; components?: unknown; meanIntent?: number; cacEstimateUsd?: number }>;
    providerBreakdown?: Array<{ provider: string; winnerAlignmentPercent: number; picks: Array<{ country: string; count: number }> }>;
    narrative?: { hotTake?: string; executiveSummary?: string };
  };

  console.log(`Ensemble ${e.id.slice(0,8)} | ${e.status}\n`);

  const r = agg.recommendation;
  if (r) {
    console.log(`Winner: ${r.country} | consensus ${r.consensusPercent}% | ${r.confidence} | ${r.consensusType ?? "-"}\n`);
  }

  if (agg.narrative?.hotTake) {
    console.log(`HotTake: ${agg.narrative.hotTake}\n`);
  }
  if (agg.narrative?.executiveSummary) {
    console.log(`Executive: ${agg.narrative.executiveSummary.slice(0, 400)}\n`);
  }

  console.log("Best-country vote distribution:");
  for (const b of agg.bestCountryDistribution ?? []) {
    console.log(`  ${b.country.padEnd(4)} ${b.count}/15 (${b.percent}%)`);
  }

  console.log("\nCountry mean finalScore ranking:");
  const sorted = [...(agg.countryStats ?? [])].sort((a, b) => (b.finalScore?.mean ?? 0) - (a.finalScore?.mean ?? 0));
  for (const c of sorted) {
    const m = c.finalScore?.mean?.toFixed(1) ?? "?";
    const std = c.finalScore?.std?.toFixed(1) ?? "?";
    const cacRaw = (c as Record<string, unknown>).cacEstimateUsd;
    const cacNum = typeof cacRaw === "number" ? cacRaw :
                   (typeof cacRaw === "object" && cacRaw && "medianUsd" in cacRaw) ? Number((cacRaw as { medianUsd: number }).medianUsd) : null;
    const cac = cacNum != null ? `CAC $${cacNum.toFixed(0)}` : "";
    const intent = c.meanIntent ? `intent ${(c.meanIntent * 100).toFixed(0)}%` : "";
    console.log(`  ${c.country.padEnd(4)} mean=${String(m).padStart(5)}  σ=${String(std).padStart(4)}  ${intent.padEnd(12)}  ${cac}`);
  }

  console.log("\nProvider breakdown:");
  for (const p of agg.providerBreakdown ?? []) {
    console.log(`  ${p.provider}: ${p.winnerAlignmentPercent}% align with winner | top picks: ${p.picks.slice(0, 3).map(x => `${x.country}(${x.count})`).join(", ")}`);
  }

  await c.end();
})();
