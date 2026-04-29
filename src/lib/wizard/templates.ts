/**
 * Pre-filled wizard templates — let new users start from a realistic
 * baseline instead of staring at an empty form. Each template covers
 * one of the wizard categories with a credible product description,
 * price, target countries, and objective.
 *
 * Used by ProjectWizard step 1: clicking a template chip patches
 * every field at once; user can then edit and proceed.
 */

import type { Objective, FormState } from "./types";

// Subset of the wizard form state the templates fill in. competitorUrls
// stays empty; users typically don't want a default there.
type TemplatePatch = Pick<
  FormState,
  | "name"
  | "productName"
  | "category"
  | "description"
  | "basePrice"
  | "currency"
  | "objective"
  | "countries"
>;

export interface WizardTemplate {
  id: string;
  i18nKey: string;       // matches messages key under project.wizard.templates.*
  emoji: string;
  patch: TemplatePatch;
}

const tpl = (
  id: string,
  emoji: string,
  patch: Omit<TemplatePatch, "currency"> & { currency?: string },
): WizardTemplate => ({
  id,
  emoji,
  i18nKey: id,
  patch: { currency: "USD", ...patch } as TemplatePatch,
});

export const WIZARD_TEMPLATES: WizardTemplate[] = [
  tpl("kbeauty", "🌸", {
    name: "글로벌 K-뷰티 라인 출시",
    productName: "Aurora Glow Serum",
    category: "beauty",
    description:
      "비타민 C + 나이아신아마이드 기반 프리미엄 미백·항산화 세럼. 30대 직장인 여성을 핵심 타겟으로 하며, 미국·일본·동남아 시장 동시 진출을 검토 중입니다.",
    basePrice: "48",
    objective: "expansion" as Objective,
    countries: ["KR", "JP", "US", "SG"],
  }),
  tpl("premiumFood", "🍱", {
    name: "프리미엄 김치 D2C 출시",
    productName: "Heritage Kimchi Original",
    category: "food",
    description:
      "전통 발효 방식 4주 숙성 프리미엄 김치. 비건·글루텐프리·MSG 무첨가. 30~50대 가족 타겟. D2C 정기배송 모델 검토 중.",
    basePrice: "24",
    objective: "conversion" as Objective,
    countries: ["KR", "US", "GB", "AU"],
  }),
  tpl("electronics", "🎧", {
    name: "프리미엄 무선 이어버드 글로벌 출시",
    productName: "AcousticPro Buds X1",
    category: "electronics",
    description:
      "액티브 노이즈 캔슬링 무선 이어버드. 8시간 배터리(28h with case), IPX5 방수, 공간 음향. 통근자·재택근무자 타겟. 매트 블랙·세이지·아이보리 3색.",
    basePrice: "149",
    objective: "conversion" as Objective,
    countries: ["KR", "JP", "US"],
  }),
  tpl("modestFashion", "🌙", {
    name: "MENA 모데스트 패션 라인",
    productName: "Lumière Modest Collection",
    category: "fashion",
    description:
      "고품질 실키 블렌드 소재 모데스트 의류 라인. 라마단·이드 시즌 출시 검토. 25~40대 무슬림 여성 타겟.",
    basePrice: "85",
    objective: "awareness" as Objective,
    countries: ["AE", "SA", "MY", "ID"],
  }),
  tpl("supplement", "💊", {
    name: "K-홍삼 해외 수출",
    productName: "GoldenRoot Premium Ginseng",
    category: "health",
    description:
      "6년근 한국홍삼 + 비건 캡슐 형태의 프리미엄 면역 건강기능식품. 헬스 컨셔스 30~50대 타겟. 글로벌 헬스 마켓 진출 검토.",
    basePrice: "79",
    objective: "expansion" as Objective,
    countries: ["US", "GB", "DE", "JP"],
  }),
  tpl("saas", "💼", {
    name: "B2B AI 마케팅 SaaS 출시",
    productName: "InsightPilot CRM",
    category: "saas",
    description:
      "영업팀을 위한 AI 자동 인사이트·딜 우선순위화 SaaS. 기존 CRM(Salesforce·HubSpot) 통합. SMB·미드마켓 영업팀 타겟.",
    basePrice: "49",
    objective: "conversion" as Objective,
    countries: ["US", "GB", "NL", "SG"],
  }),
];
