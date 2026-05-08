/**
 * Pre-fetch image assets so the LLM request can carry the bytes inline
 * (base64) instead of asking the provider's backend to fetch the URL.
 *
 * Why this exists: Anthropic's `image.source.type = "url"` form makes
 * THEIR backend download the image at request time. They time out at
 * ~5s and return HTTP 400 with `x-should-retry: false` if the fetch
 * is slow. Supabase Storage URLs sometimes hit that ceiling — multi-
 * region routing, cold buckets, or simply our 25-sim ensemble making
 * Anthropic refetch the same URL 25 times within seconds.
 *
 * Fix: fetch each URL ONCE from our own server (much shorter network
 * path to Supabase) with a generous budget, convert to base64, then
 * pass `image.source.type = "base64"` to Anthropic. The provider
 * doesn't fetch anything — it just decodes the bytes we already
 * shipped in the request body.
 *
 * Failure mode: if a fetch times out or returns non-image, we DROP
 * that asset and continue. Better to lose a visual reference than to
 * fail the entire ensemble's synthesis stage.
 */

export interface InlineAsset {
  /** MIME type — Anthropic accepts image/jpeg, image/png, image/gif, image/webp. */
  mediaType: string;
  /** Base64-encoded payload (no data: prefix). */
  base64: string;
  /** Original URL — kept for debug/log only. */
  sourceUrl: string;
  /** Bytes — for log + size guard. */
  byteLength: number;
}

/** Per-URL fetch budget. Generous: Supabase cold buckets occasionally
 *  take 8-10s on first hit. Anthropic's 5s ceiling is what bites us;
 *  our own fetch can wait longer because it doesn't block anything. */
const FETCH_TIMEOUT_MS = 15_000;

/** Hard cap per asset — Anthropic accepts up to ~5MB per image, but
 *  base64 inflates by ~33% so we want raw bytes well under 4MB. Larger
 *  is dropped (logged as warning) rather than ballooning the prompt. */
const MAX_BYTES = 4 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * Fetch a single URL → base64. Returns null on any failure (timeout,
 * non-2xx, oversize, non-image content type). Never throws.
 */
async function fetchOne(url: string): Promise<InlineAsset | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(
        `[asset-fetch] ${url.slice(0, 80)}… → HTTP ${res.status} (skipped)`,
      );
      return null;
    }
    let mediaType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!mediaType || !mediaType.startsWith("image/")) {
      // Fall back to extension sniffing — some buckets serve
      // application/octet-stream regardless of file type.
      const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
      if (ext && MIME_BY_EXT[ext]) mediaType = MIME_BY_EXT[ext];
    }
    if (!mediaType.startsWith("image/")) {
      console.warn(
        `[asset-fetch] ${url.slice(0, 80)}… → non-image content type "${mediaType}" (skipped)`,
      );
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      console.warn(
        `[asset-fetch] ${url.slice(0, 80)}… → ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_BYTES / 1024 / 1024}MB cap (skipped)`,
      );
      return null;
    }
    const base64 = Buffer.from(buf).toString("base64");
    return {
      mediaType,
      base64,
      sourceUrl: url,
      byteLength: buf.byteLength,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[asset-fetch] ${url.slice(0, 80)}… → fetch failed (${reason.slice(0, 80)})`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch all URLs in parallel. Filters out failures so the caller gets a
 * clean list of inline assets — same length-or-shorter than input.
 *
 * Logging: we always log the success/skip count so an ensemble run can
 * tell at a glance whether assets dropped vs survived.
 */
export async function prefetchInlineAssets(
  urls: readonly string[],
  contextLabel: string = "ensemble",
): Promise<InlineAsset[]> {
  if (urls.length === 0) return [];
  const t0 = Date.now();
  const results = await Promise.all(urls.map(fetchOne));
  const successes = results.filter((r): r is InlineAsset => r !== null);
  const skipped = results.length - successes.length;
  const totalBytes = successes.reduce((acc, a) => acc + a.byteLength, 0);
  console.log(
    `[asset-fetch] ${contextLabel}: ${successes.length}/${urls.length} fetched ` +
      `(${(totalBytes / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)}s` +
      (skipped > 0 ? `, ${skipped} skipped` : "") +
      ")",
  );
  return successes;
}
