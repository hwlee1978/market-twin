/**
 * LLM narrative extractor — Phase F.1-B v3 (single-segment brand cover).
 *
 * For brands whose 사업보고서 lacks structured K-IFRS 8 segment disclosure
 * (single-segment entities like 빙그레/농심/삼양/하이트진로), this module
 * extracts overseas-presence signal from the prose narrative ("II. 사업의 내용"
 * section). LLM prompt asks for country + presence type + evidence quote.
 *
 * Cost: ~$0.001-0.005 per brand per refresh (Haiku tier, ~5K tokens narrative).
 * Cache: 30-day TTL in validation/reference/dart-narratives/{slug}.json
 *
 * Failure modes (graceful degradation):
 *   - Anthropic key missing → return null
 *   - Narrative section not locatable → null
 *   - LLM returns malformed JSON → null
 *   - Empty extraction (no countries mentioned) → empty array
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { fetchReportXml, findLatestAnnualReport } from "./dart-region-parser";

const CACHE_DIR = "validation/reference/dart-narratives";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NARRATIVE_MAX_CHARS = 8000; // enough for "II. 사업의 내용" excerpt

export type PresenceType =
  | "subsidiary"        // 현지법인
  | "manufacturing"     // 생산법인
  | "direct_export"     // 직수출
  | "indirect_export"   // 간접수출
  | "office"            // 사무소 / 지점
  | "joint_venture"     // 합작법인
  | "licensing"         // 라이선스
  | "unknown";

export interface ExtractedCountry {
  iso2: string;            // ISO alpha-2 (best-effort from LLM)
  nameKo: string;
  presence: PresenceType;
  evidence: string;        // 사업보고서 원문 인용 (1-2 sentences)
  sinceYear: number | null;
  revenueUsdM: number | null;
  confidence: "high" | "medium" | "low";
}

export interface NarrativeExtractResult {
  corpCode: string;
  corpNameKo: string;
  reportRceptNo: string;
  extractedAt: string;
  narrativeChars: number;
  countries: ExtractedCountry[];
}

/** Locate the "II. 사업의 내용" excerpt from a 사업보고서 XML and strip tags. */
function extractNarrative(xml: string): string | null {
  const markers = [
    "II. 사업의 내용",
    "Ⅱ. 사업의 내용",
    "II.사업의 내용",
    "II. 사업의내용",
    "사업의 내용",
  ];
  let pos = -1;
  for (const m of markers) {
    const p = xml.indexOf(m);
    if (p >= 0 && (pos < 0 || p < pos)) pos = p;
  }
  if (pos < 0) return null;
  const slice = xml.slice(pos, pos + 80_000); // enough room for the section
  // Strip tags, collapse whitespace
  const text = slice.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, NARRATIVE_MAX_CHARS);
}

const SYSTEM_PROMPT = `너는 한국 상장기업의 사업보고서를 분석하는 신뢰성 있는 분석가다.
사용자가 주는 사업보고서 본문 일부에서, 회사가 진출한 해외 국가를 식별한다.
정확히 명시된 국가만 추출 — 추측 금지. 회사 본사 (한국)는 제외.`;

const USER_PROMPT_TEMPLATE = (corpNameKo: string, narrative: string) => `회사: ${corpNameKo}
사업보고서 본문 일부 (II. 사업의 내용):

---
${narrative}
---

JSON 응답 (단일 JSON 객체, 다른 텍스트 없음):
{
  "countries": [
    {
      "iso2": "ISO alpha-2 코드 (VN, US, CN, JP, ...)",
      "nameKo": "한국어 국가명",
      "presence": "subsidiary | manufacturing | direct_export | indirect_export | office | joint_venture | licensing | unknown",
      "evidence": "사업보고서 원문 인용 (한 문장)",
      "sinceYear": 진출 연도 (정수) 또는 null,
      "revenueUsdM": 매출 (USD 백만) 또는 null,
      "confidence": "high | medium | low"
    }
  ]
}

회사 본사 (한국)는 제외. 본문에 명시된 외국법인/지사/수출국가만 포함.`;

function parseLlmJson(raw: string): { countries: ExtractedCountry[] } | null {
  // Try direct parse
  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.countries)) return obj;
  } catch {
    // fall through to extraction
  }
  // Extract first {...} block
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    if (Array.isArray(obj.countries)) return obj;
  } catch {
    return null;
  }
  return null;
}

function cachePath(slug: string): string {
  return resolve(process.cwd(), CACHE_DIR, `${slug}.json`);
}

function readCache(slug: string): NarrativeExtractResult | null {
  const p = cachePath(slug);
  if (!existsSync(p)) return null;
  try {
    const stat = statSync(p);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null; // stale
    return JSON.parse(readFileSync(p, "utf8")) as NarrativeExtractResult;
  } catch {
    return null;
  }
}

function writeCache(slug: string, result: NarrativeExtractResult): void {
  const p = cachePath(slug);
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(result, null, 2), "utf8");
  } catch (err) {
    console.warn(`[dart-narrative] cache write failed: ${(err as Error).message}`);
  }
}

/**
 * Run LLM narrative extraction for a single brand (corp_code).
 * Cached per slug for 30 days. Returns null on any failure.
 */
export async function extractBrandNarrative(
  slug: string,
  corpCode: string,
  corpNameKo: string,
  opts: { apiKey?: string; anthropicKey?: string; force?: boolean } = {},
): Promise<NarrativeExtractResult | null> {
  if (!opts.force) {
    const cached = readCache(slug);
    if (cached) return cached;
  }

  const dartKey = opts.apiKey ?? process.env.DART_API_KEY;
  const anthropicKey = opts.anthropicKey ?? process.env.ANTHROPIC_API_KEY;
  if (!dartKey || !anthropicKey) return null;

  const report = await findLatestAnnualReport(corpCode, dartKey);
  if (!report) return null;
  const xml = await fetchReportXml(report.rceptNo, dartKey);
  if (!xml) return null;
  const narrative = extractNarrative(xml);
  if (!narrative) return null;

  const client = new Anthropic({ apiKey: anthropicKey });
  let llmText = "";
  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: USER_PROMPT_TEMPLATE(corpNameKo, narrative) }],
    });
    const block = resp.content.find((b) => b.type === "text");
    llmText = block && block.type === "text" ? block.text : "";
  } catch (err) {
    console.warn(`[dart-narrative] LLM call failed: ${(err as Error).message}`);
    return null;
  }

  const parsed = parseLlmJson(llmText);
  if (!parsed) {
    console.warn(`[dart-narrative] malformed LLM JSON for ${slug}: ${llmText.slice(0, 200)}`);
    return null;
  }

  const result: NarrativeExtractResult = {
    corpCode,
    corpNameKo,
    reportRceptNo: report.rceptNo,
    extractedAt: new Date().toISOString(),
    narrativeChars: narrative.length,
    countries: parsed.countries.filter((c): c is ExtractedCountry => Boolean(c?.iso2 && c?.nameKo)),
  };
  writeCache(slug, result);
  return result;
}

/** Render extracted narrative as a prompt block (mirrors DART region block style). */
export function renderNarrativeBlock(
  result: NarrativeExtractResult | null,
  candidateCountries: string[],
  opts: { locale?: "ko" | "en" } = {},
): string {
  if (!result || result.countries.length === 0) return "";
  const isKo = opts.locale !== "en";
  const candidateSet = new Set(candidateCountries.map((c) => c.toUpperCase()));
  const relevant = result.countries.filter((c) => candidateSet.has(c.iso2.toUpperCase()));
  if (relevant.length === 0) return "";

  const header = isKo
    ? `═══ DART narrative-extracted 진출 국가 (${result.corpNameKo}) — LLM 정리, ${result.reportRceptNo} ═══`
    : `═══ DART narrative-extracted overseas presence (${result.corpNameKo}) — LLM extracted, ${result.reportRceptNo} ═══`;
  const lines = relevant.map((c) => {
    const confTag = c.confidence === "high" ? "★★★" : c.confidence === "medium" ? "★★" : "★";
    const rev = c.revenueUsdM ? ` ~$${c.revenueUsdM}M` : "";
    const since = c.sinceYear ? ` (since ${c.sinceYear})` : "";
    return `  ${c.iso2.padEnd(3)} ${c.nameKo.padEnd(6)} ${c.presence.padEnd(15)}${rev}${since} ${confTag} — "${c.evidence.slice(0, 80)}..."`;
  });
  const note = isKo
    ? `주의: LLM이 사업보고서 narrative에서 추출한 진출 신호. 정형 segment disclosure 부재 시 fallback. 매출액은 본문에 명시된 경우만 (대다수 null). confidence는 LLM 자체 평가.`
    : `Note: LLM-extracted overseas presence signal from narrative when structured segment disclosure is absent. Revenue figures only when explicitly stated in text. Confidence is LLM self-rating.`;
  return `${header}\n${lines.join("\n")}\n\n${note}`;
}
