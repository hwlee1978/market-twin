/**
 * Humanize KR — AI 한국어 글을 사람 글로 윤문하는 단일 LLM 호출.
 *
 * 원본 (https://github.com/epoko77-ai/im-not-ai) 의 Fast Path (monolith)
 * 구현. detection → rewriting → self-validation 한 콜 안에서 처리.
 *
 * Strict 모드 (5-agent pipeline) 는 챌린지 시연에 과한 비용 → 미구현.
 */

import { getLLMProvider } from "@/lib/llm";
import { HUMANIZE_KR_SYSTEM_PROMPT } from "./rules";

export type HumanizeDetected = {
  id: string;                          // e.g. "A-1"
  severity: "S1" | "S2";
  category: string;                    // e.g. "번역투"
  before: string;                      // 원문 단편
  after: string;                       // 윤문 단편
  note?: string;
};

export type HumanizeSelfCheck = {
  preserved_facts: boolean;
  preserved_register: boolean;
  no_genre_drift: boolean;
  no_artificial_additions: boolean;
  residual_s1_count: number;
  residual_s2_count: number;
};

export type HumanizeResult = {
  humanized: string;
  detected: HumanizeDetected[];
  grade: "A" | "B" | "C" | "D";
  change_rate: number;
  self_check: HumanizeSelfCheck;
  summary: string;
  /* meta */
  original_length: number;
  generation_ms: number;
  cost_usd: number;
};

const MAX_INPUT_CHARS = 8000;

const RESPONSE_SCHEMA = {
  type: "object",
  required: ["humanized", "grade"],
  properties: {
    humanized: { type: "string" },
    detected: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "severity", "category", "before", "after"],
        properties: {
          id: { type: "string" },
          severity: { type: "string", enum: ["S1", "S2"] },
          category: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          note: { type: "string" },
        },
      },
    },
    grade: { type: "string", enum: ["A", "B", "C", "D"] },
    change_rate: { type: "number" },
    self_check: {
      type: "object",
      properties: {
        preserved_facts: { type: "boolean" },
        preserved_register: { type: "boolean" },
        no_genre_drift: { type: "boolean" },
        no_artificial_additions: { type: "boolean" },
        residual_s1_count: { type: "number" },
        residual_s2_count: { type: "number" },
      },
    },
    summary: { type: "string" },
  },
} as const;

export async function humanizeKorean(rawText: string): Promise<HumanizeResult> {
  if (!rawText || rawText.trim().length < 20) {
    throw new Error("입력 텍스트가 너무 짧습니다 (최소 20자)");
  }
  if (rawText.length > MAX_INPUT_CHARS) {
    throw new Error(`입력 텍스트가 너무 깁니다 (최대 ${MAX_INPUT_CHARS}자, 현재 ${rawText.length}자)`);
  }

  const t0 = Date.now();
  const provider = getLLMProvider({ provider: "anthropic" });
  const res = await provider.generate({
    system: HUMANIZE_KR_SYSTEM_PROMPT,
    prompt: `# 원문\n\n${rawText}\n\n위 글을 룰북에 따라 윤문하고 JSON으로 출력.`,
    temperature: 0.2,
    maxTokens: Math.min(16000, Math.ceil(rawText.length * 2) + 2000),
    cacheSystem: true,
    jsonSchema: RESPONSE_SCHEMA,
  });

  const raw = (res.json ?? {}) as Partial<HumanizeResult>;
  console.log(
    `[humanize] in=${rawText.length}ch out=${(raw.humanized ?? "").length}ch ` +
      `detected=${raw.detected?.length ?? 0} grade=${raw.grade ?? "?"} ` +
      `change=${raw.change_rate ?? "?"}`,
  );

  if (typeof raw.humanized !== "string" || raw.humanized.length === 0) {
    throw new Error(`LLM이 humanized 필드를 반환하지 않음 (head: "${(res.text ?? "").slice(0, 200)}")`);
  }

  const inputTokens = res.usage?.inputTokens ?? 0;
  const outputTokens = res.usage?.outputTokens ?? 0;
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

  return {
    humanized: raw.humanized,
    detected: Array.isArray(raw.detected) ? raw.detected : [],
    grade: (raw.grade as HumanizeResult["grade"]) ?? "C",
    change_rate: typeof raw.change_rate === "number" ? raw.change_rate : 0,
    self_check: (raw.self_check as HumanizeSelfCheck) ?? {
      preserved_facts: true,
      preserved_register: true,
      no_genre_drift: true,
      no_artificial_additions: true,
      residual_s1_count: 0,
      residual_s2_count: 0,
    },
    summary: typeof raw.summary === "string" ? raw.summary : "",
    original_length: rawText.length,
    generation_ms: Date.now() - t0,
    cost_usd: Number(costUsd.toFixed(4)),
  };
}
