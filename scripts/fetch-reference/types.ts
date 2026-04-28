/**
 * Common types used by the per-country reference-data fetchers.
 *
 * Each fetcher's job: pull current-year data from the country's gov / public source,
 * normalize to our schema, and write back into the corresponding SQL seed file
 * (so the change is reviewable as a git diff before being applied to the DB).
 */

export type LifeStage =
  | "employed"
  | "student"
  | "homemaker"
  | "retiree"
  | "self_employed"
  | "unemployed";

export interface ProfessionIncomeRow {
  professionCanonical: string;
  professionLocalized: { ko: string; en: string; [k: string]: string };
  lifeStage: LifeStage;
  ageGroup: string;
  incomeP25: number;
  incomeMedian: number;
  incomeP75: number;
  /** Pre-formatted display string per locale, e.g. "연 ₩45M-₩55M (~$34-42k USD)". */
  displayBand: { ko: string; en: string; [k: string]: string };
}

export interface ConsumerNorm {
  category: string;
  trustFactors: { ko: string[]; en: string[]; [k: string]: string[] };
  commonObjections: { ko: string[]; en: string[]; [k: string]: string[] };
  preferredChannels: { ko: string[]; en: string[]; [k: string]: string[] };
  culturalNotes: string;
  source: string;
}

export interface CountryStats {
  countryCode: string;
  dataYear: number;
  countryNameEn: string;
  countryNameLocal: string;
  currency: string;
  population: number;
  medianHouseholdIncome: number;
  gdpPerCapitaUsd: number;
  source: string;
  sourceUrl: string;
}

export interface CountryReferenceBundle {
  stats: CountryStats;
  professions: ProfessionIncomeRow[];
  norms: ConsumerNorm[];
  /** Source label written into country_profession_income.source. */
  professionIncomeSource: string;
}

/**
 * Each country fetcher implements this. Implementations may:
 *  • Hit a real public API (KOSIS, BLS, Destatis, ...)
 *  • Download a CSV / Excel file and parse it
 *  • Fall back to hand-curated values when the source has no API
 */
export interface CountryFetcher {
  /** ISO 3166-1 alpha-2 country code (KR, US, JP, ...). */
  readonly countryCode: string;
  /** Human label for log lines. */
  readonly label: string;
  /** Returns the current bundle. Throws if data can't be retrieved. */
  fetch(): Promise<CountryReferenceBundle>;
}
