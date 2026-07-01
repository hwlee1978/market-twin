/**
 * SEC EDGAR (US listed-company financials) anchor — the US counterpart to
 * the Korean DART anchor. Phase 2 (2026-07-01): first non-KR national data
 * provider, so an originatingCountry="US" sim gets a real company-scale
 * prior instead of being silently ungrounded.
 *
 * Resolution strategy (mirrors DART's curated slug→corp map, but built to
 * avoid ever grounding on the WRONG company):
 *   1. A curated brand-keyword → ticker map (tickers are easy to verify).
 *   2. SEC's authoritative company_tickers.json resolves ticker → {CIK, title}
 *      at runtime, so the CIK and official company name always come from SEC
 *      itself — we never hardcode a possibly-stale CIK.
 *   3. companyfacts XBRL gives the latest annual revenue (USD).
 * Unknown product → empty block (no anchor), never a wrong-company anchor.
 *
 * Best-effort: any fetch/parse failure returns an empty block and the sim
 * runs without the anchor (same contract as dart.ts / comtrade.ts).
 */

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts";
const TIMEOUT_MS = 8000;
// SEC's fair-access policy requires a descriptive User-Agent with contact.
const UA = "MarketTwin/1.0 market-research anchor (contact@markettwin.ai)";

/**
 * Curated brand / product keyword → US-listed ticker. Lowercase keywords,
 * matched as substrings against the product name. Extend as coverage grows.
 * Tickers only — the CIK + official name are resolved from SEC at runtime.
 */
const KEYWORD_TO_TICKER: Array<[string, string]> = [
  ["apple", "AAPL"], ["iphone", "AAPL"], ["ipad", "AAPL"], ["mac", "AAPL"],
  ["tesla", "TSLA"],
  ["coca-cola", "KO"], ["coca cola", "KO"], ["coke", "KO"],
  ["pepsi", "PEP"], ["pepsico", "PEP"], ["gatorade", "PEP"], ["lay's", "PEP"], ["doritos", "PEP"],
  ["nike", "NKE"],
  ["procter", "PG"], ["gillette", "PG"], ["pampers", "PG"], ["olay", "PG"],
  ["estee lauder", "EL"], ["estée lauder", "EL"], ["clinique", "EL"], ["la mer", "EL"],
  ["e.l.f", "ELF"], ["elf beauty", "ELF"], ["elf cosmetics", "ELF"],
  ["coty", "COTY"], ["cover girl", "COTY"], ["covergirl", "COTY"],
  ["mondelez", "MDLZ"], ["oreo", "MDLZ"], ["cadbury", "MDLZ"],
  ["hershey", "HSY"],
  ["general mills", "GIS"], ["cheerios", "GIS"], ["haagen", "GIS"],
  ["colgate", "CL"], ["palmolive", "CL"],
  ["church & dwight", "CHD"], ["arm & hammer", "CHD"],
  ["kellanova", "K"], ["kellogg", "K"], ["pringles", "K"],
  ["clorox", "CLX"],
  ["mccormick", "MKC"],
  ["starbucks", "SBUX"],
];

function resolveTicker(productName: string): string | null {
  const name = productName.toLowerCase();
  for (const [kw, ticker] of KEYWORD_TO_TICKER) {
    if (name.includes(kw)) return ticker;
  }
  return null;
}

interface TickerEntry {
  cik: string; // 10-digit zero-padded
  title: string;
}

// Process-level cache of the ticker→{cik,title} index (best-effort; a cold
// serverless invocation just re-fetches once).
let tickerIndex: Map<string, TickerEntry> | null = null;

async function loadTickerIndex(): Promise<Map<string, TickerEntry>> {
  if (tickerIndex) return tickerIndex;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(TICKERS_URL, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA },
    });
    clearTimeout(timer);
    if (!res.ok) return new Map();
    const json = (await res.json()) as Record<
      string,
      { cik_str: number; ticker: string; title: string }
    >;
    const idx = new Map<string, TickerEntry>();
    for (const row of Object.values(json)) {
      if (!row?.ticker) continue;
      idx.set(row.ticker.toUpperCase(), {
        cik: String(row.cik_str).padStart(10, "0"),
        title: row.title,
      });
    }
    tickerIndex = idx;
    return idx;
  } catch {
    clearTimeout(timer);
    return new Map();
  }
}

export interface SecFinancials {
  ticker: string;
  cik: string;
  companyName: string;
  fiscalYear: number;
  revenueUsd: number;
}

// XBRL revenue concepts, in preference order (companies tag differently).
const REVENUE_CONCEPTS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
];

async function fetchSecFinancials(
  ticker: string,
  entry: TickerEntry,
  asOfYear?: number,
): Promise<SecFinancials | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${FACTS_URL}/CIK${entry.cik}.json`, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      facts?: {
        "us-gaap"?: Record<
          string,
          {
            units?: {
              USD?: Array<{
                val: number;
                fy?: number;
                fp?: string;
                form?: string;
                frame?: string;
              }>;
            };
          }
        >;
      };
    };
    const gaap = json.facts?.["us-gaap"];
    if (!gaap) return null;
    for (const concept of REVENUE_CONCEPTS) {
      const usd = gaap[concept]?.units?.USD;
      if (!usd?.length) continue;
      // Annual figures: 10-K, full-year period (fp=FY), with a CY/FY frame.
      const annual = usd.filter(
        (e) =>
          e.form === "10-K" &&
          e.fp === "FY" &&
          typeof e.fy === "number" &&
          typeof e.frame === "string" &&
          (asOfYear == null || (e.fy ?? 0) <= asOfYear),
      );
      if (!annual.length) continue;
      annual.sort((a, b) => (b.fy ?? 0) - (a.fy ?? 0));
      const best = annual[0];
      return {
        ticker,
        cik: entry.cik,
        companyName: entry.title,
        fiscalYear: best.fy as number,
        revenueUsd: best.val,
      };
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export function renderSecBlock(
  fin: SecFinancials | null,
  locale?: "ko" | "en",
): string {
  if (!fin) return "";
  const isKo = locale !== "en";
  const revB = (fin.revenueUsd / 1e9).toFixed(2);
  const header = isKo
    ? `═══ SEC EDGAR ${fin.fiscalYear} 연차보고서 (${fin.companyName}, ${fin.ticker}) — 회사 규모 prior ═══`
    : `═══ SEC EDGAR ${fin.fiscalYear} annual filing (${fin.companyName}, ${fin.ticker}) — company-scale prior ═══`;
  const line = isKo
    ? `  매출: $${revB}B (US 상장, CIK ${fin.cik})`
    : `  Revenue: $${revB}B (US-listed, CIK ${fin.cik})`;
  const note = isKo
    ? "주의: 회사 전체 연결 매출로, 본 제품 단일 매출이 아닙니다. \"이 회사가 얼마나 큰가\"라는 절대 규모 prior로만 활용하세요."
    : "Note: Company-wide consolidated revenue, not single-product sales. Use only as an absolute company-scale prior.";
  return `${header}\n${line}\n\n${note}`;
}

/**
 * Top-level convenience — resolve the product to a US-listed company and
 * render its company-scale financial anchor block. Empty when unresolved.
 */
export async function buildSecEdgarAnchor(
  productName: string,
  opts: { locale?: "ko" | "en"; asOfYear?: number } = {},
): Promise<{ block: string; financials: SecFinancials | null }> {
  const ticker = resolveTicker(productName ?? "");
  if (!ticker) return { block: "", financials: null };
  const idx = await loadTickerIndex();
  const entry = idx.get(ticker);
  if (!entry) return { block: "", financials: null };
  const fin = await fetchSecFinancials(ticker, entry, opts.asOfYear);
  return { block: renderSecBlock(fin, opts.locale), financials: fin };
}
