/**
 * Blind cross-check — ask the model where this *kind* of product usually goes
 * first, telling it nothing about the brand, and see whether that agrees with
 * what the ensemble picked.
 *
 * Why this exists (measured 2026-09-16, run G, N=40):
 *
 *   engine top-1 == blind pick   →  15/19 correct (79%)
 *   engine top-1 != blind pick   →   7/21 correct (33%)
 *   Fisher exact, two-sided       →  p = 0.0051
 *
 * And it is not a restatement of the confidence label the ensemble already
 * produces. Inside each grade the split still holds, most usefully in the
 * middle bucket where the user has least to go on:
 *
 *   STRONG    agree 8/9 (89%)   disagree 3/5 (60%)   p = 0.505
 *   MODERATE  agree 6/8 (75%)   disagree 2/9 (22%)   p = 0.057
 *   WEAK      agree 1/2 (50%)   disagree 2/7 (29%)   p = 1.000
 *
 * The blind prompt carries no brand name and no description, so it cannot be
 * answering from recall of this particular company — it answers from the base
 * rate for the category and origin. That is exactly what makes agreement
 * informative: two different routes to the same market, rather than one route
 * twice.
 *
 * Off by default. The overall effect is solid but the per-grade cells are 2-9
 * fixtures each, and this changes a label customers act on, so it ships the
 * way the other calibration switches do — behind an env flag, to be A/B'd on
 * a backtest before it becomes the default.
 */
import { getLLMProvider } from "@/lib/llm";

/** `SIM_BLIND_CROSSCHECK=on` enables the confidence downgrade. Default off. */
export function blindCrossCheckEnabled(): boolean {
  return process.env.SIM_BLIND_CROSSCHECK === "on";
}

const SAMPLES = 3;

/**
 * Majority pick across {@link SAMPLES} brand-free samples, or null if the
 * model never returned a candidate. Best-effort throughout: this is a
 * confidence hint, and a failure here must never take an ensemble down with
 * it, so every error path returns null and the caller simply skips the check.
 */
export async function blindMarketPick(opts: {
  category: string;
  originatingCountry: string;
  candidateCountries: string[];
  signal?: AbortSignal;
}): Promise<string | null> {
  const candidates = opts.candidateCountries.filter(
    (c) => c !== opts.originatingCountry,
  );
  if (candidates.length < 3) return null;

  // Same wording as the backtest probe that produced the numbers above —
  // deliberately: change the prompt and the measured split no longer applies.
  const prompt =
    `A ${opts.category} brand from ${opts.originatingCountry} is choosing its first overseas market.\n` +
    `You are given NO information about the brand itself.\n\n` +
    `Candidate markets: ${candidates.join(", ")}\n\n` +
    `Based only on typical export patterns for this category and origin, which market is most likely to become its first sustained, largest overseas market?\n` +
    `Return JSON: {"pick":"XX"}`;

  const llm = getLLMProvider({ provider: "anthropic" });
  const votes = new Map<string, number>();

  for (let i = 0; i < SAMPLES; i++) {
    const res = await llm
      .generate({
        system: "Answer only with JSON.",
        prompt,
        // 0.4 matches the country stage — at temperature 0 the three samples
        // collapse into one answer and the vote tells you nothing.
        temperature: 0.4,
        maxTokens: 100,
        signal: opts.signal,
      })
      .catch(() => null);
    if (!res) continue;
    const m = res.text.match(/\{[\s\S]*\}/);
    if (!m) continue;
    let pick: string;
    try {
      pick = String(JSON.parse(m[0]).pick ?? "").toUpperCase();
    } catch {
      continue;
    }
    if (candidates.includes(pick)) votes.set(pick, (votes.get(pick) ?? 0) + 1);
  }

  if (votes.size === 0) return null;
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
