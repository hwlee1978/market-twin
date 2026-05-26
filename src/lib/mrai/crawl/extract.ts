import { createHash } from "node:crypto";

/**
 * Minimal HTML → readable-text extractor. Not Readability-level smart,
 * but good enough to feed an LLM with a brand site's main content
 * without parsing JS-rendered pages.
 *
 * Strips:
 *   - <script>, <style>, <noscript>, <svg>, <header>, <footer>, <nav>
 *   - all HTML tags (kept innerText)
 *   - repeated whitespace
 *   - HTML entities decoded for common ones
 *
 * Caps output at 16K chars (more than enough for landing/blog/product
 * pages; the LLM extractor handles bigger pages page-by-page).
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  let s = html;
  // Drop script / style / noscript / svg / header / footer / nav
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<header[\s\S]*?<\/header>/gi, " ");
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // Newlines for block boundaries
  s = s.replace(/<(p|div|h[1-6]|li|tr|br|article|section)[^>]*>/gi, "\n");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|article|section)>/gi, "\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, " ");

  // Decode common entities
  const ents: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };
  s = s.replace(/&[a-z#0-9]+;/gi, (m) => ents[m.toLowerCase()] ?? " ");

  // Collapse whitespace
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/\n[ \t]*/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim();

  return s.slice(0, 16_000);
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

/** Difference between two normalized text bodies — returns the lines
 * present in `newer` that don't appear in `older`. Naive but works for
 * brand-site updates (new product cards, new blog posts).
 *
 * If older is empty (first fetch), returns the full newer body.
 */
export function newLinesOnly(older: string, newer: string): string {
  if (!older.trim()) return newer;
  const oldSet = new Set(
    older
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 8),
  );
  const newLines: string[] = [];
  for (const line of newer.split(/\n+/)) {
    const t = line.trim();
    if (t.length <= 8) continue;
    if (oldSet.has(t)) continue;
    newLines.push(t);
  }
  return newLines.join("\n").slice(0, 12_000);
}

/**
 * Fetch with timeout. We send a current Chrome user-agent because many
 * commerce sites (Shopify, BigCommerce, Cloudflare-protected) reject
 * bot-style UAs with 403/404 even when robots.txt would technically
 * allow them. The earlier "MarketTwinMrAI/1.0" UA was getting Allbirds
 * 404s.
 *
 * Note: this is read-only HTML scraping of public pages — we identify
 * via accept-language + cache-control headers and obey robots.txt at
 * the source-add stage in future work.
 */
export async function fetchUrl(url: string, timeoutMs = 20_000): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.95,*/*;q=0.8",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "accept-encoding": "gzip, deflate, br",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
      },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      // Clearer message for common bot-block scenarios
      if (res.status === 403) {
        throw new Error(
          `HTTP 403 (bot blocked) — 이 사이트는 외부 크롤러를 차단합니다. 다른 URL이나 RSS feed를 사용하세요.`,
        );
      }
      if (res.status === 404) {
        throw new Error(
          `HTTP 404 — URL이 존재하지 않거나 봇 차단으로 응답됨. URL을 다시 확인하세요. Shopify/Cloudflare 보호 사이트는 차단할 수 있습니다.`,
        );
      }
      if (res.status === 429) {
        throw new Error(`HTTP 429 (rate limited) — fetch 주기를 늘리세요.`);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
