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
 *
 * **Trust ceiling** — pricingP75 (and llmRec) bound how far the curve
 * max is allowed to override. The naive monotonic-envelope walk inside
 * `computeCurveRevenueMaxCents` can still latch onto extrapolated high-
 * price points the LLM included for completeness but the personas
 * never actually evaluated. Le Mouton 2026-05-09 sim: LLM rec ₩158,900,
 * IQR ₩116,900-₩216,000, but curve revenue max landed at ₩480,000 —
 * 2.2× P75, well outside any persona's willingness-to-pay band, and
 * the auto-correction surfaced it as the headline. When that happens
 * (curve max > 1.5× max(P75, LLM rec)), we reject the correction and
 * fall back to the LLM rec — the curve has been extrapolated past the
 * region the personas vouched for.
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
  const trustCeiling = ceilingBase > 0 ? ceilingBase * 1.5 : Infinity;
  const curveMaxRejectedAsExtrapolation =
    recomputed != null && recomputed > trustCeiling;

  // When the unconstrained curve max is outside the trust ceiling,
  // don't blindly fall back to the LLM rec — the LLM rec may not even
  // be on the curve (Le Mouton 1265510e: LLM said $124 but $124 isn't
  // a curve point and curve points within ceiling peak at $160).
  // Recompute with the ceiling as an upper bound so we surface the
  // actual best price the personas evaluated, not an arbitrary point.
  let constrainedCurveMax: number | null = null;
  if (curveMaxRejectedAsExtrapolation && Number.isFinite(trustCeiling)) {
    constrainedCurveMax = computeCurveRevenueMaxCents(curve, trustCeiling);
  }

  // Choose the headline:
  //   1. Unconstrained curve max if it's within the trust ceiling AND
  //      diverges from LLM rec by >10% (i.e. LLM was anchored on input).
  //   2. Constrained curve max when the unconstrained value was
  //      rejected as extrapolation — beats falling back to a possibly
  //      off-curve LLM rec.
  //   3. Otherwise LLM rec (when it already matches the curve or no
  //      curve evidence is available).
  let displayCents = llmRecCents;
  let wasCorrected = false;
  if (matchesCurve === false && recomputed != null && !curveMaxRejectedAsExtrapolation) {
    displayCents = recomputed;
    wasCorrected = true;
  } else if (curveMaxRejectedAsExtrapolation && constrainedCurveMax != null) {
    // Only override the LLM rec if the constrained max also differs
    // by more than 10%; otherwise the LLM rec is already close enough
    // to the curve peak and surfacing two near-identical numbers just
    // adds noise.
    const constrainedDiffers =
      llmRecCents > 0
        ? Math.abs(constrainedCurveMax / llmRecCents - 1) > 0.1
        : true;
    if (constrainedDiffers) {
      displayCents = constrainedCurveMax;
      wasCorrected = true;
    }
  }

  return {
    displayCents,
    wasCorrected,
    curveRevenueMaxCents: recomputed,
    curveMaxRejectedAsExtrapolation,
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
