/**
 * Competitor URL resolution + auto-discovery.
 *
 * Wizard previously asked the user to paste competitor URLs, which is
 * high-friction. Now the user types competitor NAMES (or pastes some
 * URLs they already have), and this module:
 *
 *  1. Asks an LLM to find a likely public URL for each user-named
 *     competitor (typically the official site or a major retailer
 *     listing).
 *  2. Asks the same LLM to suggest 2-3 ADDITIONAL competitors the user
 *     might not have mentioned, given the product / category / target
 *     markets.
 *  3. Lightly validates URLs with HEAD requests (2s timeout per URL,
 *     dead ones drop). Trade-off: ~1-3s added to project creation, but
 *     dead URLs would silently break price extraction downstream.
 *
 * Returns a single ResolvedCompetitor[] with attribution so the UI
 * can split "your input" vs "AI-discovered" sections.
 *
 * Failure mode: if the LLM call fails entirely, returns whatever
 * user-named competitors we have with no URL — pipeline still works
 * (price extraction will skip them) and the display shows them as
 * user-supplied with "URL not found".
 */

import { z } from "zod";
import { getLLMProvider } from "@/lib/llm";

export const ResolvedCompetitorSchema = z.object({
  /** Display name of the competitor (brand or product). */
  name: z.string(),
  /** Likely public URL. Empty string if LLM couldn't find one OR
   *  validation failed. Code downstream treats empty as "skip extraction". */
  url: z.string().default(""),
  /** Where this entry came from: user typed it, or LLM proposed it. */
  source: z.enum(["user", "llm"]),
  /** For source=llm only: 1-sentence rationale for why this competitor
   *  is relevant to the product. Helps the user audit AI suggestions. */
  reason: z.string().optional(),
});
export type ResolvedCompetitor = z.infer<typeof ResolvedCompetitorSchema>;

const LLM_RESPONSE_SCHEMA = z.object({
  // Order-aligned with input userNames; one entry per user-named
  // competitor (LLM may emit empty url string when uncertain).
  resolvedUserNames: z.array(
    z.object({
      name: z.string(),
      url: z.string().default(""),
    }),
  ),
  additions: z.array(
    z.object({
      name: z.string(),
      url: z.string().default(""),
      reason: z.string().optional(),
    }),
  ).max(5),
});

interface ResolveOpts {
  productName: string;
  category: string | null;
  description: string;
  candidateCountries: string[];
  /** Names typed by the user (one entry per line). Empty array OK —
   *  LLM still discovers 2-3 competitors from the product context alone. */
  userNames: string[];
  /** URLs the user already pasted (treated as user-source, no LLM
   *  resolution needed for these). */
  userUrls: string[];
  locale: "ko" | "en";
}

/**
 * Quick HEAD validation — drop URLs that don't resolve within 2s.
 * Returns the same list with bad URLs replaced by empty string. We
 * don't error; missing URL is a soft state the UI handles gracefully.
 */
async function validateUrls(items: ResolvedCompetitor[]): Promise<ResolvedCompetitor[]> {
  const validated = await Promise.all(
    items.map(async (item) => {
      if (!item.url) return item;
      try {
        const u = new URL(item.url);
        if (!/^https?:$/.test(u.protocol)) {
          return { ...item, url: "" };
        }
      } catch {
        return { ...item, url: "" };
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(item.url, {
          method: "HEAD",
          signal: ctrl.signal,
          redirect: "follow",
        });
        clearTimeout(t);
        // Some sites block HEAD with 403/405 — accept those as "exists",
        // since GET-time extraction may still work. Only kill on 404 / 410.
        if (res.status === 404 || res.status === 410) {
          return { ...item, url: "" };
        }
        return item;
      } catch {
        // Network error / timeout / aborted → treat as dead URL but
        // keep the entry (UI shows "URL not verified").
        return { ...item, url: "" };
      }
    }),
  );
  return validated;
}

export async function resolveCompetitors(
  opts: ResolveOpts,
): Promise<ResolvedCompetitor[]> {
  const userNamesTrimmed = opts.userNames.map((n) => n.trim()).filter(Boolean);
  const userUrlsTrimmed = opts.userUrls.map((u) => u.trim()).filter(Boolean);

  // Fast path: user supplied nothing → LLM still adds 2-3 to seed the
  // analysis. Still call the LLM with empty userNames.
  const llm = getLLMProvider({ stage: "synthesis" });

  const isKo = opts.locale === "ko";
  const langInstruction = isKo
    ? "Output names in their canonical / international form (English where applicable for global brands). reason 텍스트는 한국어로 작성."
    : "Output names in their canonical / international form. Write reason text in English.";

  const prompt = `You are a market research assistant. For the product below, (a) find the likely public URL for each competitor the user named, and (b) suggest 2-3 ADDITIONAL relevant competitors the user did not mention.

Product: ${opts.productName}${opts.category ? ` (${opts.category})` : ""}
Description: ${opts.description}
Target markets: ${opts.candidateCountries.join(", ") || "(any)"}

User-named competitors (resolve URLs for these — keep the user's spelling unless it's clearly a typo):
${userNamesTrimmed.length > 0 ? userNamesTrimmed.map((n, i) => `  ${i + 1}. ${n}`).join("\n") : "  (none — discover competitors from the product context alone)"}

URL guidance:
- Prefer the brand's official site if you're confident it exists.
- Otherwise pick a major retailer product page (Amazon, Sephora, Olive Young, etc.) where the competitor is sold in one of the target markets.
- If you cannot identify a real, plausibly-still-live URL, return an empty string — DO NOT fabricate.
- URL format: full https:// URL.

Additions guidance:
- Suggest 2-3 competitors that genuinely compete with this product for the same buyer in the target markets.
- Do NOT repeat any user-named competitor.
- Each addition needs a short \`reason\` (1 sentence) explaining why it's a relevant competitor.

${langInstruction}

Return JSON:
{
  "resolvedUserNames": [ { "name": "string (the user's name kept verbatim or lightly normalised)", "url": "https://... or empty string" } ],
  "additions": [ { "name": "string", "url": "https://... or empty string", "reason": "1-sentence why" } ]
}`;

  let llmJson: unknown;
  try {
    const res = await llm.generate({
      prompt,
      jsonSchema: {
        type: "object",
        properties: {
          resolvedUserNames: { type: "array" },
          additions: { type: "array" },
        },
        required: ["resolvedUserNames", "additions"],
      },
      temperature: 0.3,
      maxTokens: 2048,
    });
    llmJson = res.json;
  } catch (err) {
    console.warn("[competitor-resolver] LLM call failed:", err);
    // Fallback: return user names with empty URLs + their pasted URLs.
    return [
      ...userNamesTrimmed.map((name) => ({ name, url: "", source: "user" as const })),
      ...userUrlsTrimmed.map((url) => ({ name: nameFromUrl(url), url, source: "user" as const })),
    ];
  }

  const parsed = LLM_RESPONSE_SCHEMA.safeParse(llmJson);
  if (!parsed.success) {
    console.warn(
      "[competitor-resolver] LLM response failed schema:",
      parsed.error.flatten(),
    );
    return [
      ...userNamesTrimmed.map((name) => ({ name, url: "", source: "user" as const })),
      ...userUrlsTrimmed.map((url) => ({ name: nameFromUrl(url), url, source: "user" as const })),
    ];
  }

  // Build the unified list.
  const userResolved: ResolvedCompetitor[] = parsed.data.resolvedUserNames.map(
    (r) => ({ name: r.name, url: r.url, source: "user" as const }),
  );
  // Append URLs the user pasted directly — they're user-source already,
  // skip LLM resolution. URL → display name = hostname.
  for (const url of userUrlsTrimmed) {
    userResolved.push({ name: nameFromUrl(url), url, source: "user" as const });
  }
  // Cap LLM additions at 3.
  const additions: ResolvedCompetitor[] = parsed.data.additions
    .slice(0, 3)
    .map((a) => ({
      name: a.name,
      url: a.url,
      source: "llm" as const,
      reason: a.reason,
    }));

  // Validate URLs in parallel — drops dead URLs (replaces with empty
  // string) without removing the entry itself.
  return await validateUrls([...userResolved, ...additions]);
}

/** Extract a readable display name from a raw URL. */
function nameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
