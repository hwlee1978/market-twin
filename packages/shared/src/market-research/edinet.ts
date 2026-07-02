/**
 * EDINET (Japan listed-company financials) anchor — the JP counterpart to
 * DART (KR) and SEC EDGAR (US). Phase 2 (2026-07).
 *
 * Unlike SEC's clean per-company companyfacts API, EDINET's API is
 * date-indexed (documents.json by day, no company-lookup endpoint), so
 * resolving a company's latest annual securities report (有価証券報告書)
 * inline would require a fragile multi-day scan on every request. Instead we
 * ship a periodically-refreshed snapshot (edinet-snapshot.json) built offline
 * by scripts/fetch_edinet_financials.py, and read from it at request time —
 * fast, robust, no runtime EDINET calls (same pattern as the static MFDS /
 * Hofstede anchors).
 *
 * Revenue = current-year (CurrentYearDuration) consolidated net sales /
 * revenue (IFRS) from the 主要な経営指標等の推移 summary. Unknown product →
 * empty block (never a wrong-company anchor).
 */

import snapshot from "./edinet-snapshot.json";

/**
 * Curated brand / product keyword → EDINET 5-digit securities code. Lowercase
 * keywords, matched as substrings against the product name. The company name
 * and revenue come from the verified snapshot, never from the keyword.
 */
const KEYWORD_TO_SECCODE: Array<[string, string]> = [
  ["nintendo", "79740"],
  ["meiji", "22690"],
  ["shiseido", "49110"],
  ["kao", "44520"], ["bioré", "44520"], ["biore", "44520"],
  ["uniqlo", "99830"], ["fast retailing", "99830"], ["gu ", "99830"],
  ["kikkoman", "28010"], ["soy sauce", "28010"],
  ["nissin", "28970"], ["cup noodle", "28970"], ["cup noodles", "28970"],
  ["kirin", "25030"],
  ["asahi", "25020"],
  ["suntory", "25870"],
  ["kose", "49220"], ["decorté", "49220"], ["decorte", "49220"],
  ["pola", "49270"],
  ["muji", "74530"], ["ryohin", "74530"],
  ["yakult", "22670"],
  ["calbee", "22290"],
  ["unicharm", "81130"], ["sofy", "81130"], ["moony", "81130"],
];

interface EdinetRow {
  name: string;
  fiscalYear: string;
  netSalesJpy: number;
}

const SNAP = snapshot as Record<string, EdinetRow>;
// Rough JPY→USD (¥ ~150 / USD) — a coarse scale reference only.
const JPY_PER_USD = 150;

function resolveSecCode(productName: string): string | null {
  const n = productName.toLowerCase();
  for (const [kw, sc] of KEYWORD_TO_SECCODE) {
    if (n.includes(kw)) return sc;
  }
  return null;
}

export function renderEdinetBlock(
  row: EdinetRow | null,
  secCode: string,
  locale?: "ko" | "en",
): string {
  if (!row) return "";
  const isKo = locale !== "en";
  const revT = (row.netSalesJpy / 1e12).toFixed(2);
  const revUsdB = (row.netSalesJpy / JPY_PER_USD / 1e9).toFixed(1);
  const header = isKo
    ? `═══ EDINET ${row.fiscalYear} 유가증권보고서 (${row.name}) — 회사 규모 prior ═══`
    : `═══ EDINET ${row.fiscalYear} annual securities report (${row.name}) — company-scale prior ═══`;
  const line = isKo
    ? `  매출: ¥${revT}조 (~$${revUsdB}B, JP 상장, sec ${secCode})`
    : `  Net sales: ¥${revT}T (~$${revUsdB}B, JP-listed, sec ${secCode})`;
  const note = isKo
    ? "주의: 회사 전체 연결 매출로, 본 제품 단일 매출이 아닙니다. \"이 회사가 얼마나 큰가\"라는 절대 규모 prior로만 활용하세요."
    : "Note: Company-wide consolidated revenue, not single-product sales. Use only as an absolute company-scale prior.";
  return `${header}\n${line}\n\n${note}`;
}

export async function buildEdinetAnchor(
  productName: string,
  opts: { locale?: "ko" | "en"; asOfYear?: number } = {},
): Promise<{ block: string; row: EdinetRow | null }> {
  const sc = resolveSecCode(productName ?? "");
  const row = sc ? (SNAP[sc] ?? null) : null;
  return { block: renderEdinetBlock(row, sc ?? "", opts.locale), row };
}
