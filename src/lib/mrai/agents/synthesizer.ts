import { getLLMProvider } from "@/lib/llm";
import { formatMemoriesForPrompt } from "../memory";
import { formatSubgraphForPrompt } from "../memory/kg";
import type { AnalystEvidence } from "./analyst";
import type { Locale } from "../types";

/**
 * L3 SYNTHESIZER — writes the user-facing answer from the evidence pack
 * + the L1 plan's answer guidance.
 *
 * This is the Sonnet/Opus-class layer (quality matters most here).
 * The system prompt is the same persistent-Mr.AI persona as the old
 * single-call chat — we just structure the user prompt around the
 * pre-fetched evidence instead of forcing the LLM to reason about
 * "what do I know" from raw memories.
 */

const PERSONA_KO = `당신은 Mr. AI — CEO를 위한 AI 비서입니다.

성격:
- 회계사처럼 정확하고, 컨설턴트처럼 간결합니다.
- 모호한 말 대신 숫자/사실/근거를 우선합니다.
- 의견을 물으면 트레이드오프를 먼저 말하고 권장안을 마지막에 줍니다.

답변 스타일:
- 한국어 (사용자가 영어로 묻지 않는 한).
- 짧게. 보통 3-6 문장. 표·리스트는 정말 필요할 때만.
- 모르는 건 "잘 모릅니다" 또는 "확인이 필요합니다"라고 답합니다. 추측 금지.
- CEO에게 보고하는 톤. "~인 것 같아요" 같은 흐릿한 표현 금지.

당신은 3-Layer Agent 의 L3 Synthesizer 입니다. 위 evidence pack은 L2 Analyst가 이미 수집했고, L1 Strategist의 answerGuidance를 따르세요.`;

const PERSONA_EN = `You are Mr. AI — an AI assistant for a CEO.

Personality:
- Precise like an accountant, concise like a consultant.
- Prefer numbers, facts, and citations over vague claims.
- When asked for an opinion, lead with trade-offs and end with the recommendation.

Style:
- English (unless the user writes to you in Korean).
- Short. Usually 3-6 sentences. Tables/lists only when truly needed.
- If you don't know, say "I don't know" or "needs verification". No guessing.
- CEO-reporting tone. Avoid hedging like "it seems" or "perhaps".

You are the L3 Synthesizer in a 3-Layer Agent pipeline. The evidence pack below was already gathered by the L2 Analyst; follow the L1 Strategist's answerGuidance.`;

function evidenceToBlock(evidence: AnalystEvidence, locale: Locale): string {
  const parts: string[] = [];

  if (evidence.memories.length > 0) {
    parts.push(formatMemoriesForPrompt(evidence.memories, locale));
  }

  // KG goes before signals/history so structured facts anchor the answer
  // before narrative context.
  if (evidence.kg.entities.length > 0) {
    parts.push(formatSubgraphForPrompt(evidence.kg, locale));
  }

  if (evidence.signals.length > 0) {
    const head = locale === "en" ? "## External signals" : "## 외부 신호";
    const lines = evidence.signals.map((s) => `- [${s.source}] ${s.summary}`).join("\n");
    parts.push(`${head}\n${lines}`);
  }

  if (evidence.history.length > 0) {
    const head = locale === "en" ? "## Recent conversation" : "## 최근 대화";
    const userLabel = locale === "en" ? "User" : "사용자";
    const transcript = evidence.history
      .map((t) => `${t.role === "user" ? userLabel : "Mr. AI"}: ${t.content}`)
      .join("\n\n");
    parts.push(`${head}\n${transcript}`);
  }

  if (parts.length === 0) {
    return locale === "en"
      ? "(No prior evidence — answer from general knowledge or ask for clarification.)"
      : "(이전 evidence 없음 — 일반 지식으로 답하거나 사용자에게 확인 요청.)";
  }
  return parts.join("\n\n");
}

export async function runSynthesizer(input: {
  userMessage: string;
  plan: { answerGuidance: string };
  evidence: AnalystEvidence;
  locale: Locale;
}): Promise<{ text: string; usage: { input?: number; output?: number }; ms: number }> {
  const t0 = Date.now();
  const persona = input.locale === "en" ? PERSONA_EN : PERSONA_KO;
  const evidenceBlock = evidenceToBlock(input.evidence, input.locale);

  const userLabel = input.locale === "en" ? "User" : "사용자";
  const guidanceLabel = input.locale === "en" ? "Answer guidance from L1" : "L1의 답변 가이드";
  const prompt = `${evidenceBlock}

---

## ${guidanceLabel}
${input.plan.answerGuidance}

---

${userLabel}: ${input.userMessage}

Mr. AI:`;

  const provider = getLLMProvider({ provider: "anthropic" });
  const res = await provider.generate({
    system: persona,
    prompt,
    temperature: 0.4,
    maxTokens: 1500,
    cacheSystem: true,
  });

  const text = (res.text ?? "").trim() || (input.locale === "en" ? "(empty response)" : "(빈 응답)");
  return {
    text,
    usage: { input: res.usage?.inputTokens, output: res.usage?.outputTokens },
    ms: Date.now() - t0,
  };
}
