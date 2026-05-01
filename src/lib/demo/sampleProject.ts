import type { ProjectInput } from "@/lib/simulation/schemas";

/**
 * Demo project — what new users see when they click "Try a sample" on
 * an empty dashboard. Picked to be universally relatable (electronics,
 * not niche), have meaningful cross-country variation (KR/JP/US all
 * have distinct earbuds markets), and run cheaply (50 personas across
 * 3 countries instead of 200 across 5+).
 *
 * Both the wizard-friendly fields (name, productName, etc.) and the
 * runner-shaped ProjectInput are kept here so the demo API can use
 * exactly one source of truth.
 */

export const SAMPLE_PROJECT_NAME = "Demo — Premium Wireless Earbuds";
export const SAMPLE_PERSONA_COUNT = 50;

const SAMPLE_DATA = {
  name: SAMPLE_PROJECT_NAME,
  productName: "AcousticPro Buds X1",
  category: "electronics",
  description:
    "Premium wireless earbuds with adaptive active noise cancellation, 8-hour battery (28h with case), IPX5 sweat resistance, and spatial audio. Targeted at commuters and remote workers who want studio-quality audio for music + calls. Ships in matte black, sage, and ivory.",
  basePriceCents: 14900, // $149
  currency: "USD",
  objective: "conversion",
  // Origin = KR (the K-product positioning's default home market). Candidate
  // markets are export-only — keeping KR out of candidates so the demo
  // result reflects the actual use case (overseas validation, not
  // domestic-vs-overseas comparison).
  originatingCountry: "KR",
  candidateCountries: ["US", "JP", "GB"],
  competitorUrls: [],
} as const;

export function getSampleProjectInput(): ProjectInput {
  return {
    productName: SAMPLE_DATA.productName,
    category: SAMPLE_DATA.category,
    description: SAMPLE_DATA.description,
    basePriceCents: SAMPLE_DATA.basePriceCents,
    currency: SAMPLE_DATA.currency,
    objective: SAMPLE_DATA.objective,
    originatingCountry: SAMPLE_DATA.originatingCountry,
    candidateCountries: [...SAMPLE_DATA.candidateCountries],
    competitorUrls: [...SAMPLE_DATA.competitorUrls],
  };
}

/** Wizard-shaped record for the projects table insert. */
export function getSampleProjectRecord() {
  return { ...SAMPLE_DATA };
}
