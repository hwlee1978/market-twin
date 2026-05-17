# Phase F.3 design — MFDS (식약처) regulatory anchor

Drafted 2026-05-17 after v7 dramatic win (mean 72.0, p=0.0086). For the next
anchor source planned in §9.3 of business plan v4.5.

## Why MFDS

Phase F.0-F.1 anchors all answered "which markets does this brand reach
today?" (demand/presence signals). MFDS answers a different question:
**"which markets can this brand legally reach at all?"** (regulatory
gating signal).

For some K-Beauty / K-Food fixtures, sim currently picks markets the
product can't actually enter because LLM training data lacks ingredient-
level regulation differences between countries (EU vs ASEAN cosmetics
ingredient bans differ significantly). A regulatory anchor would push
those sims to reject-recall correct answers.

Expected lift target: v8 (KOTRA + MFDS) → **mean 76-80**, putting
HOLDOUT at gate ≥80.

## MFDS endpoints on data.go.kr (service group 1471000)

| Dataset ID | Korean name | Sim use case | Priority |
|---|---|---|---|
| 15111773 | 식품의약품안전처_화장품 규제정보 | 화장품 성분 × 금지/제한 국가 — K-Beauty 진출 가능 국가 자동 판별 | ★★★ |
| 15111774 | 식품의약품안전처_화장품 원료성분정보 | 성분 표준명/영문명/CAS — 어떤 성분이 K-Beauty 제품에 들어있는지 (위와 join) | ★★ |
| 15095680 | 식품의약품안전처_기능성화장품 보고품목정보 | functional skincare KR-인증 (Anua/COSRX 같은 functional brand 카테고리 grounding) | ★★ |
| 15043011 | 식품의약품안전처_건강기능식품 | health functional food KR-인증 (KGC 정관장 직접 매칭) | ★★ |
| 15020628 | 식품의약품안전처_화장품 관련 정보 | general cosmetic registry (legacy version of 15111773/15111774) | ★ |

Service URL base (per data.go.kr pattern):
```
https://apis.data.go.kr/1471000/{ServiceName}/{operationId}
```

KOTRA F.1-C lesson: URLs may need operationId twice (e.g. `/getXxxList/getXxxList`). Verify via 미리보기 sandbox post-registration.

## Per-fixture impact map

| Fixture | F.3 lift mechanism | Expected Δ |
|---|---|---|
| anua-heartleaf-toner | Centella asiatica 성분 EU 제한 여부 → rejectRecall on EU markets | +5-10 |
| cosrx-snail-mucin | snail mucin 성분 EU/CN 규제 + 동물성 원료 인증 → rejectRecall | +5-10 |
| boj-relief-sun | UV filter 성분 별 국가별 승인 차이 (avobenzone, octinoxate ban) → rejectRecall on MX/AU/HW | +10-15 |
| mediheal-maskpack (new) | sheet mask 성분 EU/CN 규제 + 한한령 narrative와 별개의 실제 규제 | +5-10 |
| laneige-lip-sleeping-mask (new) | lip product 색소·향료 EU/CN 규제 | +3-7 |
| kgc-everytime-redginseng | 홍삼 health functional food KR-인증 + 진출국 health-food 규제 (US FDA supplement, EU novel food) | +3-5 (이미 100점 영역) |
| bibigo-mandu | 식품 영업허가 + 진출국 import 인증 | +3-5 |
| binggrae-melona | 빙과 류 식품 인증 | +2-5 |
| lg-oled-tv | 가전 — MFDS 무관 | 0 (no impact) |
| jinro-chamisul | 주류 — MFDS 일부 (식약처보다 NTA 주관) | +0-3 |

Fixtures unlikely to benefit (gain ≈ 0): lg-oled, jinro (주류 라이선스), buldak (식품 일반).
**Net expected lift: +3-6 pt mean across 15 fixtures**, with K-Beauty/K-Wellness가 dominant 기여자.

## Module sketch (follows KOTRA F.1-C pattern)

File: `packages/shared/src/market-research/mfds.ts`

```typescript
const ENDPOINT_COSMETIC_REG =
  "https://apis.data.go.kr/1471000/CsmtcsRegulInfo/getCsmtcsRegulInfo"; // TBC after 미리보기
const ENDPOINT_COSMETIC_INGREDIENT =
  "https://apis.data.go.kr/1471000/CsmtcsRawMtrlCmpnInfo/getCsmtcsRawMtrlCmpnInfo";
const ENDPOINT_FUNCTIONAL_COSMETIC =
  "https://apis.data.go.kr/1471000/FnclmsCsmtcsRptItemInfo/getFnclmsCsmtcsRptItemInfo";
const ENDPOINT_HEALTH_FOOD =
  "https://apis.data.go.kr/1471000/HtfsRegistInfo/getHtfsRegistInfo";

export interface MfdsCountryRestriction {
  ingredientKo: string;
  ingredientEn: string;
  restrictionType: "banned" | "restricted" | "limited_use";
  countries: string[]; // ISO alpha-2
  maxConcentration?: number;
  notes?: string;
}

export interface MfdsBundle {
  fixtureSlug: string;
  restrictions: MfdsCountryRestriction[];
  functionalKrCertified: boolean;
  healthFoodKrCertified: boolean;
}

export async function fetchMfdsRegulatoryBundle(
  fixtureSlug: string,
  productKeywords: string[],
  apiKey?: string,
): Promise<MfdsBundle | null> { /* ... */ }

export function renderMfdsBlock(bundles: MfdsBundle[], opts): string {
  // emits something like:
  //   === MFDS Regulatory anchor ===
  //   anua-heartleaf-toner ingredients: Centella asiatica extract, etc.
  //     CN: limited_use (max 1.0%) — partial restriction
  //     EU: banned for leave-on products — REJECT signal
  //     US: no restriction — OK
  //     JP: notification required — OK with paperwork
  //   ===
}

export async function buildMfdsAnchor(...): Promise<{ block: string; bundles: MfdsBundle[] }>
```

Stricter filter (same lesson as KOTRA): if no relevant restriction found for a candidate country, omit that country entirely from the block — empty signal beats noise.

## Integration plan

1. **User registers 4 MFDS APIs on data.go.kr** (10-15 min each via 활용신청):
   - 15111773 화장품 규제정보 (★★★)
   - 15111774 화장품 원료성분정보 (★★)
   - 15095680 기능성화장품 (★★)
   - 15043011 건강기능식품 (★★)

2. **User shares 활용신청 상세 screenshots** so we can confirm the exact End Point URLs (per KOTRA lesson — bare End Point column was incomplete).

3. **Build smoke** (`scripts/smoke-mfds.ts`) for each endpoint independently before wiring into orchestrator.

4. **Module + orchestrator integration** (`packages/shared/src/market-research/mfds.ts` + orchestrator prefetch). Append to `tradeAnchorBlock` like the other Phase F anchors.

5. **n=15 v8 sim** post-integration (5 new fixtures + 10 existing) → benchmark `--compare-latest` for paired t-test vs v7.

## Expected output

v9 (v7 baseline + MFDS) measurement:
- Mean composite **76-80** (vs v7 72.0)
- HOLDOUT n ≥ 7 expected to brush gate ≥80
- per-fixture: K-Beauty (Anua/COSRX/BoJ/Mediheal/Laneige) +5-15, K-Wellness (KGC) +3-5, K-Food (Bibigo/Melona/CJ/오리온/빼빼로) +2-5, neutral (LG/Jinro/Buldak) ±0

If achieved → **Phase F.1 close** + claim 80 gate sight; transitions to Phase F.2 (per-LLM weighting) + challenge data integration phase.

## Cost

- Smoke + module dev: 1-2 days
- v8/v9 sim: ~$120 (15 fixtures × ~$8/fixture)
- API quota: 10K/day free tier, well under our 15-20 calls per ensemble

## Rejection criteria (what would make us skip MFDS)

- If MFDS cosmetic regulation data turns out to be Korea-only (only KR restrictions, no per-country export ban data) → low leverage, skip in favor of EU Cosing or PEW (international cosmetic regulation DBs)
- If endpoints require XML in a complex schema beyond simple field mapping → defer until other Phase F.2 anchors land
- If smoke shows <30% fixture coverage (e.g. only 3 of 15 fixtures get any MFDS signal) → repackage as opt-in per category, not as a global anchor

## Sources cited

- [MFDS 화장품 규제정보 (15111773)](https://www.data.go.kr/data/15111773/openapi.do)
- [MFDS 화장품 원료성분정보 (15111774)](https://www.data.go.kr/data/15111774/openapi.do)
- [MFDS 기능성화장품 (15095680)](https://www.data.go.kr/data/15095680/openapi.do)
- [MFDS 건강기능식품 (15043011)](https://www.data.go.kr/data/15043011/openapi.do)
- [식의약 데이터 포털](https://data.mfds.go.kr/) (alternate source, may need separate registration)
