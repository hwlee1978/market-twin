/**
 * Provenance tagging for every numeric constant that influences simulation
 * output. The point: make it impossible to add a new "magic number" without
 * declaring why it has the value it does and when it should be revisited.
 *
 * Three legal sources:
 *
 *   - DATA_DERIVED  — value comes from an external dataset (World Bank,
 *                     OECD, Statista, IR filings, etc.). Update cadence is
 *                     "when the upstream dataset refreshes." If we change
 *                     the value, we change the data — never to fit a sim.
 *
 *   - DOMAIN_RULE   — value comes from product / business judgement that
 *                     doesn't have a clean dataset (e.g., "regulatory < 30
 *                     means launch-blocker, cap finalScore at 35"). Owned
 *                     by the user. Should be stable across sims.
 *
 *   - TUNING_ANCHOR — value was chosen by looking at simulation output.
 *                     This is the dangerous category. Every TUNING_ANCHOR
 *                     must declare:
 *                       - which validation runs informed it
 *                       - what the holdout test should show
 *                       - a review-by date forcing re-evaluation
 *                     If the holdout fails, the anchor is wrong, not the
 *                     simulator.
 *
 * Adding a new TUNING_ANCHOR should feel uncomfortable. If the same fix
 * pattern (observe sim → pick number → ship) keeps producing TUNING_ANCHORs,
 * the underlying signal is wrong; reach for a DATA_DERIVED replacement
 * instead of stacking more anchors.
 */

export type CalibrationSource = "DATA_DERIVED" | "DOMAIN_RULE" | "TUNING_ANCHOR";

export interface CalibrationMetadata {
  /** Which of the three legal sources backs this value. */
  source: CalibrationSource;
  /** One-paragraph rationale: where the number came from, why it's plausible. */
  rationale: string;
  /** External data references for DATA_DERIVED, or "—" for the others. */
  references?: string[];
  /** Validation runs that informed this value (TUNING_ANCHOR only). */
  informedByRuns?: string[];
  /** Products NOT used to inform this value — must improve when re-tested.
   *  TUNING_ANCHOR only. Empty array = no holdout, value is suspect. */
  holdoutProducts?: string[];
  /** Date this value was last reviewed for accuracy. ISO date. */
  lastReviewed: string;
  /** Date this value should be re-reviewed (DATA refresh cadence, or
   *  TUNING re-derivation deadline). */
  reviewBy: string;
}

export interface CalibrationConstant<T> {
  /** The actual constant. */
  value: T;
  /** Provenance metadata. */
  meta: CalibrationMetadata;
}

/**
 * Wraps a value with provenance. Identity at runtime — cost is just the
 * extra object. Use this at the declaration site of every constant the
 * simulator depends on.
 */
export function calibrated<T>(
  value: T,
  meta: CalibrationMetadata,
): CalibrationConstant<T> {
  return { value, meta };
}
