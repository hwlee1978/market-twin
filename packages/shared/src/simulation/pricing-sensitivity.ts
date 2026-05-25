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
  /** Optional upper bound on the price we'll consider. Points above
   *  this are skipped — used to avoid extrapolation noise at the
   *  high-price tail when we know the personas never evaluated those
   *  prices. When undefined, all curve points are considered. */
  maxPriceCents?: number,
): number | null {
  if (curve.length < 2) return null;
  const sortedAsc = [...curve].sort((a, b) => a.priceCents - b.priceCents);
  let runningMinConv = Infinity;
  let bestRev = -Infinity;
  let bestPrice: number | null = null;
  for (const p of sortedAsc) {
    runningMinConv = Math.min(runningMinConv, p.meanConversionProbability);
    if (maxPriceCents != null && p.priceCents > maxPriceCents) continue;
    const rev = p.priceCents * runningMinConv;
    if (rev > bestRev) {
      bestRev = rev;
      bestPrice = p.priceCents;
    }
  }
  return bestPrice;
}

/** Trust ceiling multiplier — narrowed from 1.5× to 1.2× on
 *  2026-05-25. The wider 1.5× allowed Le Mouton's algorithm to
 *  promote $160 (29% above LLM rec $124) for a no-brand-awareness
 *  US launch, which the user flagged as too aggressive. 1.2× still
 *  permits the algorithm to override an LLM that's clearly anchored
 *  on input base, but keeps the override within a sensible band. */
const TRUST_CEILING_MULTIPLIER = 1.2;

/** Conversion floor as fraction of raw peak conversion. A candidate
 *  price gets the headline only if its envelope-clamped conversion
 *  is ≥ this fraction × peak conv. Otherwise we fall back to the
 *  LLM rec. Reasoning: revenue argmax (price × conv) can pick a
 *  high-price low-conversion point that "wins" arithmetically while
 *  killing the very volume a no-brand-awareness D2C launch needs to
 *  build early-buyer momentum (volume → reviews → ad ROI). 70% gives
 *  the algorithm room to nudge price up when conversion barely
 *  drops, but blocks "max revenue at half the conversion" outcomes.
 *  Tunable — bump to 0.8 for more conservative, drop to 0.5 for
 *  more aggressive. */
const CONVERSION_FLOOR_FRACTION = 0.7;

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
 * more than ±10%, the curve max is within the trust ceiling, AND the
 * conversion floor is satisfied at the curve max. Otherwise the LLM rec.
 *
 * **Trust ceiling** (1.2× max(P75, LLM rec)) — caps how far above the
 * LLM rec / IQR we'll override. Reflects the band the personas actually
 * evaluated. Beyond this point the curve has been extrapolated.
 *
 * **Conversion floor** (70% of peak conv) — added 2026-05-25. The
 * unconstrained envelope-revenue argmax can latch onto a high-price
 * point with crashed conversion that's still arithmetically the highest
 * `price × conv` — fine for mature pricing optimization, but a launch
 * trap for a no-brand-awareness D2C founder who needs early conversion
 * volume to build momentum. Requires the override candidate's
 * envelope-clamped conversion to be ≥ 70% of the raw peak conversion;
 * otherwise the override is rejected and the LLM rec wins (safer floor).
 */
export function getDisplayPriceCents(
  llmRecCents: number,
  curve: SensitivityCurvePoint[],
  persistedCurveRevenueMaxCents?: number | null,
  /** Optional. P75 of per-sim recommended prices — bounds how far the
   * curve max is allowed to override before we treat it as extrapolation
   * noise. Plumbing it through all callers so the headline + Pricing tab
   * never disagree on the trust check. */
  pricingP75Cents?: number | null,
): {
  displayCents: number;
  wasCorrected: boolean;
  curveRevenueMaxCents: number | null;
  /** Set to true when the curve max was rejected as extrapolation
   * (recomputed > trust ceiling). Lets the UI annotate "curve max
   * outside trusted range" rather than silently hiding the value. */
  curveMaxRejectedAsExtrapolation: boolean;
  /** True when an override candidate was rejected because its
   * envelope-clamped conversion dropped below CONVERSION_FLOOR_FRACTION
   * × peak. Lets the UI annotate "would-be revenue max sacrifices too
   * much conversion volume; sticking with LLM rec" instead of silently
   * hiding why the curve max didn't win. */
  curveMaxRejectedAsConversionCrash: boolean;
} {
  const recomputed =
    computeCurveRevenueMaxCents(curve) ?? persistedCurveRevenueMaxCents ?? null;
  const matchesCurve =
    recomputed != null && llmRecCents > 0
      ? Math.abs(recomputed / llmRecCents - 1) <= 0.1
      : null;
  // Trust ceiling — the highest curve-max value we'll surface as the
  // headline. Anything above this is treated as extrapolation noise
  // and ignored. Floor of ₩0 means "no ceiling" when neither bound is
  // available.
  const ceilingBase = Math.max(
    pricingP75Cents ?? 0,
    llmRecCents > 0 ? llmRecCents : 0,
  );
  const trustCeiling =
    ceilingBase > 0 ? ceilingBase * TRUST_CEILING_MULTIPLIER : Infinity;
  const curveMaxRejectedAsExtrapolation =
    recomputed != null && recomputed > trustCeiling;

  // When the unconstrained curve max is outside the trust ceiling,
  // recompute with the ceiling as an upper bound so we have a
  // candidate the personas actually evaluated.
  let constrainedCurveMax: number | null = null;
  if (curveMaxRejectedAsExtrapolation && Number.isFinite(trustCeiling)) {
    constrainedCurveMax = computeCurveRevenueMaxCents(curve, trustCeiling);
  }

  // Conversion-floor check — given a candidate price, walk the curve
  // ascending with the running-min envelope and return whether the
  // candidate's effective conversion is ≥ CONVERSION_FLOOR_FRACTION ×
  // raw peak conv. We use envelope (not raw) conversion at the
  // candidate because that's what the revenue computation actually
  // used; raw conv at the same point could be a noise bump.
  const peakConv =
    curve.length > 0
      ? Math.max(...curve.map((p) => p.meanConversionProbability))
      : 0;
  const passesConversionFloor = (candidateCents: number): boolean => {
    if (peakConv <= 0 || curve.length === 0) return true; // no signal — can't reject
    const sortedAsc = [...curve].sort((a, b) => a.priceCents - b.priceCents);
    let runningMin = Infinity;
    let envelopeConvAtCandidate: number | null = null;
    for (const p of sortedAsc) {
      runningMin = Math.min(runningMin, p.meanConversionProbability);
      if (p.priceCents <= candidateCents) {
        envelopeConvAtCandidate = runningMin;
      } else {
        break;
      }
    }
    // If no curve point ≤ candidate (candidate is below the cheapest
    // sampled price), accept — there's no envelope value to compare.
    if (envelopeConvAtCandidate == null) return true;
    return envelopeConvAtCandidate >= CONVERSION_FLOOR_FRACTION * peakConv;
  };

  // Choose the headline:
  //   1. Unconstrained curve max if it's within the trust ceiling AND
  //      diverges from LLM rec by >10% AND passes the conversion floor.
  //   2. Constrained curve max when (1) was rejected as extrapolation
  //      AND it passes the conversion floor AND it differs from LLM
  //      rec by >10% (otherwise it's noise vs LLM rec).
  //   3. Otherwise LLM rec (matches the curve already, OR the curve
  //      max would sacrifice too much conversion volume).
  let displayCents = llmRecCents;
  let wasCorrected = false;
  let curveMaxRejectedAsConversionCrash = false;
  if (
    matchesCurve === false &&
    recomputed != null &&
    !curveMaxRejectedAsExtrapolation
  ) {
    if (passesConversionFloor(recomputed)) {
      displayCents = recomputed;
      wasCorrected = true;
    } else {
      curveMaxRejectedAsConversionCrash = true;
    }
  } else if (curveMaxRejectedAsExtrapolation && constrainedCurveMax != null) {
    const constrainedDiffers =
      llmRecCents > 0
        ? Math.abs(constrainedCurveMax / llmRecCents - 1) > 0.1
        : true;
    if (constrainedDiffers) {
      if (passesConversionFloor(constrainedCurveMax)) {
        displayCents = constrainedCurveMax;
        wasCorrected = true;
      } else {
        curveMaxRejectedAsConversionCrash = true;
      }
    }
  }

  return {
    displayCents,
    wasCorrected,
    curveRevenueMaxCents: recomputed,
    curveMaxRejectedAsExtrapolation,
    curveMaxRejectedAsConversionCrash,
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

  // Rejection floor — the lowest price at which 90%+ rejects PURELY
  // because the price is too HIGH. Earlier revisions walked ascending
  // from the cheapest sampled price and picked the first conversion
  // ≤10% point. That worked on monotonic-decreasing curves but
  // misfired on U/J-shaped curves where the LLM models price-quality
  // signaling: "₩30k merino sneaker = too cheap = suspicion = 0.5%
  // conversion" got picked as the rejection floor, producing the
  // user-visible "이상이면 90%+ 거부" label that contradicted the
  // ₩60k=71.8% next data point.
  //
  // Fix: locate the conversion-peak first, then scan ASCENDING from
  // there. The "too-cheap-suspicion" zone (anything below peak) is
  // skipped, so only genuinely too-expensive rejection registers.
  let rejectionFloorCents: number | null = null;
  let peakIdx = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (
      sorted[i].meanConversionProbability >
      sorted[peakIdx].meanConversionProbability
    ) {
      peakIdx = i;
    }
  }
  for (let i = peakIdx; i < sorted.length; i++) {
    if (sorted[i].meanConversionProbability <= 0.1) {
      rejectionFloorCents = sorted[i].priceCents;
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
