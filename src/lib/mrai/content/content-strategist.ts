import { getLLMProvider } from "@/lib/llm";
import { loadWorkspaceMemories } from "../memory";
import { findRelevantSubgraph, formatSubgraphForPrompt } from "../memory/kg";
import type { Locale } from "../types";

/**
 * Content Strategist — the "CMO Agent" of the Trina pipeline mapped to
 * Mr. AI. Takes a one-line topic + workspace context (memories + KG)
 * and emits a structured content plan downstream stages consume:
 *
 *   1. ContentWriter (Sprint 6) — drafts per-format bodies from this plan
 *   2. Channel distribution (Sprint 7) — picks channels from formatRecommendations
 *   3. Performance loop (Sprint 8) — measures hit rate per pillar/keyword
 *
 * Output is a JSON plan, NOT prose. Keeps it usable by code (the writer
 * agent picks sections one at a time) without having to re-parse markdown.
 */

export type { Locale };

export interface ContentStrategy {
  pillar: string;
  keywords: string[];
  hook: string;
  sections: Array<{ h2: string; outline: string }>;
  cta: string;
  formatRecommendations: Partial<Record<"blog" | "linkedin" | "threads" | "email" | "twitter", string>>;
  suggestedPublishWindow?: string;
  riskNotes?: string[];
}

const SYSTEM_KO = `당신은 Mr. AI의 ContentStrategist (= Trina의 CMO Agent에 해당) 입니다.

역할:
- 한 줄 topic + 회사 context (memories + Knowledge Graph) → 멀티 포맷 콘텐츠 전략 JSON.
- 글을 직접 쓰지 않음. 다음 stage (Writer)가 이 전략을 보고 본문을 작성함.

원칙:
- 진짜 CEO가 자기 회사 콘텐츠 전략 짤 때처럼 reason. 일반론 금지.
- workspace memory + KG에 있는 entity/customer_segment/product 정보를 hook과 sections에 반영.
- Cannibalization 회피 — 이미 다룬 주제 (memories에서 보임) 반복하지 말 것.
- 모르면 "정보 부족" 명시. 추측 금지.

출력 JSON schema:
{
  "pillar": "이 콘텐츠가 속하는 큰 주제 (5-10자)",
  "keywords": ["SEO 키워드 또는 LinkedIn 검색 키워드", "..."] (3-7개),
  "hook": "독자를 끌어들이는 첫 문장 또는 contrarian angle (15-25자)",
  "sections": [
    { "h2": "섹션 제목", "outline": "이 섹션에서 다룰 핵심 1-2 문장" }
  ] (3-6개),
  "cta": "독자가 마지막에 할 행동 (예: '데모 요청', '다음 포스트 구독', '문의')",
  "formatRecommendations": {
    "blog": "1500w long-form 권장 이유 또는 'skip — 이유'",
    "linkedin": "150w hook + 3 bullets",
    "threads": "skip — too data-heavy 등",
    "email": "...",
    "twitter": "..."
  },
  "suggestedPublishWindow": "오전 KST 평일 / 화목 오후 / 등",
  "riskNotes": ["주의: 경쟁사 직접 언급 시 ...", ...] (선택)
}`;

const SYSTEM_EN = `You are Mr. AI's ContentStrategist (= the CMO Agent in the Trina pipeline).

Role:
- One-line topic + company context (memories + Knowledge Graph) → JSON multi-format content strategy.
- Do NOT write the body. The next stage (Writer) consumes this plan.

Principles:
- Reason like a real CEO planning their own company's content. No generic advice.
- Reference workspace memory + KG entities (customer_segment, product, market) in hook and sections.
- Avoid cannibalization — don't repeat topics visible in existing memories.
- If you don't know, say "insufficient information". No guessing.

Output JSON schema:
{
  "pillar": "the broad theme this content belongs to (1-5 words)",
  "keywords": ["SEO or LinkedIn search keyword", "..."] (3-7 items),
  "hook": "first sentence or contrarian angle that grabs the reader (1 sentence)",
  "sections": [
    { "h2": "section title", "outline": "1-2 sentences of what this section covers" }
  ] (3-6 items),
  "cta": "what the reader should do at the end",
  "formatRecommendations": {
    "blog": "1500w long-form recommended because ... or 'skip — reason'",
    "linkedin": "150w hook + 3 bullets",
    "threads": "skip — too data-heavy",
    "email": "...",
    "twitter": "..."
  },
  "suggestedPublishWindow": "morning KST weekday / Tue-Thu afternoon / etc",
  "riskNotes": ["watch out: direct competitor mention may ...", ...] (optional)
}`;

export async function runContentStrategist(input: {
  workspaceId: string;
  topic: string;
  goal?: string;
  targetAudience?: string;
  formats?: string[];
  tone?: string;
  locale: Locale;
}): Promise<{
  strategy: ContentStrategy;
  usage: { input?: number; output?: number };
  ms: number;
}> {
  const t0 = Date.now();

  // Pull workspace context — same evidence pattern as the chat L2.
  const [memories, kg] = await Promise.all([
    loadWorkspaceMemories(input.workspaceId),
    findRelevantSubgraph({
      workspaceId: input.workspaceId,
      queryText: input.topic,
      maxEntities: 12,
    }),
  ]);

  const memoryBlock = memories.length
    ? memories
        .slice(0, 30)
        .map((m) => `- [${m.kind}] ${m.title}: ${m.body}`)
        .join("\n")
    : input.locale === "en"
    ? "(no workspace memories yet)"
    : "(아직 저장된 memory 없음)";

  const kgBlock = kg.entities.length > 0 ? formatSubgraphForPrompt(kg, input.locale) : "";

  const userInputBlock =
    input.locale === "en"
      ? `## Topic\n${input.topic}\n\n## Refinements (optional)\n- Goal: ${input.goal ?? "(infer from context)"}\n- Target audience: ${input.targetAudience ?? "(infer)"}\n- Formats: ${(input.formats ?? []).join(", ") || "(recommend best)"}\n- Tone: ${input.tone ?? "(infer)"}`
      : `## Topic\n${input.topic}\n\n## 추가 입력 (선택)\n- 목표: ${input.goal ?? "(context에서 추론)"}\n- 타겟 독자: ${input.targetAudience ?? "(추론)"}\n- 포맷: ${(input.formats ?? []).join(", ") || "(최적 추천)"}\n- 톤: ${input.tone ?? "(추론)"}`;

  const prompt = `${userInputBlock}

---

## Workspace memories
${memoryBlock}

${kgBlock ? `\n${kgBlock}\n` : ""}

---

위 정보를 모두 활용해 ContentStrategy JSON을 반환하세요. 형식·필드 schema를 정확히 따르세요.`;

  const system = input.locale === "en" ? SYSTEM_EN : SYSTEM_KO;
  const provider = getLLMProvider({ provider: "anthropic" });

  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.3,
    maxTokens: 2000,
    cacheSystem: true,
    jsonSchema: {
      type: "object",
      required: ["pillar", "keywords", "hook", "sections", "cta", "formatRecommendations"],
      properties: {
        pillar: { type: "string", maxLength: 100 },
        keywords: { type: "array", items: { type: "string", maxLength: 60 }, minItems: 1, maxItems: 10 },
        hook: { type: "string", maxLength: 300 },
        sections: {
          type: "array",
          items: {
            type: "object",
            required: ["h2", "outline"],
            properties: {
              h2: { type: "string", maxLength: 120 },
              outline: { type: "string", maxLength: 400 },
            },
          },
          minItems: 2,
          maxItems: 8,
        },
        cta: { type: "string", maxLength: 200 },
        formatRecommendations: {
          type: "object",
          additionalProperties: { type: "string", maxLength: 300 },
        },
        suggestedPublishWindow: { type: "string", maxLength: 100 },
        riskNotes: { type: "array", items: { type: "string", maxLength: 300 } },
      },
    },
  });

  const raw = (res.json as Partial<ContentStrategy>) ?? {};
  const strategy: ContentStrategy = {
    pillar: typeof raw.pillar === "string" ? raw.pillar : input.topic,
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.filter((k): k is string => typeof k === "string").slice(0, 10)
      : [],
    hook: typeof raw.hook === "string" ? raw.hook : "",
    sections: Array.isArray(raw.sections)
      ? raw.sections.filter(
          (s): s is { h2: string; outline: string } =>
            !!s && typeof s.h2 === "string" && typeof s.outline === "string",
        )
      : [],
    cta: typeof raw.cta === "string" ? raw.cta : "",
    formatRecommendations:
      raw.formatRecommendations && typeof raw.formatRecommendations === "object"
        ? raw.formatRecommendations
        : {},
    suggestedPublishWindow:
      typeof raw.suggestedPublishWindow === "string" ? raw.suggestedPublishWindow : undefined,
    riskNotes: Array.isArray(raw.riskNotes)
      ? raw.riskNotes.filter((r): r is string => typeof r === "string")
      : undefined,
  };

  return {
    strategy,
    usage: { input: res.usage?.inputTokens, output: res.usage?.outputTokens },
    ms: Date.now() - t0,
  };
}
