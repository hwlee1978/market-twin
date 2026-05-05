/**
 * Spot-check for pricing sensitivity derivation. Constructs synthetic
 * pricing curves with KNOWN inflection points, comfort ceilings, and
 * rejection floors, runs aggregateEnsemble, and verifies the
 * sensitivity numbers come out as expected.
 *
 * Run: npx tsx scripts/verify-pricing-sensitivity.ts
 */
import { aggregateEnsemble } from "../src/lib/simulation/ensemble";
import type { EnsembleSimSnapshot } from "../src/lib/simulation/ensemble";

function makeSim(
  curve: Array<[number, number]>, // [priceCents, conversionProbability]
  recommendedCents: number,
  index: number,
): EnsembleSimSnapshot {
  return {
    simulationId: `s${index}`,
    index,
    bestCountry: "JP",
    countries: [
      {
        country: "JP",
        demandScore: 70,
        cacEstimateUsd: 12,
        competitionScore: 60,
        finalScore: 75,
        rank: 1,
        rationale: "test",
      },
    ],
    personaIntentByCountry: { JP: { n: 30, meanIntent: 60 } },
    pricing: {
      recommendedPriceCents: recommendedCents,
      marginEstimate: "moderate",
      curve: curve.map(([p, c]) => ({
        priceCents: p,
        conversionProbability: c,
        estimatedRevenueIndex: p * c,
      })),
    },
  };
}

// Curve A: classic demand curve. Conversion drops smoothly from 0.85 at
// $10 to 0.05 at $50. Sharpest drop is between $25 and $30.
const curveA: Array<[number, number]> = [
  [1000, 0.85],
  [1500, 0.78],
  [2000, 0.65],
  [2500, 0.55],
  [3000, 0.32], // sharp drop here (rel drop = 0.42)
  [3500, 0.22],
  [4000, 0.15],
  [4500, 0.08],
  [5000, 0.05],
];

// Curve B: flat-then-cliff (typical luxury). Holds at 0.6+ until $40,
// then collapses to 0.1 at $45.
const curveB: Array<[number, number]> = [
  [1000, 0.7],
  [2000, 0.68],
  [3000, 0.66],
  [4000, 0.6],
  [4500, 0.1], // cliff here (rel drop = 0.83)
  [5000, 0.06],
];

const aggA = aggregateEnsemble([makeSim(curveA, 2500, 0)]);
const aggB = aggregateEnsemble([makeSim(curveB, 3500, 0)]);

console.log("");
console.log("Curve A (smooth demand):");
const sA = aggA.pricing?.sensitivity;
if (sA) {
  console.log(`  comfortCeiling: $${(sA.comfortCeilingCents ?? 0) / 100} (expect ≥ $25)`);
  console.log(`  inflection: $${(sA.inflectionCents ?? 0) / 100} (expect $30)`);
  console.log(`  rejectionFloor: $${(sA.rejectionFloorCents ?? 0) / 100} (expect ≤ $50)`);
  console.log(`  elasticityAtRec: ${sA.elasticityAtRec?.toFixed(2)}`);
  console.log(`  +10% scenario: conv ${sA.ifPriceUp10Pct?.conversionPct.toFixed(1)}% / rev ${sA.ifPriceUp10Pct?.revenueIndexDelta.toFixed(1)}%`);
  console.log(`  −10% scenario: conv ${sA.ifPriceDown10Pct?.conversionPct.toFixed(1)}% / rev ${sA.ifPriceDown10Pct?.revenueIndexDelta.toFixed(1)}%`);
}

console.log("");
console.log("Curve B (flat-then-cliff luxury):");
const sB = aggB.pricing?.sensitivity;
if (sB) {
  console.log(`  comfortCeiling: $${(sB.comfortCeilingCents ?? 0) / 100} (expect ≥ $40)`);
  console.log(`  inflection: $${(sB.inflectionCents ?? 0) / 100} (expect $45 — the cliff)`);
  console.log(`  rejectionFloor: $${(sB.rejectionFloorCents ?? 0) / 100} (expect ≤ $50)`);
  console.log(`  elasticityAtRec: ${sB.elasticityAtRec?.toFixed(2)}`);
}

const okA =
  sA != null &&
  sA.comfortCeilingCents != null &&
  sA.comfortCeilingCents >= 2500 &&
  sA.inflectionCents === 3000 &&
  sA.rejectionFloorCents != null &&
  sA.rejectionFloorCents <= 5000 &&
  sA.elasticityAtRec != null;

const okB =
  sB != null &&
  sB.comfortCeilingCents != null &&
  sB.comfortCeilingCents >= 4000 &&
  sB.inflectionCents === 4500 &&
  sB.rejectionFloorCents != null &&
  sB.rejectionFloorCents <= 5000;

console.log("");
console.log(`Curve A: ${okA ? "✓ PASS" : "✗ FAIL"}`);
console.log(`Curve B: ${okB ? "✓ PASS" : "✗ FAIL"}`);
process.exit(okA && okB ? 0 : 1);
