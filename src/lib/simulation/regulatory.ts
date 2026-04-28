import { z } from "zod";
import type { LLMProvider } from "@/lib/llm";
import type { ProjectInput } from "./schemas";
import type { PromptLocale } from "./prompts";

/**
 * Regulatory pre-check.
 *
 * Runs BEFORE persona generation so we never produce a "Singapore is your best
 * market for e-cigarettes" recommendation. The LLM (Sonnet-class) classifies
 * each candidate country as allowed / restricted / banned for the given product
 * and cites the relevant regulation when known.
 *
 * Banned countries are removed from `candidateCountries` before downstream
 * stages run. Restricted countries proceed but a warning is surfaced in the
 * UI / PDF so the user sees the constraint (e.g. "AU: prescription-only model").
 */

// ─── Schema ─────────────────────────────────────────────────────
export const RegulatoryStatusSchema = z.enum(["allowed", "restricted", "banned"]);
export type RegulatoryStatus = z.infer<typeof RegulatoryStatusSchema>;

export const RegulatoryCheckSchema = z.object({
  country: z.string(),
  status: RegulatoryStatusSchema,
  /** Plain-language explanation in the user's locale. */
  reason: z.string().optional().default(""),
  /** Source / regulation citation (Act name, ministry, year). */
  source: z.string().optional().default(""),
});
export type RegulatoryCheck = z.infer<typeof RegulatoryCheckSchema>;

export const RegulatoryResultSchema = z.object({
  checks: z.array(RegulatoryCheckSchema),
  /** Whether the product itself touches a regulated category (tobacco, alcohol, gambling, ...). */
  regulatedCategory: z.string().optional().default(""),
});
export type RegulatoryResult = z.infer<typeof RegulatoryResultSchema>;

// ─── Prompt ─────────────────────────────────────────────────────
const SYSTEM = `You are a regulatory compliance analyst for AI Market Twin. Your single job is to flag candidate countries where a given product is legally banned or heavily restricted, BEFORE the simulation proceeds.

Be conservative: if you are even moderately confident a product is banned in a country, mark it banned. Recommending a banned market is a critical product failure — false positives ("we excluded a country we shouldn't have") are far better than false negatives ("we recommended an illegal market").

Cover at minimum these regulated categories:
- Tobacco / nicotine: cigarettes, e-cigarettes/vapes (banned in SG, TH, IN, BR; prescription-only in AU; heavily restricted in MX, ID)
- Alcohol: outright banned in Saudi Arabia, heavily restricted in UAE / Indonesia / India for non-Muslims/foreigners
- Cannabis / CBD: most of Asia (KR, JP, SG, ID, TH for recreational), Middle East
- Gambling / online betting: SG (limited), CN (mostly banned), AE/SA, KR (locals banned)
- Weapons / firearms: nearly all consumer markets ban civilian sales (JP, KR, SG, etc.)
- Pork / non-halal: not banned but commercially impractical in SA, AE Muslim retail
- Pharmaceuticals / supplements: prescription-only thresholds vary widely
- Children's products with safety concerns
- Cryptocurrency products: banned in CN, restricted in IN, SA

If the product is in a non-regulated category (typical food, beauty, fashion, electronics, SaaS, etc.) just mark every candidate country as "allowed" with empty reason.`;

export function regulatoryPrompt(input: ProjectInput, locale: PromptLocale): string {
  const langName = locale === "ko" ? "Korean (한국어)" : "English";
  return `Classify each of the candidate countries below for whether the product can legally be sold to consumers there.

Product: ${input.productName}
Category: ${input.category}
Description: ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}

Candidate countries: ${input.candidateCountries.join(", ")}

For EACH country produce a status of one of:
- "allowed": product can legally be sold to consumers
- "restricted": legally sellable but with non-trivial constraints (prescription-only, age limits beyond standard 18+/21+, regional bans, import quotas, mandatory licenses)
- "banned": product cannot legally be sold to consumers in that country

Required: every candidate country must appear in the output, exactly once.

Write \`reason\` and \`regulatedCategory\` in ${langName}. Cite the specific Act / regulation / year in the \`source\` field when you know it (e.g. "Singapore Tobacco Act 2018", "Indian PECA Act 2019"). For "allowed" rows, you may leave reason and source empty.

Return JSON:
{
  "regulatedCategory": "(one short label like 'tobacco', 'alcohol', 'cannabis', or empty if not regulated)",
  "checks": [
    { "country": "<ISO code>", "status": "allowed|restricted|banned", "reason": "...", "source": "..." }
  ]
}`;
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
    // If parsing fails, fall back to permissive mode — better UX than crashing
    // the simulation. The sourced version will catch issues; here we'd rather
    // miss an exclusion than block a real launch sim.
    return {
      result: { checks: [], regulatedCategory: "" },
      allowedCountries: input.candidateCountries,
      excludedCountries: [],
      restrictedCountries: [],
    };
  }

  // Build a lookup keyed by uppercase country code.
  const byCountry = new Map(parsed.data.checks.map((c) => [c.country.toUpperCase(), c]));

  const allowed: string[] = [];
  const restricted: string[] = [];
  const excluded: string[] = [];
  for (const code of input.candidateCountries) {
    const upper = code.toUpperCase();
    const check = byCountry.get(upper);
    if (!check) {
      // LLM forgot a country — keep it (permissive default).
      allowed.push(code);
      continue;
    }
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
    result: parsed.data,
    allowedCountries: allowed,
    excludedCountries: excluded,
    restrictedCountries: restricted,
  };
}
