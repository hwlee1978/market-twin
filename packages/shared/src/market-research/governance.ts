/**
 * Worldwide Governance Indicators (WGI) — regulatory / operational-risk
 * grounding. Free, World Bank API (source=3), universal (200+ countries).
 *
 * The macro anchors size the market and the tariff anchor prices entry, but
 * the `regulatory` / operational-risk dimension was until now the LLM's
 * free guess. WGI grounds it in hard governance scores: how strong is a
 * market's regulatory quality, rule of law, control of corruption, and
 * political stability — the real friction of actually operating there.
 *
 * Uses the 0-100 percentile-score variants (GOV_WGI_*.SC): higher = better
 * governance. Best-effort — empty block on any miss, never throws.
 */

import { ISO2_TO_ISO3 } from "./world-bank";

const WB_BASE = "https://api.worldbank.org/v2";
const WGI_TIMEOUT_MS = 6000;

// WGI 0-100 score indicators (source=3). Estimate (.EST, -2.5..2.5) also
// exists, but .SC scores read more intuitively in the prompt.
const WGI = {
  regQuality: "GOV_WGI_RQ.SC",
  ruleOfLaw: "GOV_WGI_RL.SC",
  corruptionControl: "GOV_WGI_CC.SC",
  politicalStability: "GOV_WGI_PV.SC",
} as const;

export interface GovernanceScores {
  country: string;
  /** Regulatory quality, 0-100 (higher = better). */
  regQuality: number;
  /** Rule of law, 0-100. */
  ruleOfLaw: number;
  /** Control of corruption, 0-100. */
  corruptionControl: number;
  /** Political stability & absence of violence, 0-100. */
  politicalStability: number;
  year: number;
}

/** One WGI indicator for many countries in a single call (source=3), with a
 *  small 502/503 retry (WB throttles concurrent requests). Returns iso3 →
 *  most-recent {year, value}. */
async function fetchWgiMulti(
  iso3List: string[],
  indicator: string,
): Promise<Map<string, { year: number; value: number }>> {
  const out = new Map<string, { year: number; value: number }>();
  if (iso3List.length === 0) return out;
  const url = `${WB_BASE}/country/${iso3List.join(";")}/indicator/${indicator}?format=json&source=3&mrv=3&per_page=${iso3List.length * 4}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), WGI_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = (await res.json()) as [
          unknown,
          Array<{ countryiso3code?: string; date?: string; value: number | null }>,
        ];
        const rows = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
        for (const row of rows) {
          const iso3 = row.countryiso3code;
          const year = row.date ? Number.parseInt(row.date, 10) : NaN;
          if (!iso3 || row.value == null || !Number.isFinite(year)) continue;
          const cur = out.get(iso3);
          if (!cur || year > cur.year) out.set(iso3, { year, value: row.value });
        }
        return out;
      }
      if (res.status < 500 && res.status !== 429) return out;
    } catch {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return out;
}

export async function fetchGovernance(
  countryCodes: string[],
): Promise<GovernanceScores[]> {
  const pairs = countryCodes
    .map((c) => ({ iso2: c.toUpperCase(), iso3: ISO2_TO_ISO3[c.toUpperCase()] }))
    .filter((p): p is { iso2: string; iso3: string } => Boolean(p.iso3));
  const iso3List = pairs.map((p) => p.iso3);

  const [rq, rl, cc, pv] = await Promise.all([
    fetchWgiMulti(iso3List, WGI.regQuality),
    fetchWgiMulti(iso3List, WGI.ruleOfLaw),
    fetchWgiMulti(iso3List, WGI.corruptionControl),
    fetchWgiMulti(iso3List, WGI.politicalStability),
  ]);

  const out: GovernanceScores[] = [];
  for (const { iso2, iso3 } of pairs) {
    const r = rq.get(iso3),
      l = rl.get(iso3),
      c = cc.get(iso3),
      p = pv.get(iso3);
    const year = Math.max(r?.year ?? 0, l?.year ?? 0, c?.year ?? 0, p?.year ?? 0);
    if (year === 0) continue;
    out.push({
      country: iso2,
      regQuality: r?.value ?? NaN,
      ruleOfLaw: l?.value ?? NaN,
      corruptionControl: c?.value ?? NaN,
      politicalStability: p?.value ?? NaN,
      year,
    });
  }
  return out;
}

/** Compact governance block for the country-ranking prompt (regulatory axis). */
export function renderGovernanceBlock(
  rows: GovernanceScores[],
  locale: "ko" | "en" = "ko",
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) => (b.regQuality || 0) - (a.regQuality || 0));
  const header =
    locale === "ko"
      ? "═══ 거버넌스 지표 (World Bank WGI · 0-100, 높을수록 양호) ═══"
      : "═══ GOVERNANCE INDICATORS (World Bank WGI · 0-100, higher = better) ═══";
  const legend =
    locale === "ko"
      ? "reg=규제품질, law=법치, corr=부패통제, stab=정치안정. regulatory·운영리스크 서브스코어 grounding — 낮으면 진입·운영 마찰↑."
      : "reg=regulatory quality, law=rule of law, corr=corruption control, stab=political stability. Grounds the regulatory & operational-risk sub-scores — low = higher entry/operating friction.";
  const n = (v: number) => (Number.isFinite(v) ? Math.round(v).toString().padStart(3) : "n/a");
  const lines = sorted.map(
    (r) =>
      `  ${r.country.padEnd(3)} reg=${n(r.regQuality)} law=${n(r.ruleOfLaw)} corr=${n(r.corruptionControl)} stab=${n(r.politicalStability)}  (${r.year})`,
  );
  return `${header}\n${legend}\n${lines.join("\n")}`;
}

export async function buildGovernanceAnchor(
  candidateCountries: string[],
  locale: "ko" | "en" = "ko",
): Promise<{ block: string; rows: GovernanceScores[] }> {
  const rows = await fetchGovernance(candidateCountries);
  return { block: renderGovernanceBlock(rows, locale), rows };
}
