/**
 * Onboarding interview spec — types + step catalog ONLY.
 *
 * Kept in its own file (no server imports) so client components can
 * import the step list and types without pulling `next/headers` into
 * the browser bundle. Server-side logic (DB reads/writes) lives in
 * onboarding.ts and re-exports these types.
 */

import type { MemoryKind } from "./memory";

export type OnboardingStepId =
  | "business"
  | "scale"
  | "products"
  | "channels"
  | "competitors"
  | "executive"
  | "decisions"
  | "kpi";

export interface OnboardingStep {
  id: OnboardingStepId;
  index: number;
  total: number;
  icon: string;
  shortLabel: string;
  question: string;
  placeholder: string;
  example: string;
  memoryKind: MemoryKind;
  memoryTitle: string;
  required: boolean;
}

export interface OnboardingState {
  completed: boolean;
  completedAt: string | null;
  totalSteps: number;
  answeredSteps: OnboardingStepId[];
  currentStep: OnboardingStep | null;
}

const RAW_STEPS: Omit<OnboardingStep, "index" | "total">[] = [
  {
    id: "business",
    icon: "🏢",
    shortLabel: "사업 영역",
    question:
      "안녕하세요, Mr. AI입니다. 워크스페이스 세팅을 함께 진행하겠습니다.\n\n먼저 어떤 사업을 하시는지 한두 줄로 알려주세요.",
    placeholder: "예: 프리미엄 양가죽 아우터 D2C 브랜드",
    example: "프리미엄 양가죽 아우터 D2C 브랜드",
    memoryKind: "context",
    memoryTitle: "사업 영역",
    required: true,
  },
  {
    id: "scale",
    icon: "📊",
    shortLabel: "회사 규모",
    question:
      "감사합니다. 회사 규모를 알려주세요 — 연 매출, 직원 수, 설립 연도 정도면 충분합니다.",
    placeholder: "예: 연매출 50억, 직원 22명, 2019년 설립",
    example: "연매출 50억, 직원 22명, 2019년 설립",
    memoryKind: "context",
    memoryTitle: "회사 규모",
    required: false,
  },
  {
    id: "products",
    icon: "🎁",
    shortLabel: "주력 제품",
    question:
      "어떤 제품(또는 서비스)을 주로 판매하시나요? 가격대까지 같이 알려주시면 좋습니다. 최대 3개까지.",
    placeholder: "예: 캐시미어 100% 롱코트 280만원, 양가죽 카드지갑 12만원",
    example: "캐시미어 100% 롱코트 280만원, 양가죽 카드지갑 12만원",
    memoryKind: "fact",
    memoryTitle: "주력 SKU",
    required: true,
  },
  {
    id: "channels",
    icon: "🛒",
    shortLabel: "판매 채널",
    question:
      "현재 어디서 주로 판매하시나요? 자사몰·온라인 플랫폼·오프라인 비율을 함께 알려주시면 채널별 전략을 세울 때 활용합니다.",
    placeholder: "예: 자사몰 70% / 무신사 20% / 오프라인 팝업 10%",
    example: "자사몰 70% / 무신사 20% / 오프라인 팝업 10%",
    memoryKind: "fact",
    memoryTitle: "판매 채널 구성",
    required: false,
  },
  {
    id: "competitors",
    icon: "🥊",
    shortLabel: "경쟁사",
    question:
      "주요 경쟁사를 알려주세요. 국내 1~3, 해외 1~3 정도. 시뮬레이션과 KG(Knowledge Graph)에 자동 반영됩니다.",
    placeholder: "예: 국내 — 어센틱브랜드, 매그놀리아 / 해외 — Acne Studios, Toteme",
    example: "국내 어센틱브랜드·매그놀리아, 해외 Acne Studios·Toteme",
    memoryKind: "fact",
    memoryTitle: "경쟁 구도",
    required: false,
  },
  {
    id: "executive",
    icon: "👤",
    shortLabel: "본인 프로필",
    question:
      "임원님 본인의 직책과, Mr. AI가 매일 최우선으로 챙겨야 할 관심사 1~2개를 알려주세요. 모든 Briefing이 이 관심사 기준으로 작성됩니다.",
    placeholder: "예: 사업개발 임원 / 일본 진출 타이밍·채널 전략",
    example: "사업개발 임원 / 일본 진출 타이밍·채널 전략",
    memoryKind: "preference",
    memoryTitle: "의사결정자 프로필",
    required: true,
  },
  {
    id: "decisions",
    icon: "🎯",
    shortLabel: "검토 중 결정",
    question:
      "현재 가장 중요하게 검토 중인 의사결정 1~3개를 알려주세요. 시장 진출, 신제품, 가격, 채널 등 무엇이든.",
    placeholder:
      "예: 일본 2026 Q3 진출 GO/NO-GO, 캐시미어 신라인 가격대 검증, 무신사 JP vs ZOZOTOWN 채널 선택",
    example:
      "일본 진출 GO/NO-GO, 캐시미어 가격대 검증, 무신사 JP vs ZOZOTOWN 채널 선택",
    memoryKind: "decision",
    memoryTitle: "검토 중인 의사결정",
    required: true,
  },
  {
    id: "kpi",
    icon: "📈",
    shortLabel: "단기 KPI",
    question:
      "마지막입니다. 향후 3~6개월 KPI를 알려주세요. Briefing이 이 KPI 기준으로 매일 진척도를 추적합니다.",
    placeholder:
      "예: 일본 무신사 JP Q3 입점, 연매출 80억, 캐시미어 신라인 가을 출시",
    example: "일본 무신사 JP Q3 입점, 연매출 80억, 캐시미어 신라인 가을 출시",
    memoryKind: "decision",
    memoryTitle: "단기 KPI (3~6개월)",
    required: true,
  },
];

export const ONBOARDING_STEPS: OnboardingStep[] = RAW_STEPS.map((s, i) => ({
  ...s,
  index: i,
  total: RAW_STEPS.length,
}));

export function getStep(id: OnboardingStepId): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((s) => s.id === id);
}
