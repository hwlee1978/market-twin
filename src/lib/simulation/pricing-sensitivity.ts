/**
 * Client + server shared helper for pricing-sensitivity computation.
 *
 * The aggregator (ensemble.ts) computes this once at sim time and
 * persists the result. But when the UI / PDF auto-correct the
 * recommended price (LLM anchored on base → curve revenue max),
 * the persisted sensitivity is anchored on the WRONG baseline. We
 * re-run the computation here at render time using the corrected
 * baseline so the matrix tells the truth.
 *
 * Algorithm mirrors the original in ensemble.ts. Kept in a separate
 * module so both the dashboard and the PDF can import it without
 * pulling the full ensemble aggregator graph.
 */

export interface SensitivityCurvePoint {
  priceCents: number;
  meanConversionProbability: number;
}

/**
 * Compute the curve's revenue-max price under a monotonic-decreasing
 * assumption. Real demand curves are non-increasing (conv falls as
 * price rises), but the LLM occasionally produces noise bumps at
 * high prices (e.g., conv 19% at ₩240k → 25% at ₩280k → 19% at
 * ₩300k). A naive argmax latches onto the bump.
 *
 * Fix: walk the curve in price-ascending order, taking the running
 * min of conversion (the "monotonic envelope"). Compute revenue
 * against that envelope. Bumps get capped at the prior point's
 * effective conversion and lose the false revenue spike.
 *
 * Both server (aggregator) and client (UI / PDF render) call this
 * — server-side computation persists into aggregate, client-side
 * fixes legacy aggregates that were stored with the naive argmax.
 */
export function computeCurveRevenueMaxCents(
  curve: SensitivityCurvePoint[],
): number | null {
  if (curve.length < 2) return null;
  const sortedAsc = [...curve].sort((a, b) => a.priceCents - b.priceCents);
  let runningMinConv = Infinity;
  let bestRev = -Infinity;
  let bestPrice = sortedAsc[0].priceCents;
  for (const p of sortedAsc) {
    runningMinConv = Math.min(runningMinConv, p.meanConversionProbability);
    const rev = p.priceCents * runningMinConv;
    if (rev > bestRev) {
      bestRev = rev;
      bestPrice = p.priceCents;
    }
  }
  return bestPrice;
}

/**
 * Single source of truth for "what price should the user actually see?".
 *
 * The LLM emits a `recommendedPriceCents`, but it sometimes anchors on
 * the user's input price instead of the curve's actual revenue-max
 * point. When that happens the dashboard's Pricing tab and the PDF's
 * Pricing analysis page surface the curve value as the headline; every
 * other surface (Go/No-Go signals, Summary key findings, Decision Aid
 * card) needs the SAME number or the report contradicts itself.
 *
 * Returns the curve revenue max when it diverges from the LLM rec by
 * more than ±10%, otherwise the LLM rec. Matches the inline logic at
 * EnsembleView.tsx:4578 and ensemble-pdf.tsx:3033.
 */
export function getDisplayPriceCents(
  llmRecCents: number,
  curve: SensitivityCurvePoint[],
  persistedCurveRevenueMaxCents?: number | null,
): { displayCents: number; wasCorrected: boolean; curveRevenueMaxCents: number | null } {
  const recomputed =
    computeCurveRevenueMaxCents(curve) ?? persistedCurveRevenueMaxCents ?? null;
  const matchesCurve =
    recomputed != null && llmRecCents > 0
      ? Math.abs(recomputed / llmRecCents - 1) <= 0.1
      : null;
  const wasCorrected = matchesCurve === false && recomputed != null;
  return {
    displayCents: wasCorrected ? recomputed! : llmRecCents,
    wasCorrected,
    curveRevenueMaxCents: recomputed,
  };
}

export interface PricingSensitivity {
  comfortCeilingCents: number | null;
  inflectionCents: number | null;
  rejectionFloorCents: number | null;
  elasticityAtRec: number | null;
  ifPriceUp10Pct: { conversionPct: number; revenueIndexDelta: number } | null;
  ifPriceDown10Pct: { conversionPct: number; revenueIndexDelta: number } | null;
}

export function computePricingSensitivity(
  curve: SensitivityCurvePoint[],
  recommendedPriceCents: number,
): PricingSensitivity {
  if (curve.length < 2) {
    return {
      comfortCeilingCents: null,
      inflectionCents: null,
      rejectionFloorCents: null,
      elasticityAtRec: null,
      ifPriceUp10Pct: null,
      ifPriceDown10Pct: null,
    };
  }
  const sorted = [...curve].sort((a, b) => a.priceCents - b.priceCents);

  let comfortCeilingCents: number | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].meanConversionProbability >= 0.5) {
      comfortCeilingCents = sorted[i].priceCents;
      break;
    }
  }

  let rejectionFloorCents: number | null = null;
  for (const p of sorted) {
    if (p.meanConversionProbability <= 0.1) {
      rejectionFloorCents = p.priceCents;
      break;
    }
  }

  let inflectionCents: number | null = null;
  let worstAbsDrop = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const absDrop = a.meanConversionProbability - b.meanConversionProbability;
    if (absDrop > worstAbsDrop) {
      worstAbsDrop = absDrop;
      inflectionCents = b.priceCents;
    }
  }
  if (worstAbsDrop < 0.1) inflectionCents = null;

  const interpolate = (price: number): number | null => {
    if (price < sorted[0].priceCents || price > sorted[sorted.length - 1].priceCents) {
      return null;
    }
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (price >= a.priceCents && price <= b.priceCents) {
        if (b.priceCents === a.priceCents) return a.meanConversionProbability;
        const t = (price - a.priceCents) / (b.priceCents - a.priceCents);
        return (
          a.meanConversionProbability +
          t * (b.meanConversionProbability - a.meanConversionProbability)
        );
      }
    }
    return null;
  };

  let elasticityAtRec: number | null = null;
  const ePriceLo = recommendedPriceCents * 0.98;
  const ePriceHi = recommendedPriceCents * 1.02;
  const cLo = interpolate(ePriceLo);
  const cHi = interpolate(ePriceHi);
  const cRec = interpolate(recommendedPriceCents);
  if (cLo != null && cHi != null && cRec != null && cRec > 0) {
    const dCpct = (cHi - cLo) / cRec;
    const dPpct = (ePriceHi - ePriceLo) / recommendedPriceCents;
    if (dPpct !== 0) {
      elasticityAtRec = Math.round((dCpct / dPpct) * 100) / 100;
    }
  }

  const revenueAt = (price: number): number | null => {
    const c = interpolate(price);
    return c == null ? null : price * c;
  };
  const baselineRevenue = revenueAt(recommendedPriceCents);
  const buildScenario = (
    price: number,
  ): PricingSensitivity["ifPriceUp10Pct"] => {
    const c = interpolate(price);
    if (c == null || baselineRevenue == null || baselineRevenue <= 0) return null;
    const r = price * c;
    return {
      conversionPct: Math.round(c * 1000) / 10,
      revenueIndexDelta: Math.round(((r - baselineRevenue) / baselineRevenue) * 1000) / 10,
    };
  };
  const ifPriceUp10Pct = buildScenario(recommendedPriceCents * 1.1);
  const ifPriceDown10Pct = buildScenario(recommendedPriceCents * 0.9);

  return {
    comfortCeilingCents,
    inflectionCents,
    rejectionFloorCents,
    elasticityAtRec,
    ifPriceUp10Pct,
    ifPriceDown10Pct,
  };
}
