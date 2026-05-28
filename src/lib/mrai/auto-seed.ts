import { tavilySearch } from "@/lib/market-research/tavily";
import { getLLMProvider } from "@/lib/llm";
import { ONBOARDING_STEPS, type OnboardingStepId } from "./onboarding-spec";
import { saveStepAnswer, markOnboardingComplete } from "./onboarding";

/**
 * Mr. AI Auto-Seed — turn a company name (+ optional website) into a
 * fully-populated 8-step onboarding interview without the user typing
 * each answer.
 *
 * Flow:
 *   1) Parallel Tavily search (5 angled queries — scale, products,
 *      channels, competitors, KPIs/markets).
 *   2) Optional fetch of the company's own homepage for self-described
 *      positioning (often the most accurate channel-mix source).
 *   3) Anthropic Sonnet 4.6 synthesizes the search results into a JSON
 *      object keyed by step id, with "(정보 부족 — 검토 필요)" markers
 *      for fields the search couldn't ground.
 *   4) Each answer is upserted via the existing saveStepAnswer path so
 *      the resume / dedupe logic stays identical to manual onboarding.
 *
 * Cost target: ~$0.10-0.30 per auto-seed run.
 *   - 5 Tavily searches * ~$0.015 = $0.075
 *   - 1 Sonnet pass ~3000 in / 2000 out ≈ $0.04
 *   - Total ~$0.10-0.15 typical, up to $0.30 with retries.
 *
 * Graceful degradation: missing TAVILY_API_KEY falls back to LLM-only
 * (worse quality but still 5-7 reasonable defaults). Missing LLM key
 * is fatal — returns an error to the caller.
 */

export interface AutoSeedInput {
  workspaceId: string;
  userId: string;
  companyName: string;
  websiteUrl?: string;
  /**
   * Optional free-text the user pastes (e.g. company deck excerpt,
   * about-us blurb) to ground the synthesis. Capped at 6000 chars.
   */
  extraContext?: string;
}

export interface AutoSeedDraftAnswer {
  stepId: OnboardingStepId;
  shortLabel: string;
  body: string;
  /** True if the synthesizer flagged this answer as low-confidence. */
  needsReview: boolean;
}

export interface AutoSeedResult {
  answers: AutoSeedDraftAnswer[];
  sourceUrls: string[];
  costEstimateUsd: number;
  /** Step ids that got saved to mrai_memories. */
  savedSteps: OnboardingStepId[];
  /** Failures, if any (per-step save errors). */
  errors: Array<{ stepId: OnboardingStepId; error: string }>;
}

interface ResearchBundle {
  companyName: string;
  websiteUrl?: string;
  searchSnippets: Array<{ angle: string; answer?: string; results: string }>;
  sourceUrls: string[];
  extraContext?: string;
}

const SEARCH_ANGLES: Array<{ key: string; queryTemplate: (name: string) => string }> = [
  {
    key: "scale",
    queryTemplate: (n) => `${n} 매출 영업이익 직원수 설립연도 성장률 회사소개`,
  },
  {
    key: "products",
    queryTemplate: (n) => `${n} 주력 제품 가격대 베스트셀러 시그니처 모델 특징`,
  },
  {
    key: "channels",
    queryTemplate: (n) => `${n} 자사몰 무신사 네이버 쿠팡 백화점 판매 채널 비중`,
  },
  {
    key: "competitors_direct",
    queryTemplate: (n) => `${n} 직접 경쟁사 카테고리 1위 동일 제품군 비교`,
  },
  {
    key: "competitors_indirect",
    queryTemplate: (n) =>
      `${n} 대체재 소비자 인식 경쟁 브랜드 시장 점유율`,
  },
  {
    key: "market",
    queryTemplate: (n) => `${n} 해외 진출 글로벌 신규 시장 전략 일본 미국`,
  },
];

export async function runAutoSeed(input: AutoSeedInput): Promise<AutoSeedResult> {
  const bundle = await gatherResearch(input);
  const draft = await synthesizeAnswers(bundle);

  const savedSteps: OnboardingStepId[] = [];
  const errors: AutoSeedResult["errors"] = [];

  // Persist sequentially so a per-step DB hiccup doesn't poison the rest.
  // (saveStepAnswer is upsert-keyed so re-running auto-seed overwrites
  // prior draft answers cleanly.)
  for (const a of draft.answers) {
    const result = await saveStepAnswer({
      workspaceId: input.workspaceId,
      userId: input.userId,
      stepId: a.stepId,
      answer: a.body,
    });
    if (result.ok) {
      savedSteps.push(a.stepId);
    } else {
      errors.push({ stepId: a.stepId, error: result.error });
    }
  }

  // Mark workspace onboarded when every step saved. This flips the panel
  // into CompletedCard mode so the user can inline-edit any "(정보 부족)"
  // answer (the answer endpoint does this same auto-complete after the
  // last manual step — we replicate it here for the bulk path).
  if (savedSteps.length >= ONBOARDING_STEPS.length) {
    await markOnboardingComplete(input.workspaceId);
  }

  return {
    answers: draft.answers,
    sourceUrls: bundle.sourceUrls,
    costEstimateUsd: draft.costEstimateUsd,
    savedSteps,
    errors,
  };
}

async function gatherResearch(input: AutoSeedInput): Promise<ResearchBundle> {
  const sourceUrls: string[] = [];
  const searchSnippets: ResearchBundle["searchSnippets"] = [];

  // Issue all 5 searches in parallel — Tavily handles concurrent calls
  // fine and this keeps the user-perceived wait under 30 seconds.
  const searches = await Promise.all(
    SEARCH_ANGLES.map((angle) =>
      tavilySearch({
        query: angle.queryTemplate(input.companyName),
        searchDepth: "advanced",
        maxResults: 4,
        includeAnswer: true,
      }).then((r) => ({ key: angle.key, result: r })),
    ),
  );

  for (const s of searches) {
    if (!s.result) continue;
    // Capture more material per angle — earlier 3×400 was too aggressive
    // a cap, causing the synthesizer to produce one-liner answers that
    // dropped most of what Tavily actually found.
    const top = s.result.results.slice(0, 6);
    const snippet = top
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 1200)}`)
      .join("\n\n");
    searchSnippets.push({
      angle: s.key,
      answer: s.result.answer,
      results: snippet,
    });
    for (const r of top) {
      if (r.url && !sourceUrls.includes(r.url)) sourceUrls.push(r.url);
    }
  }

  return {
    companyName: input.companyName,
    websiteUrl: input.websiteUrl,
    searchSnippets,
    sourceUrls,
    extraContext: input.extraContext?.slice(0, 6000),
  };
}

async function synthesizeAnswers(
  bundle: ResearchBundle,
): Promise<{ answers: AutoSeedDraftAnswer[]; costEstimateUsd: number }> {
  const stepBlock = ONBOARDING_STEPS.map(
    (s, i) =>
      `${i + 1}. id=${s.id}  ·  ${s.shortLabel} (${s.required ? "필수" : "선택"})\n   질문: ${s.question.replace(/\n+/g, " ").slice(0, 200)}\n   예시: ${s.example}`,
  ).join("\n\n");

  const researchBlock = bundle.searchSnippets
    .map(
      (s) =>
        `## ${s.angle}\n` +
        (s.answer ? `요약: ${s.answer}\n\n` : "") +
        `검색 결과:\n${s.results}`,
    )
    .join("\n\n---\n\n");

  const system = `당신은 한국 기업 비즈니스 리서치 전문가입니다. 주어진 검색 결과를 **최대한 깊이 활용해서** 대상 회사 임원이 의사결정에 바로 쓸 수 있는 풍부한 워크스페이스 컨텍스트를 만들어야 합니다.

== 답변 깊이 규칙 (가장 중요) ==
검색 결과에 정보가 있으면 **요약하지 말고 모두 보존**하세요. LLM이 자체 압축하면 사용자가 다시 입력해야 하는 negative-value가 발생합니다.

- products / competitors / channels / scale 답변: **반드시 100~600자 이상**, 검색에 등장한 모든 브랜드명·숫자·가격·차별점·시장순위·연도를 포함. 카테고리/계층 구조 권장 (예: "1. 직접 경쟁사 — A, B / 2. 카테고리 경쟁사 — C, D / 3. 소비자 인식 경쟁사 — E, F").
- business / market 답변: 80~250자, 사업 본질 + 시장 현황 + 한 줄 차별점.
- executive / decisions / kpi: 외부에서 알기 어려우므로 needsReview=true + "(정보 부족 — 임원 검토 필요)" 본문. 단 검색에 의사결정 관련 키워드(해외 진출/투자/IPO 등)가 있으면 그것만 짧게 인용 + needsReview=true.

== 좋은 답변 예시 (competitors — 컴포트 슈즈 브랜드의 경우 가상 예시) ==
"1. 직접 경쟁사 — 메리노울/천연소재 컴포트 슈즈: 글로벌 1위 브랜드(설립 연도, 시그니처 모델, 가격대, 한국 진출 여부). 후발 브랜드 1-2개.
2. 카테고리 경쟁사 — 한국 컴포트 슈즈: 가죽 로퍼/플랫·캐주얼 스니커즈 등 인접 카테고리 주요 브랜드, 가격대.
3. 소비자 인식 경쟁사 — 타겟 세그먼트 대안: 미드솔 워킹화·메모리폼·아치핏 등 기능 기반 대안, 국내 시장 매출 규모."

== 나쁜 답변 (절대 금지) ==
"국내: 브랜드 A, 브랜드 B. 해외 직접 경쟁사 정보는 검색에서 확인되지 않아 추가 검토 필요." ← 검색에 있던 다른 브랜드를 누락한 LLM 자체 압축

== 사실성 ==
- 검색에 직접 등장하지 않은 사실은 만들지 마세요.
- 숫자(매출·직원·가격)는 출처에 있을 때만, 없으면 그 부분만 "(미공개)"로.
- 검색에 부분 정보만 있어도 그 부분만큼은 풀어서 쓰고, 결말부에 "(나머지는 추가 검토 권장)"으로 표시.

응답은 반드시 유효한 JSON 한 객체로, 코드펜스나 다른 텍스트 없이.`;

  const stepDepthGuide = `
- business: 80~200자, 사업의 본질 + 차별점
- scale: 80~250자, 매출·영업이익·직원·설립·성장률 등 검색에 있는 모든 숫자
- products: 150~500자, 베스트셀러 모델명·가격대·시그니처 특징 풀어쓰기
- channels: 150~400자, 채널별 비중·매장수·온라인 플랫폼 입점 현황
- competitors: 250~700자 **필수** (위 예시처럼 3계층 분류 권장)
- executive: needsReview=true, "(정보 부족 — 임원 검토 필요)"
- decisions: 검색에 진출/투자/IPO 키워드 있으면 50~200자 인용 + needsReview=true, 없으면 "(정보 부족 — 임원 검토 필요)"
- kpi: needsReview=true, "(정보 부족 — 임원 검토 필요)"`;

  const prompt = `회사명: ${bundle.companyName}
${bundle.websiteUrl ? `웹사이트: ${bundle.websiteUrl}\n` : ""}${bundle.extraContext ? `\n사용자 추가 컨텍스트 (가장 신뢰도 높은 정보, 검색 결과보다 우선):\n${bundle.extraContext}\n` : ""}
== 8단계 온보딩 항목 ==
${stepBlock}

== 단계별 답변 분량 가이드 ==
${stepDepthGuide}

== 웹 검색 자료 (5~6 각도, 각도당 최대 6 결과) ==
${researchBlock || "(검색 결과 없음 — TAVILY_API_KEY 미설정이거나 검색 실패)"}

이제 위 분량 가이드를 엄수해서 JSON으로 응답하세요. competitors는 절대 한두 줄로 압축하지 말고 검색에 나온 모든 브랜드를 카테고리별로 풀어쓰세요:
{
  "answers": [
    { "stepId": "business", "body": "...", "needsReview": false },
    { "stepId": "scale", "body": "...", "needsReview": false },
    { "stepId": "products", "body": "...", "needsReview": false },
    { "stepId": "channels", "body": "...", "needsReview": false },
    { "stepId": "competitors", "body": "...", "needsReview": false },
    { "stepId": "executive", "body": "(정보 부족 — 임원 검토 필요)", "needsReview": true },
    { "stepId": "decisions", "body": "...", "needsReview": true },
    { "stepId": "kpi", "body": "(정보 부족 — 임원 검토 필요)", "needsReview": true }
  ]
}`;

  const provider = getLLMProvider({ provider: "anthropic" });
  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.3,
    // 6000 → answer bodies 100~700자 × 8 + JSON 구조 충분. 이전 2400은
    // competitors 한 항목만으로 절반이 차서 LLM이 자체 압축했음.
    maxTokens: 6000,
    cacheSystem: false,
  });
  const text = (res.text ?? "").trim();
  if (!text) throw new Error("empty synthesizer response");

  const parsed = parseSynthesizerJson(text);
  const answers = normalizeAnswers(parsed);

  // Approximate cost: Sonnet 4.6 is ~$3/M in + $15/M out. Round to 3
  // decimals for the UI badge.
  const inputTokens = res.usage?.inputTokens ?? 0;
  const outputTokens = res.usage?.outputTokens ?? 0;
  const llmCost = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
  const tavilyCost = bundle.searchSnippets.length * 0.015;
  const costEstimateUsd = Math.round((llmCost + tavilyCost) * 1000) / 1000;

  return { answers, costEstimateUsd };
}

function parseSynthesizerJson(text: string): unknown {
  // Strip code fences if the model added them.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: find the first { ... } block and try that.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("synthesizer returned non-JSON");
    return JSON.parse(m[0]);
  }
}

function normalizeAnswers(raw: unknown): AutoSeedDraftAnswer[] {
  const obj = raw as { answers?: unknown } | null;
  const list = Array.isArray(obj?.answers) ? (obj!.answers as unknown[]) : [];
  const byId = new Map<OnboardingStepId, AutoSeedDraftAnswer>();

  for (const item of list) {
    const a = item as Partial<AutoSeedDraftAnswer> | null;
    if (!a) continue;
    const id = a.stepId as OnboardingStepId;
    const step = ONBOARDING_STEPS.find((s) => s.id === id);
    if (!step) continue;
    const body = typeof a.body === "string" ? a.body.trim() : "";
    if (!body) continue;
    byId.set(id, {
      stepId: id,
      shortLabel: step.shortLabel,
      body: body.slice(0, 2000),
      needsReview: a.needsReview === true,
    });
  }

  // Fill in any missing steps with a low-confidence stub so the user
  // sees all 8 cards (otherwise they'd be confused about why some
  // steps look untouched after auto-seed).
  for (const step of ONBOARDING_STEPS) {
    if (!byId.has(step.id)) {
      byId.set(step.id, {
        stepId: step.id,
        shortLabel: step.shortLabel,
        body: "(정보 부족 — 임원 검토 필요)",
        needsReview: true,
      });
    }
  }

  // Preserve canonical step order.
  return ONBOARDING_STEPS.map((s) => byId.get(s.id)!).filter(Boolean);
}
