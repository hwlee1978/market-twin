import { createServiceClient } from "@/lib/supabase/server";
import { getLLMProvider } from "@/lib/llm";
import type { Recommendation, RecommendInput } from "./recommend";
import { renderGroundingBlock, type PublicDataGrounding } from "./anchors";

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
  /**
   * 공공데이터 grounding — Hofstede / World Bank / KOTRA / UN Comtrade.
   * LLM이 인용한 데이터를 검증할 수 있도록 raw shape 그대로 반환.
   * undefined = 타겟국 추론 실패 또는 모든 anchor fetch 실패.
   */
  public_data_grounding?: PublicDataGrounding;
  generation_ms: number;
  cost_usd: number;
};

export type MultilingualSpec = {
  by_locale: Record<
    "ko" | "en" | "ja" | "zh-tw" | "zh-cn",
    {
      headline: string;        // ≤60자
      subtitle: string;        // headline 직하 부제 ≤100자
      tagline: string;         // ≤120자
      body: string;            // 본문 400-700자 (확장)
      bullets: string[];       // 3-5개 핵심 spec
      features: Array<{        // 5-7개 상세 feature (title + 1-2문장 설명)
        title: string;
        description: string;
      }>;
      target_audience: Array<{ // 2-3개 타겟 페르소나
        persona: string;       // "30대 직장인 워킹맘" 같은 구체 페르소나
        pain_point: string;    // 이 페르소나가 본 제품으로 해결할 문제
      }>;
      brand_story: string;     // 50-150자 브랜드/제품 탄생 배경
      seo_keywords: string[];  // 각 locale별 검색 SEO 키워드 5-8개
      cta: string;             // 행동 유도 문구
    }
  >;
  /**
   * 상세페이지 전용 풍부한 데이터 (한국어, locale-independent).
   * Smartstore·Shopee·Tmall 등 e-commerce 상세페이지 convention에 맞춰
   * detail_specs 표 + 사용 시나리오 + FAQ를 LLM이 한 번에 생성.
   * 다국어 spec과 분리해서 상세페이지가 단순히 기술서를 mirror하지 않도록.
   */
  detail_page?: {
    detail_specs: Array<{ label: string; value: string }>;  // 5-8개 spec 표 행
    usage_scenarios: Array<{ title: string; description: string }>; // 3-5 시나리오
    faq: Array<{ q: string; a: string }>;                    // 3-5 FAQ
  };
  generation_ms: number;
  cost_usd: number;
};

const REPORT_SYSTEM = `당신은 중소기업 수출·내수 마케팅 전략 컨설턴트입니다.

입력: 기업 정보 + 매칭된 정부 지원사업 Top-K + 자유 목표 + 공공데이터 grounding (제공된 경우).
출력: 1-pager 경영진 brief 형식의 시장분석 리포트 (JSON).

원칙:
- 한국어. 단정적이고 구체적.
- 추정·창작 금지. 입력 정보로 도출 가능한 사실만.
- 정부 데이터 + 매칭 사업 정보를 leverage로 명시.
- 실행 액션은 "다음 7일 / 다음 30일" 같은 구체 시점 포함.

⚠️ 공공데이터 grounding 인용 규칙 (블록이 제공된 경우만):
- market_signals 항목 중 최소 2개는 grounding 수치를 정확히 인용.
  예: "Hofstede 문화거리 KR↔VN 29점 (매우 가까움) — 권력거리/개인주의 유사",
      "World Bank: VN 가계소비 $866B (2024) — 대만 대비 ~3배 reachable market",
      "KOTRA: VN 진출 한국 화장품 기업 16개사 — 진입 모델 검증된 시장",
      "UN Comtrade: KR→VN 화장품(HS33) 수출 $520M (2024)".
- 인용 시 출처(Hofstede/World Bank/KOTRA/UN Comtrade) 명기.
- 데이터에 없는 수치 만들지 말 것. anchor 누락 시 해당 항목 생략.

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
  /**
   * 공공데이터 grounding (caller가 buildPublicDataGrounding 호출 후 주입).
   * 제공되면 프롬프트에 4개 anchor block 추가 + LLM이 인용 강제됨.
   */
  grounding?: PublicDataGrounding;
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

  const groundingBlock = input.grounding ? `\n${renderGroundingBlock(input.grounding)}\n` : "";

  const prompt = `# 기업
${JSON.stringify(input.company, null, 2)}

${input.products && input.products.length > 0 ? `# 제품\n${JSON.stringify(input.products, null, 2)}\n` : ""}
${input.goal ? `# 목표\n${input.goal}\n` : ""}
# 매칭된 정부 지원사업 / 바우처 Top-${input.recommendations.length}
${recBlock}
${groundingBlock}
위 정보를 종합해 경영진 brief 형식의 시장분석 리포트를 JSON으로.`;

  const res = await provider.generate({
    system: REPORT_SYSTEM,
    prompt,
    temperature: 0.2,
    maxTokens: 3000,
    cacheSystem: true,
    jsonSchema: {
      type: "object",
      required: ["executive_summary"],
      properties: {
        executive_summary: { type: "string" },
        matched_programs: { type: "array" },
        market_signals: { type: "array", items: { type: "string" } },
        recommended_actions: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
      },
    },
  });

  const raw = (res.json as Partial<MarketReport>) ?? {};
  // Diagnostic — surface raw shape to Vercel logs
  console.log(
    `[generateMarketReport] raw keys=[${Object.keys(raw).join(",")}] ` +
      `exec=${typeof raw.executive_summary === "string" ? raw.executive_summary.length : "missing"}ch ` +
      `text_head: "${(res.text ?? "").slice(0, 150).replace(/\s+/g, " ")}"`,
  );
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
    public_data_grounding: input.grounding,
    generation_ms: Date.now() - t0,
    cost_usd: Number(costUsd.toFixed(4)),
  };
}

const SPEC_SYSTEM = `당신은 한국 제품의 다국어 마케팅 카피라이터 + e-commerce 상세페이지 기획자입니다.

입력: 제품 정보 + 타겟 시장 컨텍스트.
출력: 두 가지를 JSON으로 한 번에:
  (A) by_locale — 5개 locale (KR/EN/JP/TW-zh/CN-zh) 풍부한 상품 기술서
  (B) detail_page — 한국어 풍부한 상세페이지 데이터 (Smartstore convention)

원칙:
- (A) 각 locale의 모국어로 자연스럽게. 한국 인명·고유명사 [[name-localization]] 규칙 (TW/CN는 중문명+로마자).
- (B) 한국어로만. detail_page는 (A) ko와 중복되지 않는 풍부한 정보 (스펙 표·시나리오·FAQ).
- 단정적·구체적. 외래어 남용 금지. 추정·창작 금지 — 입력 정보로 도출 가능한 사실만.

⚠️ (A) by_locale 각 locale마다 다음 9개 필드 모두 작성:
- headline: ≤ 60자, 강력한 단언 + 핵심 차별점 1개
- subtitle: ≤ 100자, headline을 보완하는 부제 (감성·이유·약속)
- tagline: ≤ 120자, 한 줄 슬로건
- body: 400-700자 본문. 제품 정의 + 차별점 + 사용 시나리오 + 신뢰 근거를 2-3 문단으로
- bullets: 3-5개 핵심 spec (각 ≤ 50자, 짧고 검색 가능한 키워드)
- features: 5-7개 상세 feature {title (≤ 20자), description (1-2문장)}
- target_audience: 2-3개 타겟 페르소나 {persona (구체적 인구·생활 패턴), pain_point (이 페르소나가 본 제품으로 해결할 구체 문제)}
- brand_story: 50-150자, 제품·브랜드 탄생 배경 (story-driven, 감성)
- seo_keywords: 5-8개 검색 키워드 (해당 locale 시장에서 실제 검색되는 키워드, 한국어 키워드 직역 금지)
- cta: 행동 유도 문구 1줄

⚠️ Locale별 톤 가이드:
- ko: 친근한 정중체, Smartstore convention
- en: Benefit-driven, SEO-friendly, active voice, US/Global
- ja: 정중한 です·ます 체, 안전성·인증·세심함 강조
- zh-tw: 繁體中文, Shopee/momo TW 톤, 가격·할인·즉시 구매 강조
- zh-cn: 简体中文, Tmall 톤, 브랜드 신뢰성·후기·정품 강조

JSON only:
{
  "by_locale": {
    "ko": { "headline": "", "subtitle": "", "tagline": "", "body": "", "bullets": [...], "features": [{"title":"","description":""}, ...], "target_audience": [{"persona":"","pain_point":""}, ...], "brand_story": "", "seo_keywords": [...], "cta": "" },
    "en": { ... }, "ja": { ... }, "zh-tw": { ... }, "zh-cn": { ... }
  },
  "detail_page": {
    "detail_specs": [
      { "label": "소재", "value": "메리노 울 100%" },
      { "label": "사이즈", "value": "230-280mm (5mm 단위)" },
      { "label": "원산지", "value": "대한민국" },
      { "label": "인증", "value": "친환경 ISO 14001" }
      // 5-8개. 소재·사이즈·컬러·중량·원산지·인증·구성품·KC인증번호 등 카테고리 적합한 것만
    ],
    "usage_scenarios": [
      { "title": "통근·도심 일상", "description": "1-2문장 한국어 — 어떤 상황에서 어떻게 쓰는지" }
      // 3-5개 시나리오
    ],
    "faq": [
      { "q": "사이즈는 어떻게 선택하나요?", "a": "1-2문장 한국어 답변" }
      // 3-5 FAQ. 사이즈/세탁/배송/교환/A/S 등 실제 구매 의사결정 시 떠오를 질문
    ]
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

  const localeSchema = {
    type: "object",
    required: ["headline", "body"],
    properties: {
      headline: { type: "string" },
      subtitle: { type: "string" },
      tagline: { type: "string" },
      body: { type: "string" },
      bullets: { type: "array", items: { type: "string" } },
      features: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "description"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
        },
      },
      target_audience: {
        type: "array",
        items: {
          type: "object",
          required: ["persona", "pain_point"],
          properties: {
            persona: { type: "string" },
            pain_point: { type: "string" },
          },
        },
      },
      brand_story: { type: "string" },
      seo_keywords: { type: "array", items: { type: "string" } },
      cta: { type: "string" },
    },
  };
  const res = await provider.generate({
    system: SPEC_SYSTEM,
    prompt,
    temperature: 0.3,
    maxTokens: 12000,
    cacheSystem: true,
    jsonSchema: {
      type: "object",
      required: ["by_locale"],
      properties: {
        by_locale: {
          type: "object",
          properties: {
            ko: localeSchema,
            en: localeSchema,
            ja: localeSchema,
            "zh-tw": localeSchema,
            "zh-cn": localeSchema,
          },
        },
        detail_page: {
          type: "object",
          properties: {
            detail_specs: {
              type: "array",
              items: {
                type: "object",
                required: ["label", "value"],
                properties: {
                  label: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
            usage_scenarios: {
              type: "array",
              items: {
                type: "object",
                required: ["title", "description"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
            faq: {
              type: "array",
              items: {
                type: "object",
                required: ["q", "a"],
                properties: {
                  q: { type: "string" },
                  a: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  });

  const raw = (res.json as {
    by_locale?: MultilingualSpec["by_locale"];
    detail_page?: MultilingualSpec["detail_page"];
  }) ?? {};
  console.log(
    `[generateMultilingualSpec] raw keys=[${Object.keys(raw).join(",")}] ` +
      `locales=${Object.keys(raw.by_locale ?? {}).join(",")} ` +
      `detail_specs=${raw.detail_page?.detail_specs?.length ?? 0} ` +
      `scenarios=${raw.detail_page?.usage_scenarios?.length ?? 0} ` +
      `faq=${raw.detail_page?.faq?.length ?? 0}`,
  );
  const inputTokens = res.usage?.inputTokens ?? 0;
  const outputTokens = res.usage?.outputTokens ?? 0;
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

  const empty = {
    headline: "",
    subtitle: "",
    tagline: "",
    body: "",
    bullets: [] as string[],
    features: [] as Array<{ title: string; description: string }>,
    target_audience: [] as Array<{ persona: string; pain_point: string }>,
    brand_story: "",
    seo_keywords: [] as string[],
    cta: "",
  };
  const byLocale = raw.by_locale ?? {} as MultilingualSpec["by_locale"];

  return {
    by_locale: {
      ko: byLocale.ko ?? empty,
      en: byLocale.en ?? empty,
      ja: byLocale.ja ?? empty,
      "zh-tw": byLocale["zh-tw"] ?? empty,
      "zh-cn": byLocale["zh-cn"] ?? empty,
    },
    detail_page: raw.detail_page,
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
