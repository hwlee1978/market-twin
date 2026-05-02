/**
 * Pool seeding script — pre-fills a workspace's persona pool for a given
 * (category, countries) combination so subsequent simulations get high
 * pool hit-rates from the start (cold-start mitigation).
 *
 * Why this exists:
 * - First-time users / fresh categories see ~0% pool hit on their first
 *   simulation. Slow + expensive run.
 * - Operators can run this script ahead of demos, marketing campaigns,
 *   or known category launches to "warm up" the pool.
 *
 * Reuses the existing personaPrompt with a generic placeholder product —
 * the LLM still produces full persona objects with reactions, but we
 * throw away the reaction fields and store only the base profile. This
 * is intentionally simpler than building a separate "base only" prompt:
 * we trade some output tokens for code reuse.
 *
 * Usage:
 *   npm run seed:pool -- <workspace_id> <category> [countries]
 *
 * Examples:
 *   npm run seed:pool -- 0c8e774f-356a-4bf2-ba3d-8bfb41e6d019 beauty
 *   npm run seed:pool -- 0c8e774f-356a-4bf2-ba3d-8bfb41e6d019 saas US,GB,DE,SG
 *   npm run seed:pool -- 0c8e774f-356a-4bf2-ba3d-8bfb41e6d019 food US,JP,GB,VN
 */
import { Client } from "pg";
import { getLLMProvider } from "../src/lib/llm";
import { planSlots, type PersonaSlot } from "../src/lib/simulation/profession-pool";
import { personaPrompt, PERSONA_SYSTEM } from "../src/lib/simulation/prompts";
import {
  PersonaSchema,
  type ProjectInput,
} from "../src/lib/simulation/schemas";
import { filterLocaleNative } from "../src/lib/simulation/locale-filter";

const PERSONA_BATCH = 12;
const PERSONA_BATCH_CONCURRENCY = Math.max(
  1,
  Number(process.env.LLM_PERSONA_BATCH_CONCURRENCY ?? 4),
);
const PERSONAS_PER_COUNTRY = 50;
const DEFAULT_COUNTRIES = ["US", "JP", "GB"];

async function runWithConcurrency<T>(
  limit: number,
  tasks: Array<() => Promise<T>>,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= tasks.length) return;
        try {
          results[idx] = { status: "fulfilled", value: await tasks[idx]() };
        } catch (reason) {
          results[idx] = { status: "rejected", reason };
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function main() {
  const [, , workspaceId, category, countriesArg, perCountryArg] = process.argv;
  if (!workspaceId || !category) {
    console.error(
      "Usage: npm run seed:pool -- <workspace_id> <category> [countries=US,JP,GB,...] [per-country=50]",
    );
    console.error(
      "Example: npm run seed:pool -- 0c8e774f-356a-4bf2-ba3d-8bfb41e6d019 beauty US,JP,GB,DE 30",
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var is required.");
    process.exit(1);
  }
  const countries = (countriesArg ?? DEFAULT_COUNTRIES.join(","))
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const perCountry = perCountryArg
    ? Math.max(1, Number.parseInt(perCountryArg, 10))
    : PERSONAS_PER_COUNTRY;
  if (Number.isNaN(perCountry)) {
    console.error(`Invalid per-country count: ${perCountryArg}`);
    process.exit(1);
  }
  const totalPersonas = perCountry * countries.length;
  const locale = "ko" as const;

  console.log(
    `Seeding pool: workspace=${workspaceId.slice(0, 8)}, category=${category}, ` +
      `countries=${countries.join(",")}, target=${totalPersonas} personas`,
  );

  // Build a generic placeholder ProjectInput — the LLM uses it for prompt
  // framing only. The reaction fields it generates get dropped at save time.
  const projectInput: ProjectInput = {
    productName: `Pool seed (${category})`,
    category,
    description: `Generic ${category}-category consumer profiling for the persona pool. Personas should represent typical consumers in their respective markets, not tied to a specific product launch. Vary income, life stage, profession.`,
    basePriceCents: 5000,
    currency: "USD",
    objective: "expansion",
    originatingCountry: "KR",
    candidateCountries: countries,
    competitorUrls: [],
    assetDescriptions: [],
    assetUrls: [],
  };

  const personaLLM = getLLMProvider({ stage: "personas" });

  // Plan slots and slice into batches — same algorithm as the runner uses.
  const seed = `seed-${workspaceId}-${category}-${Date.now()}`;
  const allSlots: PersonaSlot[] = planSlots(
    totalPersonas,
    countries,
    category,
    locale,
    seed,
  );
  // Skip slots without an assigned profession (free-choice categories like
  // "other") — those are not poolable.
  const slottedSlots = allSlots.filter((s) => !!s.profession);
  if (slottedSlots.length === 0) {
    console.error(
      `Category "${category}" has no slot-assigned profession pool — nothing to seed. Try beauty / saas / food / health / fashion / electronics / home / ip.`,
    );
    process.exit(1);
  }

  const batchPlans: Array<{ slots: PersonaSlot[] }> = [];
  for (let i = 0; i < slottedSlots.length; i += PERSONA_BATCH) {
    batchPlans.push({ slots: slottedSlots.slice(i, i + PERSONA_BATCH) });
  }
  console.log(
    `Generating ${slottedSlots.length} personas in ${batchPlans.length} batches ` +
      `(concurrency ${PERSONA_BATCH_CONCURRENCY})...`,
  );

  const t0 = Date.now();
  const batchResults = await runWithConcurrency(
    PERSONA_BATCH_CONCURRENCY,
    batchPlans.map(({ slots }) => () =>
      personaLLM.generate({
        system: PERSONA_SYSTEM,
        prompt: personaPrompt(projectInput, slots, locale, ""),
        jsonSchema: { type: "object", properties: { personas: { type: "array" } } },
        temperature: 0.6,
        maxTokens: 8192,
      }),
    ),
  );
  console.log(`LLM phase: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Pair returned personas with their slots so we know each base_profession.
  type Pair = {
    persona: ReturnType<typeof PersonaSchema.parse>;
    slot: PersonaSlot;
  };
  const pairs: Pair[] = [];
  let parseSkips = 0;
  for (let bi = 0; bi < batchResults.length; bi++) {
    const settled = batchResults[bi];
    const batchSlots = batchPlans[bi].slots;
    if (settled.status === "rejected") {
      console.warn(
        `  batch ${bi} failed:`,
        settled.reason instanceof Error ? settled.reason.message : settled.reason,
      );
      continue;
    }
    const r = settled.value;
    const wrapped = (r.json as { personas?: unknown[] } | null)?.personas;
    const arr = Array.isArray(wrapped) ? wrapped : [];
    for (let pi = 0; pi < arr.length && pi < batchSlots.length; pi++) {
      const parsed = PersonaSchema.safeParse(arr[pi]);
      if (parsed.success) {
        const cleaned = {
          ...parsed.data,
          interests: filterLocaleNative(parsed.data.interests, locale),
        };
        pairs.push({ persona: cleaned, slot: batchSlots[pi] });
      } else {
        parseSkips++;
      }
    }
  }
  console.log(`Parsed ${pairs.length} valid personas (${parseSkips} skipped)`);

  if (pairs.length === 0) {
    console.error("No personas to insert. Aborting.");
    process.exit(1);
  }

  // Insert base profiles into the workspace pool. Reaction fields
  // (objections / trustFactors / purchaseIntent / voice) generated by the
  // LLM are intentionally dropped — the pool only stores product-agnostic
  // base profile.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const t1 = Date.now();
    let inserted = 0;
    for (const { persona, slot } of pairs) {
      await client.query(
        `insert into public.personas
          (workspace_id, age_range, gender, country, income_band, profession,
           base_profession, interests, purchase_style, price_sensitivity,
           source_simulation_id, locale)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          workspaceId,
          persona.ageRange,
          persona.gender,
          persona.country,
          persona.incomeBand,
          persona.profession,
          slot.profession,
          persona.interests,
          persona.purchaseStyle,
          persona.priceSensitivity,
          null, // source_simulation_id — null marks seed-generated rows
          locale,
        ],
      );
      inserted++;
    }
    console.log(`Inserted ${inserted} personas in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

    // Final stats summary.
    const { rows: distRows } = await client.query<{
      base_profession: string;
      country: string;
      cnt: string;
    }>(
      `select base_profession, country, count(*)::text as cnt
       from public.personas
       where workspace_id = $1 and source_simulation_id is null
       group by base_profession, country
       order by count(*) desc limit 20`,
      [workspaceId],
    );
    console.log(`\nWorkspace seed pool top cells (post-insert):`);
    for (const r of distRows) {
      console.log(`  ${r.base_profession} × ${r.country}: ${r.cnt}`);
    }
  } finally {
    await client.end();
  }
  console.log(`\n✓ Seed complete. Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
