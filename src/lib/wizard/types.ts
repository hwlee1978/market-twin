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
}
