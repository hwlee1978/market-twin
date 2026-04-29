import { createServiceClient } from "@/lib/supabase/server";

// ─── Types ──────────────────────────────────────────────────────
export interface CountryStats {
  country_code: string;
  data_year: number;
  country_name_en: string;
  country_name_local: string | null;
  currency: string;
  population: number | null;
  median_household_income: number | null;
  gdp_per_capita_usd: number | null;
  source: string;
  source_url: string | null;
}

export interface ProfessionIncomeRow {
  country_code: string;
  data_year: number;
  profession_canonical: string;
  profession_localized: Record<string, string>;
  life_stage: string;
  age_group: string;
  income_p25: number | null;
  income_median: number | null;
  income_p75: number | null;
  income_period: string;
  currency: string;
  display_band: Record<string, string> | null;
  source: string;
}

export interface ConsumerNorms {
  country_code: string;
  data_year: number;
  category: string;
  trust_factors: Record<string, string[]> | null;
  common_objections: Record<string, string[]> | null;
  preferred_channels: Record<string, string[]> | null;
  cultural_notes: string | null;
  source: string;
}

export interface Competitor {
  country_code: string;
  category: string;
  brand_name: string;
  brand_role: string;
  segment: string | null;
  notes: string;
  source: string;
}

export interface CountryReferenceBundle {
  country: CountryStats | null;
  professions: ProfessionIncomeRow[];
  norms: ConsumerNorms | null;
  competitors: Competitor[];
}

// ─── Loader ─────────────────────────────────────────────────────
/**
 * Loads the latest-year reference bundle for each requested country + category.
 * Returns a partial map — countries without seeded data simply get an empty bundle,
 * so the prompt builder can still render something useful (falling back to LLM defaults).
 */
export async function loadReferenceBundles(
  countryCodes: string[],
  category: string,
): Promise<Record<string, CountryReferenceBundle>> {
  const supabase = createServiceClient();
  const result: Record<string, CountryReferenceBundle> = {};
  for (const code of countryCodes) {
    result[code] = { country: null, professions: [], norms: null, competitors: [] };
  }
  if (countryCodes.length === 0) return result;

  // Load all four tables in parallel.
  const [statsRes, profRes, normsRes, compRes] = await Promise.all([
    supabase
      .from("country_stats_latest")
      .select("*")
      .in("country_code", countryCodes),
    supabase
      .from("country_profession_income")
      .select("*")
      .in("country_code", countryCodes),
    supabase
      .from("country_consumer_norms")
      .select("*")
      .in("country_code", countryCodes)
      .eq("category", category),
    supabase
      .from("category_competitors")
      .select("country_code, category, brand_name, brand_role, segment, notes, source")
      .in("country_code", countryCodes.map((c) => c.toUpperCase()))
      .eq("category", category),
  ]);

  for (const s of (statsRes.data ?? []) as CountryStats[]) {
    if (result[s.country_code]) result[s.country_code].country = s;
  }

  // For profession income we want the latest year per (country, profession, age, lifeStage).
  // We loaded all years; pick latest per group below.
  const latestByKey = new Map<string, ProfessionIncomeRow>();
  for (const p of (profRes.data ?? []) as ProfessionIncomeRow[]) {
    const key = `${p.country_code}|${p.profession_canonical}|${p.age_group}|${p.life_stage}`;
    const existing = latestByKey.get(key);
    if (!existing || p.data_year > existing.data_year) latestByKey.set(key, p);
  }
  for (const p of latestByKey.values()) {
    if (result[p.country_code]) result[p.country_code].professions.push(p);
  }

  // Same latest-year picking for consumer norms.
  const normsLatest = new Map<string, ConsumerNorms>();
  for (const n of (normsRes.data ?? []) as ConsumerNorms[]) {
    const key = `${n.country_code}|${n.category}`;
    const existing = normsLatest.get(key);
    if (!existing || n.data_year > existing.data_year) normsLatest.set(key, n);
  }
  for (const n of normsLatest.values()) {
    if (result[n.country_code]) result[n.country_code].norms = n;
  }

  // Competitors live in a flat table — just append each row to its country's bundle.
  for (const c of (compRes.data ?? []) as Competitor[]) {
    const code = c.country_code;
    if (result[code]) result[code].competitors.push(c);
  }

  return result;
}

// ─── Prompt formatter ───────────────────────────────────────────
/**
 * Renders the reference bundles as a compact text block to inject into the
 * persona prompt. Keeps the language matched to the user's locale so the LLM
 * doesn't have to translate.
 */
export function renderReferenceBlock(
  bundles: Record<string, CountryReferenceBundle>,
  locale: "ko" | "en",
): string {
  const lines: string[] = [];
  const countriesWithData = Object.entries(bundles).filter(
    ([, b]) => b.country || b.professions.length > 0 || b.norms,
  );
  if (countriesWithData.length === 0) return "";

  lines.push(
    locale === "ko"
      ? "═══ 참고 데이터 (실제 정부·공공 통계 기반) ═══"
      : "═══ REFERENCE DATA (real government / public statistics) ═══",
  );

  for (const [code, b] of countriesWithData) {
    if (b.country) {
      const name = locale === "ko" ? b.country.country_name_local : b.country.country_name_en;
      lines.push(
        locale === "ko"
          ? `\n[${code} — ${name}, 출처: ${b.country.source}]`
          : `\n[${code} — ${name}, source: ${b.country.source}]`,
      );
    } else {
      lines.push(`\n[${code}]`);
    }

    if (b.professions.length > 0) {
      lines.push(
        locale === "ko" ? "직업·연령별 소득 기준선:" : "Income reference by profession × age:",
      );
      for (const p of b.professions) {
        const name = p.profession_localized[locale] ?? p.profession_canonical;
        const display = p.display_band?.[locale] ?? `${p.income_median} ${p.currency}`;
        const tag = p.life_stage === "employed" ? "" : ` (${p.life_stage})`;
        lines.push(`  • ${name} ${p.age_group}${tag}: ${display}`);
      }
    }

    if (b.norms) {
      const trust = b.norms.trust_factors?.[locale] ?? [];
      const obj = b.norms.common_objections?.[locale] ?? [];
      const ch = b.norms.preferred_channels?.[locale] ?? [];
      if (trust.length) {
        lines.push(
          locale === "ko" ? `신뢰 요인: ${trust.join(", ")}` : `Trust factors: ${trust.join(", ")}`,
        );
      }
      if (obj.length) {
        lines.push(
          locale === "ko" ? `흔한 거부감: ${obj.join(", ")}` : `Common objections: ${obj.join(", ")}`,
        );
      }
      if (ch.length) {
        lines.push(
          locale === "ko" ? `주요 채널: ${ch.join(", ")}` : `Channels: ${ch.join(", ")}`,
        );
      }
    }

    if (b.competitors.length > 0) {
      lines.push(
        locale === "ko" ? "주요 경쟁 브랜드:" : "Major competitors:",
      );
      for (const c of b.competitors) {
        // [Brand — role / segment] notes
        const segment = c.segment ? ` / ${c.segment}` : "";
        lines.push(`  • ${c.brand_name} (${c.brand_role}${segment}) — ${c.notes}`);
      }
    }
  }

  lines.push(
    locale === "ko"
      ? "\n위 reference를 anchor로 사용해 페르소나 income/직업/거부감을 구성하세요. 새로운 직업이 필요하면 위 분포에 정합되도록 추정하세요."
      : "\nUse the above reference as anchors when constructing persona income / profession / objections. If you need a profession not listed, estimate plausibly from neighbors above.",
  );

  return lines.join("\n");
}

/**
 * Convenience: which sources did we use, for attribution badges in UI / PDF.
 */
export function collectSourceAttributions(
  bundles: Record<string, CountryReferenceBundle>,
): string[] {
  const sources = new Set<string>();
  for (const b of Object.values(bundles)) {
    if (b.country) sources.add(b.country.source);
    if (b.norms) sources.add(b.norms.source);
    for (const p of b.professions) sources.add(p.source);
    for (const c of b.competitors) {
      if (c.source) sources.add(c.source);
    }
  }
  return Array.from(sources);
}
