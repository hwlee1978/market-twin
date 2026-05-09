/**
 * Extract retail prices from competitor URLs the user provided in
 * project setup. Used to anchor the pricing curve in real market data
 * instead of relying on LLM intuition alone.
 *
 * Approach: best-effort HTML fetch + LLM extraction. We don't try to
 * be a robust scraper — when a site blocks bots / requires JS / is
 * paywalled, we skip that URL and continue. Goal is "if we can grab
 * 2-3 prices out of 5 URLs, that's already a win."
 *
 * Pipeline per URL:
 *   1. fetch() with browser-like headers and 8s timeout
 *   2. Strip HTML to readable text (drop scripts/styles, collapse whitespace)
 *   3. Truncate to ~6K chars (LLM doesn't need the whole page)
 *   4. LLM extraction with strict JSON schema: { priceCents, currency, productName, confidence }
 *   5. Discard extractions where the LLM was not confident
 *
 * The user's `currency` is passed in so we can normalise extracted
 * prices (e.g., a US site quoting USD when the project is in KRW
 * gets normalised to KRW via a fixed exchange rate snapshot).
 */

import { z } from "zod";
import { getLLMProvider } from "@/lib/llm";

const ExtractionSchema = z.object({
  /** Cents in the extracted currency, NOT the project's. */
  priceCents: z.number().int().nonnegative(),
  /** ISO 4217 currency code (USD, KRW, JPY, …). */
  currency: z.string(),
  productName: z.string().optional(),
  /** LLM self-rated confidence 0-100. We discard <50. */
  confidence: z.number().min(0).max(100),
  /** Brief explanation surfaced in logs / debug. */
  reason: z.string().optional(),
});

export interface CompetitorPriceResult {
  url: string;
  /** Price in the PROJECT's currency (post-conversion). null on failure. */
  priceCents: number | null;
  /** Original currency of the source page (USD, KRW, ...). */
  sourceCurrency?: string;
  productName?: string;
  /** Why extraction failed (if it did) or what was found. */
  status: "extracted" | "fetch_failed" | "no_price_found" | "low_confidence";
  reason?: string;
}

const FETCH_TIMEOUT_MS = 8_000;
const HTML_MAX_CHARS = 6_000;

/**
 * Hard-coded exchange-rate snapshot for currency conversion. These
 * are NOT live rates — they're a v0.1 approximation. For production
 * we'd want a daily-refreshed rates table, but for pricing-anchor
 * use case (recommendation precision is ±20% anyway) a static snapshot
 * is good enough. Update when rates drift >10%.
 */
const EXCHANGE_RATES_TO_USD: Record<string, number> = {
  USD: 1,
  KRW: 1 / 1390, // 1 USD ≈ 1390 KRW
  JPY: 1 / 152,
  CNY: 1 / 7.2,
  TWD: 1 / 32,
  HKD: 1 / 7.8,
  SGD: 1 / 1.35,
  THB: 1 / 36,
  VND: 1 / 25500,
  IDR: 1 / 16200,
  MYR: 1 / 4.7,
  PHP: 1 / 58,
  INR: 1 / 84,
  GBP: 1 / 0.79,
  EUR: 1 / 0.93,
  CAD: 1 / 1.4,
  AUD: 1 / 1.55,
};

export function convertCurrencyCents(
  amountCents: number,
  fromCurrency: string,
  toCurrency: string,
): number | null {
  const fromRate = EXCHANGE_RATES_TO_USD[fromCurrency.toUpperCase()];
  const toRate = EXCHANGE_RATES_TO_USD[toCurrency.toUpperCase()];
  if (!fromRate || !toRate) return null;
  // amountCents → USD cents → target cents.
  const usdCents = amountCents * fromRate;
  return Math.round(usdCents / toRate);
}

// Internal alias kept for the existing call sites within this file —
// renaming above would touch every call to `convertCents` here.
const convertCents = convertCurrencyCents;
void convertCents;

/**
 * Default currency for a country code (ISO-2). Mirrors the set of
 * currencies the FX table above supports — countries we don't list
 * default to USD on the caller side. Used when we need to express a
 * KRW-input launch price in the recommended target market's local
 * currency for prompt grounding (so the LLM doesn't invent its own
 * conversion rate, which it does badly).
 */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD",
  KR: "KRW",
  JP: "JPY",
  CN: "CNY",
  TW: "TWD",
  HK: "HKD",
  SG: "SGD",
  TH: "THB",
  VN: "VND",
  ID: "IDR",
  MY: "MYR",
  PH: "PHP",
  IN: "INR",
  GB: "GBP",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  IE: "EUR",
  PT: "EUR",
  FI: "EUR",
  CA: "CAD",
  AU: "AUD",
};

/** Resolves country code → currency code; returns null when unknown. */
export function currencyForCountry(country: string): string | null {
  return COUNTRY_TO_CURRENCY[country.toUpperCase()] ?? null;
}

/**
 * Strip HTML to roughly readable text. Aggressive: removes everything
 * inside <script> / <style>, all tags, then normalises whitespace.
 * Not a real HTML parser — we just want enough text for the LLM to
 * find a price, not perfect layout preservation.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // Realistic UA so naive blockers don't 403 us. Some sites
        // (Cloudflare, PerimeterX, Akamai bot manager) will still
        // block — that's fine, we just skip those URLs.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.text();
    const text = htmlToText(body);
    return text.length > HTML_MAX_CHARS ? text.slice(0, HTML_MAX_CHARS) : text;
  } catch {
    return null;
  }
}

export async function extractCompetitorPrices(opts: {
  urls: string[];
  productCategory: string;
  /** Project currency — output prices are normalised to this. */
  targetCurrency: string;
  locale: "ko" | "en";
}): Promise<CompetitorPriceResult[]> {
  if (opts.urls.length === 0) return [];

  // Use synthesis-tier provider — cheaper LLMs miss prices in long
  // pages. We're using one shared LLM instance for all URLs (small
  // batched cost) since the quality of price extraction matters more
  // than per-call latency.
  const llm = getLLMProvider({ stage: "synthesis" });

  const results: CompetitorPriceResult[] = [];
  for (const url of opts.urls) {
    const pageText = await fetchPageText(url);
    if (!pageText) {
      results.push({ url, priceCents: null, status: "fetch_failed" });
      continue;
    }

    try {
      const prompt = buildExtractionPrompt({
        url,
        pageText,
        productCategory: opts.productCategory,
        locale: opts.locale,
      });
      const res = await llm.generate({
        system:
          "You are a precise price-extraction assistant. Given a page snippet, find the main product's retail price. Return ONLY a JSON object — no explanatory prose. If you can't find a confident price, set confidence < 50 and explain.",
        prompt,
        jsonSchema: { type: "object" },
        temperature: 0,
        maxTokens: 300,
      });
      const parsed = ExtractionSchema.safeParse(res.json);
      if (!parsed.success) {
        results.push({
          url,
          priceCents: null,
          status: "no_price_found",
          reason: "LLM output did not parse",
        });
        continue;
      }
      if (parsed.data.confidence < 50) {
        results.push({
          url,
          priceCents: null,
          status: "low_confidence",
          reason: parsed.data.reason ?? `confidence ${parsed.data.confidence}`,
        });
        continue;
      }
      const converted = convertCents(
        parsed.data.priceCents,
        parsed.data.currency,
        opts.targetCurrency,
      );
      if (converted == null) {
        results.push({
          url,
          priceCents: null,
          status: "no_price_found",
          reason: `unsupported currency conversion ${parsed.data.currency} → ${opts.targetCurrency}`,
        });
        continue;
      }
      results.push({
        url,
        priceCents: converted,
        sourceCurrency: parsed.data.currency,
        productName: parsed.data.productName,
        status: "extracted",
        reason: parsed.data.reason,
      });
    } catch (err) {
      results.push({
        url,
        priceCents: null,
        status: "no_price_found",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

function buildExtractionPrompt(opts: {
  url: string;
  pageText: string;
  productCategory: string;
  locale: "ko" | "en";
}): string {
  return `Extract the main product's retail price from this competitor page.

URL: ${opts.url}
Product category context: ${opts.productCategory}

Required JSON schema (no markdown, raw JSON):
{
  "priceCents": <integer, the price in cents of priceCents currency — e.g., $98.50 → 9850>,
  "currency": "<ISO 4217 code, e.g., USD, KRW, JPY, EUR, GBP, TWD>",
  "productName": "<the product the price refers to>",
  "confidence": <0-100, your confidence the price is the actual retail price for the main product on this page>,
  "reason": "<one short sentence explaining what you found>"
}

Rules:
- Find the MAIN product's price — not subscription, not shipping, not "from $X" range starts. If multiple SKUs are visible, take the default / most prominent one.
- For sale prices: extract the SALE price (current retail), not the strikethrough original.
- For currency: read the symbol AND any text indicators ($ alone is ambiguous between USD/SGD/CAD — use the page domain or copy hints to decide). Default to USD only if it's truly ambiguous.
- Confidence < 50 means: don't trust this extraction (page didn't show a clear price, or it was a list page rather than product detail).
- DO NOT GUESS. If you can't find a confident price in the snippet, return priceCents: 0, confidence: 0.

Page snippet:
"""
${opts.pageText}
"""`;
}
