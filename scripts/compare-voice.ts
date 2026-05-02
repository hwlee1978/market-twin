/**
 * Voice quality A/B — runs the same persona batch through Sonnet and Haiku
 * with identical prompt, slots, and seed. Emits a markdown side-by-side of
 * voice quotes (the 1인칭 / first-person field that's the product
 * differentiator) for human review.
 *
 * Goal: decide whether LLM_PERSONAS_MODEL=claude-haiku-4-5 produces voices
 * good enough to ship as default, or if Sonnet is worth the cost premium.
 *
 * Usage:
 *   npm run compare:voice
 *
 * Output: voice-compare-<timestamp>.md in the project root.
 */
import { writeFileSync } from "fs";
import { AnthropicProvider } from "../src/lib/llm/anthropic";
import { planSlots, type PersonaSlot } from "../src/lib/simulation/profession-pool";
import { personaPrompt, PERSONA_SYSTEM } from "../src/lib/simulation/prompts";
import { PersonaSchema, type ProjectInput } from "../src/lib/simulation/schemas";

const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";

const PRODUCT: ProjectInput = {
  productName: "COSRX Advanced Snail 96 Mucin Power Essence",
  category: "beauty",
  description:
    "K-beauty essence with 96% snail secretion filtrate. Soothing, regenerating, hydrating triple action. Cult Reddit/SkincareAddiction favorite among K-beauty imports.",
  basePriceCents: 2500,
  currency: "USD",
  objective: "expansion",
  originatingCountry: "KR",
  candidateCountries: ["US", "JP"],
  competitorUrls: [],
  assetDescriptions: [],
  assetUrls: [],
};

const SEED = "voice-compare-2026-05-02";
const PERSONA_COUNT = 6;

async function generateBatch(
  modelId: string,
  slots: PersonaSlot[],
  locale: "ko" | "en",
) {
  const provider = new AnthropicProvider(modelId);
  const t0 = Date.now();
  const r = await provider.generate({
    system: PERSONA_SYSTEM,
    prompt: personaPrompt(PRODUCT, slots, locale, ""),
    jsonSchema: { type: "object", properties: { personas: { type: "array" } } },
    temperature: 0.6,
    maxTokens: 8192,
  });
  const ms = Date.now() - t0;
  const wrapped = (r.json as { personas?: unknown[] } | null)?.personas;
  const arr = Array.isArray(wrapped) ? wrapped : [];
  const parsed = arr
    .map((p) => PersonaSchema.safeParse(p))
    .filter((res): res is { success: true; data: ReturnType<typeof PersonaSchema.parse> } => res.success)
    .map((res) => res.data);
  return {
    personas: parsed,
    ms,
    inputTokens: r.usage?.inputTokens ?? 0,
    outputTokens: r.usage?.outputTokens ?? 0,
  };
}

function voiceCharCount(s: string): number {
  // Korean / English both counted by char — matches the "HARD LENGTH CAP" rule.
  return [...s].length;
}

function exceedsCap(voice: string, locale: "ko" | "en"): boolean {
  const cap = locale === "ko" ? 90 : 130;
  return voiceCharCount(voice) > cap;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY env var is required.");
    process.exit(1);
  }

  const tStart = Date.now();
  const out: string[] = [];
  out.push(`# Voice Quality A/B — Sonnet vs Haiku`);
  out.push(``);
  out.push(`*Generated ${new Date().toISOString()} · product: ${PRODUCT.productName} ($${(PRODUCT.basePriceCents / 100).toFixed(2)} ${PRODUCT.currency})*`);
  out.push(``);
  out.push(`Same prompt · same ${PERSONA_COUNT}-persona slot plan (seed \`${SEED}\`) · temperature 0.6 · maxTokens 8192. Each model generates one batch independently.`);
  out.push(``);
  out.push(`Length cap rule: KO ≤90 chars, EN ≤130 chars (UI uniformity).`);
  out.push(``);

  const summary: Array<{
    locale: string;
    model: string;
    ms: number;
    inputTokens: number;
    outputTokens: number;
    capViolations: number;
    avgLen: number;
  }> = [];

  for (const locale of ["ko", "en"] as const) {
    const slots: PersonaSlot[] = planSlots(
      PERSONA_COUNT,
      ["US", "JP"],
      "beauty",
      locale,
      SEED,
    );

    console.log(`\n=== ${locale.toUpperCase()} batch — ${slots.length} slots ===`);
    console.log(`Slots:`, slots.map((s) => `${s.country}/${s.profession ?? "<free>"}`).join(", "));

    const [sonnet, haiku] = await Promise.all([
      generateBatch(SONNET, slots, locale),
      generateBatch(HAIKU, slots, locale),
    ]);

    console.log(
      `Sonnet: ${sonnet.personas.length}/${slots.length} parsed in ${sonnet.ms}ms ` +
        `(in=${sonnet.inputTokens}, out=${sonnet.outputTokens})`,
    );
    console.log(
      `Haiku:  ${haiku.personas.length}/${slots.length} parsed in ${haiku.ms}ms ` +
        `(in=${haiku.inputTokens}, out=${haiku.outputTokens})`,
    );

    out.push(`## ${locale.toUpperCase()} batch — ${slots.length} personas`);
    out.push(``);
    out.push(
      `**Sonnet**: ${sonnet.personas.length}/${slots.length} parsed · ${sonnet.ms}ms · in=${sonnet.inputTokens} out=${sonnet.outputTokens}`,
    );
    out.push(``);
    out.push(
      `**Haiku**: ${haiku.personas.length}/${slots.length} parsed · ${haiku.ms}ms · in=${haiku.inputTokens} out=${haiku.outputTokens}`,
    );
    out.push(``);

    let sonnetCapHits = 0;
    let haikuCapHits = 0;
    let sonnetLenSum = 0;
    let haikuLenSum = 0;
    let sonnetLenN = 0;
    let haikuLenN = 0;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const s = sonnet.personas[i];
      const h = haiku.personas[i];
      out.push(`### Slot ${i + 1} — ${slot.country} · base profession: \`${slot.profession ?? "<free>"}\``);
      out.push(``);
      if (s) {
        const sLen = voiceCharCount(s.voice ?? "");
        sonnetLenSum += sLen;
        sonnetLenN++;
        if (s.voice && exceedsCap(s.voice, locale)) sonnetCapHits++;
        out.push(`- **Sonnet** _(${s.profession}, ${s.ageRange}, intent ${s.purchaseIntent}, ${sLen}ch)_`);
        out.push(`  > ${s.voice ?? "(no voice)"}`);
      } else {
        out.push(`- **Sonnet** — ❌ no parsed persona at this index`);
      }
      if (h) {
        const hLen = voiceCharCount(h.voice ?? "");
        haikuLenSum += hLen;
        haikuLenN++;
        if (h.voice && exceedsCap(h.voice, locale)) haikuCapHits++;
        out.push(`- **Haiku** _(${h.profession}, ${h.ageRange}, intent ${h.purchaseIntent}, ${hLen}ch)_`);
        out.push(`  > ${h.voice ?? "(no voice)"}`);
      } else {
        out.push(`- **Haiku** — ❌ no parsed persona at this index`);
      }
      out.push(``);
    }

    summary.push({
      locale,
      model: "sonnet",
      ms: sonnet.ms,
      inputTokens: sonnet.inputTokens,
      outputTokens: sonnet.outputTokens,
      capViolations: sonnetCapHits,
      avgLen: sonnetLenN ? Math.round(sonnetLenSum / sonnetLenN) : 0,
    });
    summary.push({
      locale,
      model: "haiku",
      ms: haiku.ms,
      inputTokens: haiku.inputTokens,
      outputTokens: haiku.outputTokens,
      capViolations: haikuCapHits,
      avgLen: haikuLenN ? Math.round(haikuLenSum / haikuLenN) : 0,
    });
  }

  out.push(`## Summary`);
  out.push(``);
  out.push(`| Locale | Model | Latency | Out tokens | Avg voice len | Cap violations |`);
  out.push(`|---|---|---|---|---|---|`);
  for (const s of summary) {
    out.push(
      `| ${s.locale.toUpperCase()} | ${s.model} | ${s.ms}ms | ${s.outputTokens} | ${s.avgLen}ch | ${s.capViolations} |`,
    );
  }
  out.push(``);
  out.push(`Total wall time: ${((Date.now() - tStart) / 1000).toFixed(1)}s`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `voice-compare-${stamp}.md`;
  writeFileSync(filename, out.join("\n"), "utf8");
  console.log(`\nWrote ${filename}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
