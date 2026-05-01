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
  personaCount: number;
}
