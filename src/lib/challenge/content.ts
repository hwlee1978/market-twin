import { createServiceClient } from "@/lib/supabase/server";
import { getLLMProvider } from "@/lib/llm";
import type { Recommendation, RecommendInput } from "./recommend";

/**
 * 챌린지 Task 2 — 마케팅 콘텐츠 제작.
 *
 * 산출물 2종 (영상/상세페이지는 Phase D):
 *   ① 시장분석 리포트 — 추천 결과 기반 정부 데이터 grounded brief
 *   ② 다국어 상품 기술서 — KR/EN/JP/ZH-TW/ZH-CN 5개국어
 *
 * 둘 다 단일 LLM call로 생성. JSON 출력 → UI/PDF 변환 책임은 호출자.
 */

export type MarketReport = {
  executive_summary: string;
  matched_programs: Array<{
    program_name: string;
    type: "domestic" | "export";
    fit_score: number;
    leverage: string;          // 이 사업이 우리에게 제공할 leverage 1-2문장
  }>;
  market_signals: string[];    // 정부 데이터에서 도출한 시장 신호 3-5개
  recommended_actions: string[]; // 3-5개 실행 action
  risks: string[];             // 2-3 리스크
  generation_ms: number;
  cost_usd: number;
};

export type MultilingualSpec = {
  by_locale: Record<
    "ko" | "en" | "ja" | "zh-tw" | "zh-cn",
    {
      headline: string;        // ≤60자
      tagline: string;         // ≤120자
      body: string;            // 200-400자
      bullets: string[];       // 3-5개 핵심 spec
      cta: string;             // 행동 유도 문구
    }
  >;
  generation_ms: number;
  cost_usd: number;
};

const REPORT_SYSTEM = `당신은 중소기업 수출·내수 마케팅 전략 컨설턴트입니다.

입력: 기업 정보 + 매칭된 정부 지원사업 Top-K + 자유 목표.
출력: 1-pager 경영진 brief 형식의 시장분석 리포트 (JSON).

원칙:
- 한국어. 단정적이고 구체적.
- 추정·창작 금지. 입력 정보로 도출 가능한 사실만.
- 정부 데이터 + 매칭 사업 정보를 leverage로 명시.
- 실행 액션은 "다음 7일 / 다음 30일" 같은 구체 시점 포함.

JSON only:
{
  "executive_summary": "2-3문장 한국어",
  "matched_programs": [
    { "program_name": "...", "type": "domestic"|"export", "fit_score": 0~100, "leverage": "1-2문장 한국어" }
  ],
  "market_signals": ["3-5개 한국어 신호 (e.g. 매출 규모 대비 R&D 지원 한도)"],
  "recommended_actions": ["3-5개 구체 액션 (e.g. '다음 7일: ~~ 신청서 작성')"],
  "risks": ["2-3개 한국어 리스크"]
}`;

export async function generateMarketReport(input: {
  company: RecommendInput["company"];
  products?: RecommendInput["products"];
  goal?: string;
  recommendations: Recommendation[];
}): Promise<MarketReport> {
  const t0 = Date.now();
  const provider = getLLMProvider({ provider: "anthropic" });

  const recBlock = input.recommendations
    .map(
      (r, i) =>
        `${i + 1}. [${r.type === "domestic" ? "내수" : "수출"}] ${r.program_name} (LLM 적합도 ${r.llm_score}/100)
   이유: ${r.reason}`,
    )
    .join("\n");

  const prompt = `# 기업
${JSON.stringify(input.company, null, 2)}

${input.products && input.products.length > 0 ? `# 제품\n${JSON.stringify(input.products, null, 2)}\n` : ""}
${input.goal ? `# 목표\n${input.goal}\n` : ""}
# 매칭된 정부 지원사업 / 바우처 Top-${input.recommendations.length}
${recBlock}

위 정보를 종합해 경영진 brief 형식의 시장분석 리포트를 JSON으로.`;

  const res = await provider.generate({
    system: REPORT_SYSTEM,
    prompt,
    temperature: 0.2,
    maxTokens: 3000,
    cacheSystem: true,
  });

  const raw = (res.json as Partial<MarketReport>) ?? {};
  const inputTokens = res.usage?.inputTokens ?? 0;
  const outputTokens = res.usage?.outputTokens ?? 0;
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

  return {
    executive_summary: typeof raw.executive_summary === "string" ? raw.executive_summary : "",
    matched_programs: Array.isArray(raw.matched_programs) ? raw.matched_programs.slice(0, 10) : [],
    market_signals: Array.isArray(raw.market_signals) ? raw.market_signals.slice(0, 8) : [],
    recommended_actions: Array.isArray(raw.recommended_actions)
      ? raw.recommended_actions.slice(0, 8)
      : [],
    risks: Array.isArray(raw.risks) ? raw.risks.slice(0, 5) : [],
    generation_ms: Date.now() - t0,
    cost_usd: Number(costUsd.toFixed(4)),
  };
}

const SPEC_SYSTEM = `당신은 한국 제품의 다국어 마케팅 카피라이터입니다.

입력: 제품 정보 + 타겟 시장 컨텍스트.
출력: 5개 locale (KR/EN/JP/TW-zh/CN-zh) 의 상품 기술서 (JSON).

원칙:
- 각 locale의 모국어로 자연스럽게.
- 한국 인명·고유명사는 [[name-localization]] 규칙 따름 — TW/CN는 중문명+로마자 (예: 임윤아 → 潤娥 (Yoona)). 명확하지 않으면 로마자만.
- 단정적·구체적. 외래어 남용 금지.
- 각 필드 길이 엄수 — headline ≤ 60자, tagline ≤ 120자, body 200-400자.

JSON only:
{
  "by_locale": {
    "ko": { "headline": "", "tagline": "", "body": "", "bullets": ["", ...], "cta": "" },
    "en": { ... },
    "ja": { ... },
    "zh-tw": { ... },
    "zh-cn": { ... }
  }
}`;

export async function generateMultilingualSpec(input: {
  product: NonNullable<RecommendInput["products"]>[number];
  company: RecommendInput["company"];
  targetMarkets?: string[];   // ["US", "JP", "TW"] etc — UI 안내용
}): Promise<MultilingualSpec> {
  const t0 = Date.now();
  const provider = getLLMProvider({ provider: "anthropic" });

  const prompt = `# 제품
${JSON.stringify(input.product, null, 2)}

# 회사 컨텍스트
${JSON.stringify(input.company, null, 2)}

${input.targetMarkets ? `# 타겟 시장\n${input.targetMarkets.join(", ")}\n` : ""}

위 정보로 5개 locale 상품 기술서를 JSON으로.`;

  const res = await provider.generate({
    system: SPEC_SYSTEM,
    prompt,
    temperature: 0.3,
    maxTokens: 4000,
    cacheSystem: true,
  });

  const raw = (res.json as { by_locale?: MultilingualSpec["by_locale"] }) ?? {};
  const inputTokens = res.usage?.inputTokens ?? 0;
  const outputTokens = res.usage?.outputTokens ?? 0;
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

  const empty = { headline: "", tagline: "", body: "", bullets: [], cta: "" };
  const byLocale = raw.by_locale ?? {} as MultilingualSpec["by_locale"];

  return {
    by_locale: {
      ko: byLocale.ko ?? empty,
      en: byLocale.en ?? empty,
      ja: byLocale.ja ?? empty,
      "zh-tw": byLocale["zh-tw"] ?? empty,
      "zh-cn": byLocale["zh-cn"] ?? empty,
    },
    generation_ms: Date.now() - t0,
    cost_usd: Number(costUsd.toFixed(4)),
  };
}

/**
 * 결과를 ch_recommendations.recommendations 옆에 같이 저장하는 게 아니라
 * 별도 컬럼/테이블에 두기 위한 helper. v1 scope: jsonb 컬럼에 끼워넣음.
 *
 * 후속 phase E에서 A/B battle 등록 시 이 결과를 candidate output으로 사용.
 */
export async function attachContentToRecommendation(
  recommendationId: string,
  content: { report?: MarketReport; spec?: MultilingualSpec },
): Promise<void> {
  const svc = createServiceClient();
  await svc
    .from("ch_recommendations")
    .update({
      recommendations: { content }, // jsonb append-only field
    })
    .eq("id", recommendationId);
}
