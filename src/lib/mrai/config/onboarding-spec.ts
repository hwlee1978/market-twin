/**
 * Onboarding interview spec — types + step catalog ONLY.
 *
 * Kept in its own file (no server imports) so client components can
 * import the step list and types without pulling `next/headers` into
 * the browser bundle. Server-side logic (DB reads/writes) lives in
 * onboarding.ts and re-exports these types.
 */

import type { MemoryKind } from "../memory";

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
  /**
   * Map of stepId -> stored answer body. Lets the chat UI render the
   * actual answer instead of a "(saved)" placeholder so the user can
   * review and edit Auto-Seed output (and revisit manual answers).
   */
  answers: Partial<Record<OnboardingStepId, string>>;
  currentStep: OnboardingStep | null;
}

const RAW_STEPS: Omit<OnboardingStep, "index" | "total">[] = [
  {
    id: "business",
    icon: "🏢",
    shortLabel: "사업 영역",
    question:
      "안녕하세요, Mr. AI입니다. 워크스페이스 세팅을 함께 진행하겠습니다.\n\n먼저 어떤 사업을 하고 계신가요? 회사 본업, 카테고리, 차별점까지 자유롭게 알려주실수록 Briefing 정확도가 올라갑니다.",
    placeholder: "예: 프리미엄 양가죽 아우터 D2C 브랜드. 메인 SKU는 캐시미어 100% 롱코트로, 30-40대 직장인 여성 타겟. 동대문 봉제 인프라 활용한 한국형 럭셔리 포지셔닝.",
    example: "프리미엄 양가죽 아우터 D2C 브랜드 — 30-40대 직장인 여성 타겟",
    memoryKind: "context",
    memoryTitle: "사업 영역",
    required: true,
  },
  {
    id: "scale",
    icon: "📊",
    shortLabel: "회사 규모",
    question:
      "회사 규모는 어느 정도인가요? 연 매출·영업이익·직원 수·설립 시기·성장 추이·투자 단계 등 알고 계신 만큼 자유롭게 적어주세요. 숫자가 많을수록 KPI 추적이 정밀해집니다.",
    placeholder: "예: 2025년 매출 50억 (YoY +35%), 영업이익 8억, 직원 22명, 2019년 설립, Pre-A 12억 투자 완료",
    example: "연매출 50억 (+35%), 영업이익 8억, 직원 22명, 2019년 설립",
    memoryKind: "context",
    memoryTitle: "회사 규모",
    required: false,
  },
  {
    id: "products",
    icon: "🎁",
    shortLabel: "주력 제품",
    question:
      "어떤 제품(또는 서비스)을 판매하고 계신가요? 베스트셀러 모델명, 가격대, 시그니처 특징, 카테고리별 비중까지 자세할수록 좋습니다.",
    placeholder:
      "예: ① 캐시미어 100% 롱코트 280만원 — 시그니처, FW 매출의 40% / ② 양가죽 자켓 180만원 — SS·FW 공통 / ③ 캐시미어 카디건 95만원 — 데일리 라인",
    example: "캐시미어 롱코트 280만원, 양가죽 자켓 180만원, 캐시미어 카디건 95만원",
    memoryKind: "fact",
    memoryTitle: "주력 SKU",
    required: true,
  },
  {
    id: "channels",
    icon: "🛒",
    shortLabel: "판매 채널",
    question:
      "어떤 판매 채널을 운영 중이신가요? 자사몰·온라인 플랫폼·오프라인 매장의 비중, 매장 수, 입점 채널, 채널별 매출 성과까지 자유롭게 적어주세요.",
    placeholder:
      "예: 자사몰 70% (월 5억) / 무신사 20% (월 1.5억) / 오프라인 더현대·신세계 강남 팝업 10%. 네이버 스마트스토어는 24년 철수.",
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
      "주요 경쟁사를 알려주세요. 직접 경쟁사(같은 카테고리), 카테고리 경쟁사(인접 영역), 소비자가 떠올리는 대안(consideration set)까지 계층별로 나눠 적으면 시뮬레이션·KG 정확도가 크게 올라갑니다.",
    placeholder:
      "예: ① 직접 — 어센틱브랜드(국내 1위, 가격 350만원대), 매그놀리아(일본 도쿄 진출) / ② 카테고리 — Acne Studios·Toteme(글로벌 컨템포러리) / ③ 소비자 인식 — 자라·코스(가성비 대안), 빈티지 시장(중고)",
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
      "임원님 본인의 직책과 배경, 그리고 Mr. AI가 매일 최우선으로 챙겨드릴 관심사를 알려주세요. 의사결정 스타일, 우선순위, 자주 묻는 질문 유형까지 적어주실수록 Briefing이 본인 톤에 맞게 작성됩니다.",
    placeholder:
      "예: 대표이사. 패션 MD 출신 (현대백화점 12년). 관심사 1순위 — 일본 진출 타이밍·채널 전략. 2순위 — 가격대 신규 라인 검증. 데이터 우선·결정 빠른 스타일.",
    example: "대표 / 일본 진출 타이밍·채널 전략 / 데이터 우선 결정 스타일",
    memoryKind: "preference",
    memoryTitle: "의사결정자 프로필",
    required: true,
  },
  {
    id: "decisions",
    icon: "🎯",
    shortLabel: "검토 중 결정",
    question:
      "현재 검토 중인 의사결정을 알려주세요. 시장 진출·신제품·가격·채널·인력·M&A·투자 등 무엇이든. 배경·딜레마·옵션·데드라인까지 자세히 적을수록 Mr. AI가 더 깊은 인사이트로 도와드립니다.",
    placeholder:
      "예: ① 일본 2026 Q3 진출 GO/NO-GO — 무신사 JP vs ZOZOTOWN 채널, 8월 결정 / ② 캐시미어 신라인 가격대 — 240만원 vs 280만원, FW 출시 전 결정 / ③ 시리즈A 30억 투자 — 3사 제안 검토 중",
    example: "일본 진출 GO/NO-GO, 신라인 가격 검증, 시리즈A 투자 결정",
    memoryKind: "decision",
    memoryTitle: "검토 중인 의사결정",
    required: true,
  },
  {
    id: "kpi",
    icon: "📈",
    shortLabel: "단기 KPI",
    question:
      "향후 3~6개월 KPI를 알려주세요. 정량 KPI(매출·이익·신규 매장·고객수 등) + 정성 KPI(채널 다각화·해외 진출 마일스톤·신라인 출시 등) 모두 환영합니다. Briefing이 매일 이 KPI 진척도를 추적합니다.",
    placeholder:
      "예: ① 2026 Q3 일본 무신사 JP 입점 (계약 7월·런칭 9월) / ② 2026 연매출 80억 (YoY +60%) / ③ 캐시미어 신라인 가을 출시 (8월 선공개) / ④ 자사몰 비중 75% 이상 유지 / ⑤ 시리즈A 마감 (8월)",
    example: "일본 무신사 JP Q3 입점, 연매출 80억, 신라인 가을 출시, 시리즈A 마감",
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
