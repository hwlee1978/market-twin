/**
 * LLM-driven merge of per-sim narrative outputs (overview / risks /
 * recommendations) into a single consensus narrative for the ensemble
 * report. Lives in its own module — and stays separate from the pure
 * `aggregateEnsemble` aggregator — because it needs an LLM call and
 * therefore must be async + tolerant of provider failure.
 *
 * Strategy: dedup risks and actions by *meaning* (not exact string),
 * count how many sims surfaced each one, return a ranked list. Single-
 * sim ensembles skip the LLM call and pass the per-sim narrative through
 * with surfacedInSims = 1 — wasting a $0.05 LLM call on one risk list
 * isn't worth it.
 */

import { z } from "zod";
import { getLLMProvider } from "@/lib/llm";
import type { EnsembleSimSnapshot, EnsembleNarrative } from "./ensemble";

const MERGED_RISK_SCHEMA = z.object({
  factor: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  surfacedInSims: z.number().int().min(1),
});
const MERGED_ACTION_SCHEMA = z.object({
  action: z.string(),
  surfacedInSims: z.number().int().min(1),
});
const MERGE_RESPONSE_SCHEMA = z.object({
  executiveSummary: z.string(),
  mergedRisks: z.array(MERGED_RISK_SCHEMA).max(12),
  mergedActions: z.array(MERGED_ACTION_SCHEMA).max(10),
});

export interface MergeNarrativeOpts {
  snapshots: EnsembleSimSnapshot[];
  productName: string;
  bestCountry: string;
  consensusPercent: number;
  locale: "ko" | "en";
}

export async function mergeNarrative(
  opts: MergeNarrativeOpts,
): Promise<EnsembleNarrative | undefined> {
  const sims = opts.snapshots.filter((s) => s.overview || s.risks || s.recommendations);
  if (sims.length === 0) return undefined;

  // Single-sim trivial path: nothing to merge, just promote the per-sim
  // narrative directly. Saves a redundant LLM call on hypothesis tier.
  if (sims.length === 1) {
    const s = sims[0];
    return {
      executiveSummary: s.overview?.headline ?? s.recommendations?.executiveSummary ?? "",
      mergedRisks: (s.risks ?? []).map((r) => ({
        factor: r.factor,
        description: r.description,
        severity: r.severity,
        surfacedInSims: 1,
      })),
      mergedActions: (s.recommendations?.actionPlan ?? []).map((action) => ({
        action,
        surfacedInSims: 1,
      })),
      overallRiskLevel: s.overview?.riskLevel ?? "medium",
    };
  }

  const overallRiskLevel = modeRiskLevel(sims);
  const totalPersonas = sims.reduce((sum, s) => sum + (s.personas?.length ?? 0), 0);
  const perSimPersonas = sims[0]?.personas?.length ?? 0;
  const prompt = buildMergePrompt(opts, sims, overallRiskLevel);

  // Synthesis-tier model — same one that produced the per-sim summaries.
  // Default provider chain (anthropic/openai/gemini env-driven) handles
  // it; we don't pin to a specific provider here since the merge isn't
  // part of the cross-model diversity story.
  const llm = getLLMProvider({ stage: "synthesis" });
  try {
    const t0 = Date.now();
    const res = await llm.generate({
      prompt,
      jsonSchema: zodToJsonShape(),
      temperature: 0.3,
      maxTokens: 4096,
    });
    const parsed = MERGE_RESPONSE_SCHEMA.safeParse(res.json);
    if (!parsed.success) {
      console.warn("[ensemble narrative] merge response failed schema validation:", parsed.error.flatten());
      return narrativeFromRawSnapshots(sims, overallRiskLevel);
    }
    console.log(
      `[ensemble narrative] merged ${sims.length} sims · ${parsed.data.mergedRisks.length} risks · ${parsed.data.mergedActions.length} actions · ${Date.now() - t0}ms`,
    );
    return {
      executiveSummary: rewriteSimScaleReferences(
        parsed.data.executiveSummary,
        perSimPersonas,
        totalPersonas,
      ),
      mergedRisks: parsed.data.mergedRisks.map((r) => ({
        ...r,
        description: rewriteSimScaleReferences(r.description, perSimPersonas, totalPersonas),
      })),
      mergedActions: parsed.data.mergedActions.map((a) => ({
        ...a,
        action: rewriteSimScaleReferences(a.action, perSimPersonas, totalPersonas),
      })),
      overallRiskLevel,
    };
  } catch (err) {
    // Don't let narrative merge failure kill the whole ensemble — the
    // chart sections are still useful on their own. Fall back to a
    // dumb per-sim merge so the report at least shows something.
    console.warn(`[ensemble narrative] merge LLM call failed, falling back to raw:`, err);
    return narrativeFromRawSnapshots(sims, overallRiskLevel);
  }
}

function modeRiskLevel(sims: EnsembleSimSnapshot[]): "low" | "medium" | "high" {
  const counts: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const s of sims) {
    const r = s.overview?.riskLevel;
    if (r) counts[r] = (counts[r] ?? 0) + 1;
  }
  // Tie-break upward — a deep ensemble with 50/50 medium/high should err
  // on the side of caution for risk surfacing.
  if (counts.high >= counts.medium && counts.high >= counts.low) return "high";
  if (counts.medium >= counts.low) return "medium";
  return "low";
}

function buildMergePrompt(
  opts: MergeNarrativeOpts,
  sims: EnsembleSimSnapshot[],
  overallRiskLevel: "low" | "medium" | "high",
): string {
  const isKo = opts.locale === "ko";
  // Total persona pool across the ensemble. Per-sim narratives reference
  // each sim's 200-persona pool ("89명, 전체 200명 중 44.5%"); the merged
  // narrative needs to be rewritten to either the ensemble total or to
  // percentage-only so the reader doesn't see "200명 중" on a 3000-persona
  // run. We pass this total into the prompt and add an explicit rewrite
  // rule below.
  const totalPersonas = sims.reduce((sum, s) => sum + (s.personas?.length ?? 0), 0);
  const perSimPersonas = sims[0]?.personas?.length ?? 0;

  const intro = isKo
    ? `${sims.length}개 독립 시뮬레이션의 결과를 통합 분석하세요. 같은 의미의 리스크/액션은 하나로 합치고 빈도(surfacedInSims)를 표기하세요. 모든 출력은 한국어로 작성하세요.`
    : `Synthesize ${sims.length} independent simulation results into one consensus narrative. Collapse semantically equivalent risks/actions into single entries with a frequency count (surfacedInSims). Write everything in English.`;

  const productLine = isKo
    ? `제품: ${opts.productName} · 추천 진출국: ${opts.bestCountry} (합의도 ${opts.consensusPercent}%)`
    : `Product: ${opts.productName} · Recommended market: ${opts.bestCountry} (consensus ${opts.consensusPercent}%)`;

  const scaleLine = isKo
    ? `규모: 총 ${totalPersonas.toLocaleString()}명 페르소나 (시뮬당 약 ${perSimPersonas}명 × ${sims.length}회).`
    : `Scale: ${totalPersonas.toLocaleString()} total personas (~${perSimPersonas} per sim × ${sims.length} sims).`;

  const riskLevelLine = isKo
    ? `종합 리스크 수준: ${overallRiskLevel.toUpperCase()} (per-sim 다수결 기준)`
    : `Overall risk level: ${overallRiskLevel.toUpperCase()} (mode of per-sim values)`;

  const simBlocks = sims
    .map((s, i) => {
      const provider = s.provider ? `[${s.provider}] ` : "";
      const headline = s.overview?.headline ?? "";
      const summary = s.recommendations?.executiveSummary ?? "";
      const risks = (s.risks ?? [])
        .map((r) => `  - [${r.severity}] ${r.factor}: ${r.description}`)
        .join("\n");
      const actions = (s.recommendations?.actionPlan ?? [])
        .map((a) => `  - ${a}`)
        .join("\n");
      return [
        `## Sim ${i + 1} ${provider}(best=${s.bestCountry ?? "?"})`,
        headline && `Headline: ${headline}`,
        summary && `Summary: ${summary}`,
        risks && `Risks:\n${risks}`,
        actions && `Actions:\n${actions}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const guidance = isKo
    ? `통합 결과 작성 지침:

1. **executiveSummary**: 모든 시뮬의 합의 narrative를 2-4문장으로 통합. 추천 진출국 + 이유 + 핵심 우려사항을 포함.

2. **mergedRisks**: 의미가 같은 리스크는 합치되, **구체성을 우선시하세요**. 같은 원인을 다룬 두 리스크가 있을 때:
   - 더 구체적이고 측정 가능한 쪽 (예: "Amazon US 미입점으로 첫 90일 매출 55% 손실")을 채택
   - 추상적인 쪽 (예: "유통 채널 리스크")은 버리거나, 구체적 표현으로 다시 쓰기
   - 합쳐진 description은 가장 자세한 sim의 표현을 기반으로 하되, 다른 sim에서 추가된 구체적 데이터(숫자, 페르소나 인용)가 있으면 통합
   - surfacedInSims는 의미적으로 같은 리스크를 언급한 sim 수
   - 정렬: severity (high > medium > low) → surfacedInSims 내림차순. 단순 frequency만으로 정렬하지 말 것.
   - 최대 12개. 추상적/일반론적 리스크는 제외 (예: "규제 리스크", "경쟁 강도" 같은 카테고리만 있는 항목).

3. **mergedActions**: 의미가 같은 액션은 합치되 **실행 가능한 구체성**을 우선시. 같은 의도의 두 액션 중 더 명확한 채널/타임라인/숫자를 가진 쪽을 채택. surfacedInSims 기록. 정렬: 권장 빈도 + 실행 우선순위. 최대 10개.

4. **숫자 표현 규칙 (필수)**: per-sim 출력의 숫자는 시뮬당 ${perSimPersonas}명 풀 기준입니다. 통합 narrative는 전체 ${totalPersonas.toLocaleString()}명 풀 기준으로 작성해야 합니다.
   - "X명, 전체 ${perSimPersonas}명 중 Y%" 같은 표현은 절대 그대로 옮기지 마세요.
   - 비율(Y%)만 유지하거나, 전체 풀로 환산해 다시 쓰세요. 예) "전체 페르소나의 44.5%" 또는 "${totalPersonas.toLocaleString()}명 중 약 ${Math.round(totalPersonas * 0.445).toLocaleString()}명 (44.5%)"
   - "200명 중", "out of 200" 같은 sim-level 카운트가 보이면 반드시 percentage-only로 바꾸거나 ensemble 총합으로 환산하세요.`
    : `Output guidance:

1. **executiveSummary**: 2-4 sentence consensus across all sims. Cover the recommended market, why, and the central concern.

2. **mergedRisks**: collapse semantic duplicates, but **prefer specific over generic**. When two risks point at the same cause:
   - Keep the more concrete + quantified version ("Amazon US absence costs 55% of first-90-day revenue") over the abstract one ("distribution channel risk").
   - Discard or rewrite vague/category-only risks like "regulatory risk" or "competition intensity".
   - Build the merged description from the most-detailed sim's wording; fold in concrete numbers / persona quotes from other sims when present.
   - surfacedInSims = number of sims that mentioned a semantically equivalent risk.
   - Sort by severity (high > medium > low), then surfacedInSims descending. Do not rank by frequency alone.
   - Max 12. Drop entries that are pure category labels with no specific cause.

3. **mergedActions**: collapse semantic duplicates, prefer the action with the most actionable specificity (concrete channel / timeline / numbers). Set surfacedInSims to count. Sort by frequency + execution priority. Max 10.

4. **Number-rewrite rule (mandatory)**: per-sim outputs reference each sim's ${perSimPersonas}-persona pool. The merged narrative must reference the ensemble-wide pool of ${totalPersonas.toLocaleString()}.
   - Never copy phrases like "X out of ${perSimPersonas}" or "Y, ${perSimPersonas}명 중" verbatim.
   - Either keep percentages only, or rescale the absolute count to the full pool. Example: "44.5% of all personas" or "${Math.round(totalPersonas * 0.445).toLocaleString()} of ${totalPersonas.toLocaleString()} personas (44.5%)".
   - If you see any "out of 200", "200명 중", or similar sim-level counts, rewrite to percentage-only or ensemble total.`;

  return [intro, productLine, scaleLine, riskLevelLine, "", "## Per-sim outputs", simBlocks, "", guidance].join(
    "\n",
  );
}

function narrativeFromRawSnapshots(
  sims: EnsembleSimSnapshot[],
  overallRiskLevel: "low" | "medium" | "high",
): EnsembleNarrative {
  // Fallback when the LLM merge fails — concatenate the highest-frequency
  // sim's risks/actions. Better than empty sections, worse than a real merge.
  const best = sims[0];
  const totalPersonas = sims.reduce((sum, s) => sum + (s.personas?.length ?? 0), 0);
  const perSim = best?.personas?.length ?? 0;
  return {
    executiveSummary: rewriteSimScaleReferences(
      best?.overview?.headline ?? best?.recommendations?.executiveSummary ?? "",
      perSim,
      totalPersonas,
    ),
    mergedRisks: (best?.risks ?? []).slice(0, 12).map((r) => ({
      factor: r.factor,
      description: rewriteSimScaleReferences(r.description, perSim, totalPersonas),
      severity: r.severity,
      surfacedInSims: 1,
    })),
    mergedActions: (best?.recommendations?.actionPlan ?? []).slice(0, 10).map((action) => ({
      action: rewriteSimScaleReferences(action, perSim, totalPersonas),
      surfacedInSims: 1,
    })),
    overallRiskLevel,
  };
}

/**
 * Defensive sanitizer for narrative text — per-sim outputs say things like
 * "전체 200명 중 44.5%" or "89 out of 200" because each sim runs against a
 * 200-persona pool. The merged narrative must read as ensemble-wide, so we
 * regex-rewrite any literal sim-pool reference to either a percentage-only
 * phrase or the full ensemble total. Runs *after* the LLM merge as a
 * belt-and-braces layer in case the model ignores the prompt directive.
 *
 * Scope: only triggers when the merged narrative has at least one sim
 * worth of mismatch (perSim > 0 and totalPersonas > perSim). Single-sim
 * ensembles correctly say "200명 중" because that IS the full pool.
 */
export function rewriteSimScaleReferences(
  text: string,
  perSim: number,
  totalPersonas: number,
): string {
  if (!text || perSim <= 0 || totalPersonas <= perSim) return text;
  let out = text;
  const psStr = String(perSim);
  // KO: "(전체 )?{perSim}명 중 X명" → "전체 페르소나의 (X / perSim) → percent"
  // and "{perSim}명 중 Y%" → "전체 페르소나의 Y%"
  out = out.replace(
    new RegExp(`(?:전체\\s*)?${psStr}\\s*명\\s*중\\s*([\\d.]+\\s*%)`, "g"),
    "전체 페르소나의 $1",
  );
  out = out.replace(
    new RegExp(`(?:전체\\s*)?${psStr}\\s*명\\s*중\\s*(\\d+)\\s*명`, "g"),
    (_m, n: string) => {
      const pct = (parseInt(n, 10) / perSim) * 100;
      const scaled = Math.round((pct / 100) * totalPersonas);
      return `전체 ${totalPersonas.toLocaleString()}명 중 ${scaled.toLocaleString()}명`;
    },
  );
  // EN: "X out of {perSim}" → "of all personas"
  out = out.replace(
    new RegExp(`\\b(\\d+)\\s+out\\s+of\\s+${psStr}\\b`, "gi"),
    (_m, n: string) => {
      const pct = (parseInt(n, 10) / perSim) * 100;
      const scaled = Math.round((pct / 100) * totalPersonas);
      return `${scaled.toLocaleString()} of ${totalPersonas.toLocaleString()}`;
    },
  );
  // EN: "of 200 (Y%)" residue
  out = out.replace(
    new RegExp(`\\bof\\s+${psStr}\\s+\\(([\\d.]+\\s*%)\\)`, "gi"),
    "of all personas ($1)",
  );
  return out;
}

// react-pdf doesn't accept Zod schemas directly in its jsonSchema slot;
// give the LLM a hand-rolled JSON-shape hint that mirrors the Zod shape.
// Kept inline so the schema and the hint stay in sync visually.
function zodToJsonShape() {
  return {
    type: "object",
    properties: {
      executiveSummary: { type: "string" },
      mergedRisks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            factor: { type: "string" },
            description: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            surfacedInSims: { type: "integer", minimum: 1 },
          },
          required: ["factor", "description", "severity", "surfacedInSims"],
        },
      },
      mergedActions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string" },
            surfacedInSims: { type: "integer", minimum: 1 },
          },
          required: ["action", "surfacedInSims"],
        },
      },
    },
    required: ["executiveSummary", "mergedRisks", "mergedActions"],
  };
}
