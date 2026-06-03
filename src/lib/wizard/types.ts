/**
 * Shared types for the wizard. Keeping them in lib so the templates
 * file can reference FormState without circular import via the
 * component file.
 */

export type Objective = "awareness" | "conversion" | "retention" | "expansion";

export interface FormState {
  name: string;
  productName: string;
  category: string;
  description: string;
  basePrice: string;
  currency: string;
  objective: Objective;
  /**
   * Home market — separates the company's origin from `countries` (export
   * targets). Defaults to KR. The wizard renders this as a dropdown above
   * the candidate-countries multi-select.
   */
  originatingCountry: string;
  countries: string[];
  /**
   * Free-text competitor names (one per textarea line). Wizard sends
   * these to the server, which runs an LLM resolver to find URLs and
   * add 2-3 more competitors. Lower-friction than asking users to
   * paste URLs they don't have.
   */
  competitorNames: string;
  competitorUrls: string;
  /**
   * Creative concept descriptions (one per line in the textarea). Empty
   * string until user enters anything. Split into an array on submit.
   */
  assetDescriptions: string;
  /**
   * Optional creative asset image URLs (one per line). When provided,
   * synthesis evaluates them via Anthropic vision; otherwise the LLM
   * falls back to text-only concept scoring.
   */
  assetUrls: string;
  personaCount: number;
  /**
   * Analysis depth tier — drives which `/run-ensemble` preset gets used.
   * - hypothesis:    1 sim  × 200 = 200 personas    (fast hypothesis check)
   * - decision:      5 sims × 200 = 1,000 personas  (default)
   * - decision_plus: 15 sims × 200 = 3,000 personas (deeper consensus, single LLM)
   * - deep:          25 sims × 200 = 5,000 personas (multi-LLM, board-grade)
   * - deep_pro:      50 sims × 200 = 10,000 personas (multi-LLM, max consensus)
   */
  tier: "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro";
  /** Optional email for completion notification (deep tier 30+ min). */
  notifyEmail: string;
  /**
   * v0.2-A brand strategy hints (2026-06-03). All optional — anchor-only
   * sim when empty. Surfaced in wizard via collapsible section below
   * description. Schema mirrors ProjectInputSchema.brandStrategy + DB
   * columns (migration 0069). UI enforces 500-char cap matching the
   * server-side CHECK constraint.
   */
  founderBackground: string;
  channelPriority:
    | ""
    | "online_first"
    | "retail_first"
    | "duty_free_first"
    | "wholesale_first"
    | "omni";
  kolRelationships: string;
}
