/**
 * Re-aggregate cached ensemble results in place.
 *
 * Use after changing aggregator logic (e.g., normaliseIncome bucketing,
 * channel dictionary changes, segment breakdown rules) when you want
 * existing ensembles to pick up the new shape without re-running the
 * underlying simulations.
 *
 * Preserves the existing narrative (mergedRisks / mergedActions /
 * executiveSummary) so we don't burn LLM tokens re-merging.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reaggregate-ensembles.ts          # latest 5
 *   npx tsx --env-file=.env.local scripts/reaggregate-ensembles.ts 20       # latest 20
 *   npx tsx --env-file=.env.local scripts/reaggregate-ensembles.ts <uuid>   # specific id
 */
import { Client } from "pg";
import { aggregateEnsemble, type EnsembleSimSnapshot } from "@/lib/simulation/ensemble";
import { rewriteSimScaleReferences } from "@/lib/simulation/ensemble-narrative";
import type { CountryScore } from "@/lib/simulation/schemas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NarrativeShape {
  executiveSummary?: string;
  mergedRisks?: Array<{ description?: string; [k: string]: unknown }>;
  mergedActions?: Array<{ action?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

async function main() {
  const arg = process.argv[2];
  let targetIds: string[] = [];

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    if (arg && UUID_RE.test(arg)) {
      targetIds = [arg];
    } else {
      const limit = arg ? parseInt(arg, 10) : 5;
      const r = await c.query<{ id: string }>(
        `select id::text as id
           from public.ensembles
          where status = 'completed'
          order by completed_at desc nulls last
          limit $1`,
        [Number.isFinite(limit) && limit > 0 ? limit : 5],
      );
      targetIds = r.rows.map((row) => row.id);
    }
    if (targetIds.length === 0) {
      console.log("no ensembles to re-aggregate");
      return;
    }
    console.log(`Re-aggregating ${targetIds.length} ensemble(s)...`);

    for (const ensembleId of targetIds) {
      try {
        const snapshots = await loadSnapshots(c, ensembleId);
        if (snapshots.length === 0) {
          console.log(`  ${ensembleId.slice(0, 8)} — no completed sims, skip`);
          continue;
        }
        // Pull the existing narrative so we can splice it back in after
        // aggregation — re-merging would cost LLM tokens for no benefit.
        // We *do* apply the per-sim → ensemble scale rewriter to the cached
        // narrative so old "전체 200명 중" phrasing gets normalised without
        // an LLM round trip.
        const existing = await c.query<{ aggregate_result: { narrative?: NarrativeShape } }>(
          `select aggregate_result from public.ensembles where id = $1`,
          [ensembleId],
        );
        const oldNarrative = existing.rows[0]?.aggregate_result?.narrative;

        const fresh = aggregateEnsemble(snapshots);
        if (oldNarrative) {
          const totalPersonas = snapshots.reduce(
            (sum, s) => sum + (s.personas?.length ?? 0),
            0,
          );
          const perSim = snapshots[0]?.personas?.length ?? 0;
          const rewritten: NarrativeShape = {
            ...oldNarrative,
            executiveSummary: rewriteSimScaleReferences(
              oldNarrative.executiveSummary ?? "",
              perSim,
              totalPersonas,
            ),
            mergedRisks: (oldNarrative.mergedRisks ?? []).map((r) => ({
              ...r,
              description: rewriteSimScaleReferences(r.description ?? "", perSim, totalPersonas),
            })),
            mergedActions: (oldNarrative.mergedActions ?? []).map((a) => ({
              ...a,
              action: rewriteSimScaleReferences(a.action ?? "", perSim, totalPersonas),
            })),
          };
          (fresh as { narrative?: NarrativeShape }).narrative = rewritten;
        }
        await c.query(
          `update public.ensembles set aggregate_result = $1::jsonb where id = $2`,
          [JSON.stringify(fresh), ensembleId],
        );

        const incomeRows = fresh.personas?.segmentBreakdown?.byIncome?.length ?? 0;
        const channelRows = fresh.personas?.channelMentions?.length ?? 0;
        console.log(
          `  ${ensembleId.slice(0, 8)} — sims=${snapshots.length} byIncome=${incomeRows} channels=${channelRows} ✓`,
        );
      } catch (err) {
        console.error(`  ${ensembleId.slice(0, 8)} — failed:`, err);
      }
    }
  } finally {
    await c.end();
  }
}

async function loadSnapshots(c: Client, ensembleId: string): Promise<EnsembleSimSnapshot[]> {
  type Row = {
    id: string;
    ensemble_index: number | null;
    best_country: string | null;
    model_provider: string | null;
    countries: unknown;
    personas: unknown;
    overview: unknown;
    risks: unknown;
    recommendations: unknown;
    pricing: unknown;
    creative: unknown;
  };
  const { rows } = await c.query<Row>(
    `select s.id::text as id,
            s.ensemble_index,
            s.best_country,
            s.model_provider,
            sr.countries,
            sr.personas,
            sr.overview,
            sr.risks,
            sr.recommendations,
            sr.pricing,
            sr.creative
       from public.simulations s
       join public.simulation_results sr on sr.simulation_id = s.id
      where s.ensemble_id = $1 and s.status = 'completed'
      order by s.ensemble_index nulls last`,
    [ensembleId],
  );

  return rows.map((r) => {
    const personas = (r.personas ?? []) as Array<{ country?: string; purchaseIntent?: number }>;
    const intentByCountry: Record<string, { n: number; meanIntent: number }> = {};
    const sums: Record<string, { n: number; total: number }> = {};
    for (const p of personas) {
      const cc = (p.country ?? "?").toUpperCase();
      if (!sums[cc]) sums[cc] = { n: 0, total: 0 };
      sums[cc].n += 1;
      sums[cc].total += typeof p.purchaseIntent === "number" ? p.purchaseIntent : 0;
    }
    for (const [cc, v] of Object.entries(sums)) {
      intentByCountry[cc] = { n: v.n, meanIntent: v.n > 0 ? v.total / v.n : 0 };
    }
    const compactPersonas = personas.flatMap((p) => {
      const rec = p as {
        country?: string;
        purchaseIntent?: number;
        voice?: string;
        ageRange?: string;
        profession?: string;
        gender?: string;
        incomeBand?: string;
        trustFactors?: unknown;
        objections?: unknown;
      };
      if (typeof rec.purchaseIntent !== "number" || !rec.country) return [];
      return [
        {
          country: rec.country.toUpperCase(),
          purchaseIntent: rec.purchaseIntent,
          voice: rec.voice,
          ageRange: rec.ageRange,
          profession: rec.profession,
          gender: rec.gender,
          incomeBand: rec.incomeBand,
          trustFactors: Array.isArray(rec.trustFactors)
            ? (rec.trustFactors as unknown[]).filter((x): x is string => typeof x === "string")
            : undefined,
          objections: Array.isArray(rec.objections)
            ? (rec.objections as unknown[]).filter((x): x is string => typeof x === "string")
            : undefined,
        },
      ];
    });
    return {
      simulationId: r.id,
      index: r.ensemble_index ?? 0,
      bestCountry: r.best_country ?? null,
      countries: (r.countries ?? []) as CountryScore[],
      personaIntentByCountry: intentByCountry,
      provider: r.model_provider ?? undefined,
      overview: r.overview as EnsembleSimSnapshot["overview"],
      risks: r.risks as EnsembleSimSnapshot["risks"],
      recommendations: r.recommendations as EnsembleSimSnapshot["recommendations"],
      pricing: r.pricing as EnsembleSimSnapshot["pricing"],
      personas: compactPersonas,
      creative: r.creative as EnsembleSimSnapshot["creative"],
    };
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
