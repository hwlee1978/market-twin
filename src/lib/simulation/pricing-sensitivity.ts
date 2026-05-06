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
