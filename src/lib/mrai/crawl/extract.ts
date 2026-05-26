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

/** Fetch with timeout, brand-friendly user-agent. */
export async function fetchUrl(url: string, timeoutMs = 15_000): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "MarketTwinMrAI/1.0 (+https://markettwin.ai/crawler) Mozilla/5.0",
        accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*;q=0.8",
      },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
