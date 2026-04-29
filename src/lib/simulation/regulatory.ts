import { z } from "zod";
import type { LLMProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import type { ProjectInput } from "./schemas";
import type { PromptLocale } from "./prompts";

/**
 * Regulatory pre-check.
 *
 * Runs BEFORE persona generation so we never produce a "Singapore is your
 * best market for e-cigarettes" recommendation.
 *
 * Two-stage strategy:
 *   1. Ask the LLM (Sonnet-class) ONLY to classify the product into one
 *      of the curated regulated subcategories (vaping / alcohol / etc.).
 *      If the product isn't regulated, the LLM returns an empty label
 *      and every country is marked allowed.
 *   2. Look up the curated category_regulations table for that
 *      subcategory × candidate countries. DB rows are authoritative —
 *      they cite the actual Act + agency, so the result page can show
 *      a verifiable warning to the customer's legal team.
 *
 * For countries with no DB row in the matched category we fall back to
 * the LLM's own assessment for safety. Banned countries are removed
 * from `candidateCountries` before downstream stages run.
 */

// ─── Schema ─────────────────────────────────────────────────────
export const RegulatoryStatusSchema = z.enum(["allowed", "restricted", "banned"]);
export type RegulatoryStatus = z.infer<typeof RegulatoryStatusSchema>;

export const RegulatoryCheckSchema = z.object({
  country: z.string(),
  status: RegulatoryStatusSchema,
  reason: z.string().optional().default(""),
  source: z.string().optional().default(""),
});
export type RegulatoryCheck = z.infer<typeof RegulatoryCheckSchema>;

export const RegulatoryResultSchema = z.object({
  checks: z.array(RegulatoryCheckSchema),
  regulatedCategory: z.string().optional().default(""),
});
export type RegulatoryResult = z.infer<typeof RegulatoryResultSchema>;

// Subset of regulated_category labels the LLM can assign. Keep this in
// sync with the seed data in 0021_category_regulations.sql so the DB
// lookup actually finds rows.
const REGULATED_CATEGORIES = [
  "vaping",
  "alcohol",
  "cannabis_cbd",
  "tobacco",
  "gambling",
  "crypto_finance",
  "firearms",
  "dietary_supplement",
  "adult_content",
  "pharmaceutical",
] as const;

// ─── Prompt ─────────────────────────────────────────────────────
const SYSTEM = `You are a regulatory compliance analyst for AI Market Twin. Your job is twofold:
1. Decide whether the product belongs to ONE of these regulated subcategories:
   ${REGULATED_CATEGORIES.join(", ")}
   If none clearly apply, return an empty regulatedCategory.
2. For each candidate country, classify legality as allowed / restricted / banned.

Be conservative — if a product plausibly falls into a regulated subcategory, label it. False positives ("we excluded a country we shouldn't have") are far better than false negatives ("we recommended an illegal market").

Quick reference for the regulated subcategories:
- vaping: e-cigarettes, vape pods, nicotine-free vapes (banned in SG/TH/IN/BR/VN/MX/TW; restricted in CN/KR/JP/US/GB/AU/AE/SA/MY)
- alcohol: alcoholic beverages (banned in SA; restricted in AE/ID/MY/IN)
- cannabis_cbd: anything with THC or CBD (banned in most of Asia and Middle East)
- tobacco: cigarettes, heated tobacco (heavily restricted globally)
- gambling: betting, casino games (banned in CN/SA/AE; restricted elsewhere)
- crypto_finance: cryptocurrency, DeFi (banned in CN; restricted in IN/KR/SA/VN)
- firearms: weapons, ammunition (banned in JP/KR/SG/CN; restricted in AE)
- dietary_supplement: health supplements, functional foods (registration required in KR/JP/CN/SA/AE)
- adult_content: explicit content, adult dating (banned in SA/AE/CN; restricted in KR/IN)
- pharmaceutical: prescription drugs, OTC medication (always restricted)

If the product is in a non-regulated category (typical food/beauty/fashion/electronics/SaaS/etc) just leave regulatedCategory empty and mark every country "allowed".`;

export function regulatoryPrompt(input: ProjectInput, locale: PromptLocale): string {
  const langName = locale === "ko" ? "Korean (한국어)" : "English";
  return `Classify this product and each candidate country.

Product: ${input.productName}
Category: ${input.category}
Description: ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}

Candidate countries: ${input.candidateCountries.join(", ")}

For EACH country produce status of one of:
- "allowed": product can legally be sold to consumers
- "restricted": legally sellable but with non-trivial constraints
- "banned": product cannot legally be sold to consumers

Required: every candidate country must appear in the output, exactly once. Write \`reason\` and \`regulatedCategory\` in ${langName}. Cite the specific Act / regulation / year in \`source\` when known. For "allowed" rows, leave reason and source empty.

\`regulatedCategory\` MUST be one of: ${REGULATED_CATEGORIES.join(", ")} OR empty string if not regulated.

Return JSON:
{
  "regulatedCategory": "vaping|alcohol|...|''",
  "checks": [
    { "country": "<ISO code>", "status": "allowed|restricted|banned", "reason": "...", "source": "..." }
  ]
}`;
}

// ─── DB lookup ──────────────────────────────────────────────────
interface DbRule {
  regulated_category: string;
  country_code: string;
  status: "banned" | "restricted" | "allowed";
  reason: string;
  source: string;
}

/**
 * Fetches the curated regulations for the matched subcategory across
 * the candidate countries. Returns a Map keyed by uppercase country
 * code. Empty map if no subcategory or no rows.
 */
async function fetchCuratedRules(
  category: string,
  countryCodes: string[],
): Promise<Map<string, DbRule>> {
  if (!category) return new Map();
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("category_regulations")
    .select("regulated_category, country_code, status, reason, source")
    .eq("regulated_category", category)
    .in("country_code", countryCodes.map((c) => c.toUpperCase()));
  const m = new Map<string, DbRule>();
  for (const row of (data ?? []) as DbRule[]) {
    m.set(row.country_code.toUpperCase(), row);
  }
  return m;
}

// ─── Runner integration ─────────────────────────────────────────
export interface RegulatoryEvaluation {
  result: RegulatoryResult;
  allowedCountries: string[];
  excludedCountries: string[];
  restrictedCountries: string[];
}

export async function evaluateRegulatory(
  llm: LLMProvider,
  input: ProjectInput,
  locale: PromptLocale,
): Promise<RegulatoryEvaluation> {
  const r = await llm.generate({
    system: SYSTEM,
    prompt: regulatoryPrompt(input, locale),
    jsonSchema: {
      type: "object",
      properties: {
        regulatedCategory: { type: "string" },
        checks: { type: "array" },
      },
    },
    temperature: 0.2,
    maxTokens: 2048,
  });

  const parsed = RegulatoryResultSchema.safeParse(r.json);
  if (!parsed.success) {
    // If parsing fails, fall back to permissive mode rather than crashing
    // the simulation. Better to miss an exclusion than block a real run.
    return {
      result: { checks: [], regulatedCategory: "" },
      allowedCountries: input.candidateCountries,
      excludedCountries: [],
      restrictedCountries: [],
    };
  }

  // DB-first override: when the LLM identifies a regulated subcategory
  // we look up the curated rules. DB rows replace the LLM verdict for
  // those countries; LLM keeps its own answer where the DB has nothing.
  const llmByCountry = new Map(
    parsed.data.checks.map((c) => [c.country.toUpperCase(), c]),
  );
  const dbRules = await fetchCuratedRules(
    parsed.data.regulatedCategory,
    input.candidateCountries,
  );

  const finalChecks: RegulatoryCheck[] = [];
  const allowed: string[] = [];
  const restricted: string[] = [];
  const excluded: string[] = [];

  for (const code of input.candidateCountries) {
    const upper = code.toUpperCase();
    const dbRule = dbRules.get(upper);
    const llmCheck = llmByCountry.get(upper);

    let check: RegulatoryCheck;
    if (dbRule) {
      // DB authoritative — overrides LLM even if LLM said allowed.
      check = {
        country: code,
        status: dbRule.status,
        reason: dbRule.reason,
        source: dbRule.source,
      };
    } else if (llmCheck) {
      check = llmCheck;
    } else {
      // No DB row + LLM forgot — permissive default, the only safe fallback.
      check = { country: code, status: "allowed", reason: "", source: "" };
    }

    finalChecks.push(check);
    if (check.status === "banned") {
      excluded.push(code);
    } else if (check.status === "restricted") {
      allowed.push(code);
      restricted.push(code);
    } else {
      allowed.push(code);
    }
  }

  return {
    result: { checks: finalChecks, regulatedCategory: parsed.data.regulatedCategory },
    allowedCountries: allowed,
    excludedCountries: excluded,
    restrictedCountries: restricted,
  };
}
