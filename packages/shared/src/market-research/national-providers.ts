/**
 * National data provider registry — origin-keyed grounding beyond the
 * universal anchors (UN Comtrade trade flows, World Bank, Hofstede).
 *
 * Each origin (home / exporting country) can plug in the national-agency
 * equivalents of Korea's DART (listed-company financials) and MFDS
 * (food/drug regulatory). This makes the sim's brand-level grounding
 * origin-agnostic: a US-origin product gets SEC EDGAR + openFDA instead of
 * being silently ungrounded (or, before Phase 1, mislabeled Korea data).
 *
 * Phase 2 (2026-07-01): US wired first. Korea's existing DART/MFDS/KOTRA
 * anchors still run inline in prefetch.ts (gated on origin === "KR"); they
 * will migrate into this registry as a "KR" entry in a later pass.
 *
 * Every provider follows the same best-effort contract as the underlying
 * anchors: return an empty block on any miss/failure — never throw, never
 * ground on the wrong entity.
 */

import { buildSecEdgarAnchor } from "./sec-edgar";
import { buildOpenFdaAnchor } from "./openfda";

export interface NationalAnchorInput {
  category: string;
  productName?: string;
  candidateCountries: string[];
  locale?: "ko" | "en";
  asOfYear?: number;
}

export interface NationalProvider {
  /** Listed-company financials — DART (KR) / SEC EDGAR (US) / EDINET (JP)… */
  financials?: (input: NationalAnchorInput) => Promise<{ block: string }>;
  /** Food/drug regulatory context — MFDS (KR) / openFDA (US) / EFSA (EU)… */
  regulatory?: (input: NationalAnchorInput) => Promise<{ block: string }>;
}

export const NATIONAL_PROVIDERS: Record<string, NationalProvider> = {
  US: {
    financials: (i) =>
      buildSecEdgarAnchor(i.productName ?? "", {
        locale: i.locale,
        asOfYear: i.asOfYear,
      }),
    regulatory: (i) =>
      buildOpenFdaAnchor(i.category, {
        locale: i.locale,
        asOfYear: i.asOfYear,
      }),
  },
  // JP: { financials: EDINET, ... }  — next.
  // GB: { financials: Companies House, ... }
  // EU: { regulatory: EFSA / CosIng, ... }
};

export function getNationalProvider(originIso: string): NationalProvider | null {
  return NATIONAL_PROVIDERS[originIso.toUpperCase()] ?? null;
}
