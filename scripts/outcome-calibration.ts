/**
 * Production confidence-calibration report — the "measure" arm of the outcome
 * feedback loop. Reads real launch outcomes (outcome_feedback) and reports the
 * ACTUAL top-1 accuracy per confidence tier, flagging miscalibration.
 *
 * This is the live counterpart to the N=20 offline backtest: it validates the
 * STRONG-confidence calibration (ensemble.ts dominance rule) against real
 * customer launches as they accumulate. It is DATA-GATED — dormant until
 * enough outcomes exist (pre-pilot the table is ~empty); wire it into a cron /
 * CI check once pilots land.
 *
 * Run:  npx tsx --env-file=.env.local scripts/outcome-calibration.ts
 * Exit: 1 when drift is detected with sufficient data (for CI), else 0.
 */
import { createClient } from "@supabase/supabase-js";

/** Minimum outcomes in a tier before its accuracy is treated as a signal. */
const MIN_SAMPLE = 10;
/** A STRONG label should mean genuinely high real accuracy. */
const STRONG_TARGET_PCT = 66;

type Conf = "STRONG" | "MODERATE" | "WEAK";
interface Row {
  recommendation_confidence: Conf | null;
  matched_recommendation: boolean | null;
}

function tier(rows: Row[], conf: Conf) {
  const subset = rows.filter((r) => r.recommendation_confidence === conf);
  const hits = subset.filter((r) => r.matched_recommendation === true).length;
  return {
    n: subset.length,
    hits,
    rate: subset.length > 0 ? Math.round((hits / subset.length) * 100) : null,
  };
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb
    .from("outcome_feedback")
    .select("recommendation_confidence, matched_recommendation");
  if (error) {
    console.error("query failed:", error.message);
    { process.exitCode = 0; return; } // don't fail CI on infra error
  }
  const all = (data ?? []) as Row[];
  // Measurable = a real launch market was recorded (matched_recommendation set).
  const measurable = all.filter((r) => r.matched_recommendation !== null);

  console.log("=== Production confidence calibration (real outcomes) ===");
  console.log(`total outcomes: ${all.length} | measurable: ${measurable.length}`);
  if (measurable.length === 0) {
    console.log("no measurable outcomes yet — dormant (needs launched pilots).");
    { process.exitCode = 0; return; }
  }

  const overallHits = measurable.filter((r) => r.matched_recommendation === true).length;
  console.log(
    `overall top-1 accuracy: ${Math.round((overallHits / measurable.length) * 100)}% (${overallHits}/${measurable.length})\n`,
  );

  const strong = tier(measurable, "STRONG");
  const moderate = tier(measurable, "MODERATE");
  const weak = tier(measurable, "WEAK");
  for (const [name, t] of [["STRONG", strong], ["MODERATE", moderate], ["WEAK", weak]] as const) {
    const flag = t.n < MIN_SAMPLE ? " (n<min, not yet significant)" : "";
    console.log(`  ${name.padEnd(9)} n=${String(t.n).padStart(3)}  accuracy=${t.rate ?? "—"}%${flag}`);
  }

  // Drift checks — only assert when the relevant tiers have enough data.
  const problems: string[] = [];
  if (strong.n >= MIN_SAMPLE && (strong.rate ?? 0) < STRONG_TARGET_PCT) {
    problems.push(
      `STRONG accuracy ${strong.rate}% < target ${STRONG_TARGET_PCT}% — over-confident; tighten the STRONG dominance rule.`,
    );
  }
  // Monotonicity: STRONG ≥ MODERATE ≥ WEAK (each pair only when both significant).
  if (strong.n >= MIN_SAMPLE && moderate.n >= MIN_SAMPLE && (strong.rate ?? 0) < (moderate.rate ?? 0)) {
    problems.push(`STRONG (${strong.rate}%) < MODERATE (${moderate.rate}%) — labels not monotonic.`);
  }
  if (moderate.n >= MIN_SAMPLE && weak.n >= MIN_SAMPLE && (moderate.rate ?? 0) < (weak.rate ?? 0)) {
    problems.push(`MODERATE (${moderate.rate}%) < WEAK (${weak.rate}%) — labels not monotonic.`);
  }

  console.log("");
  if (problems.length === 0) {
    console.log("✅ calibration OK (or insufficient data to flag drift).");
    { process.exitCode = 0; return; }
  }
  console.log("⚠️  CALIBRATION DRIFT:");
  for (const p of problems) console.log(`   - ${p}`);
  { process.exitCode = 1; return; }
}

main().catch((e) => {
  console.error(e);
  { process.exitCode = 0; return; }
});
