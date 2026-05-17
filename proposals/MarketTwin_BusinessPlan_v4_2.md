# AI Market Twin · 사업계획서 v4.2

**2026 AI+ OpenData 챌린지 (시장진출 전략 추천 부문)**

| | |
|---|---|
| 과제번호 | 20457281 |
| 신청기업 | 주식회사 미스터에이아이 (Market Twin) |
| 대표자 | Chris Lee |
| 사업자번호 | 693-87-03907 |
| 설립일 | 2026년 5월 |
| 연락처 | contact@markettwin.ai |
| 제출일 | 2026년 5월 (v4.2: 2026-05-16) |
| 변경 사항 | §3 4-tier preset 업데이트, §4.1 multi-LLM 구성 (DeepSeek), §4.4 정확도 검증 인프라 신규, §5.3 외부 데이터 anchor 계획, §9 Phase E 6주 일정 |

---

## 1. 사업 개요 (Executive Summary)

### 1.1 사업의 핵심

> 한국 수출기업의 1년 생존율은 49.2%, 5년 생존율은 16.3%에 불과합니다. 절반이 첫 해를 넘기지 못하고, 6명 중 1명만이 5년을 생존합니다. 본질적 원인은 "현지 소비자 사전 검증 부재"이며, 기존 시장조사는 약 13억 원·6개월이 소요되어 중소수출기업에게는 사실상 접근 불가능합니다.

AI Market Twin은 이 문제를 **"24개국 공식 정부 OpenData에 그라운딩된 AI 가상 소비자 페르소나 시뮬레이션"** 으로 해결합니다. 멀티 LLM(Anthropic Claude · OpenAI GPT · DeepSeek) 앙상블 기반 1인칭 보이스 소비자 반응 생성을 통해 7~22분 내, 40만~400만 원 비용으로 시장 검증을 완료합니다.

기존 방식 대비 **1,000배 이상 빠르고, 300배 이상 저렴한** "중소수출기업 친화적 시장진출 의사결정 인프라"를 제공합니다.

### 1.2 사업 비전 및 미션

- **Vision**: K-product가 데이터 기반으로 글로벌 진출을 결정하는 세상
- **Mission**: 정부 공식 OpenData × AI 페르소나로, 중소수출기업의 해외 진출 의사결정 비용·시간·실패 리스크를 1/100로 축소
- **Tagline**: "K-product 해외 진출 성공 확률을 AI가 예측하다"

### 1.3 주요 추진 내용 (v4.2 업데이트)

- 24개국 정부 공식 OpenData (KOSIS, 미국 BLS, 일본 e-Stat 등 27개 통계 시드) 라이브 그라운딩 시스템 구축 **(완료)**
- 멀티 LLM 앙상블 기반 AI 페르소나 합성 파이프라인 (Claude / OpenAI / DeepSeek round-robin) 구축 **(완료)**
- 3-Layer Voice Sanitizer (locale · brand · auto-translation slip 차단) 구현 **(완료)**
- 뷰티 카테고리 E2E 검증 (COSRX 사례) 완료, **K-Food/K-Beauty/K-Wellness/K-Alcohol/Appliances 5개 카테고리 10개 제품으로 확장 검증 완료 (2026-05-16, v4.2 NEW)**
- **자동 정확도 검증 인프라 (validation/ground-truth + benchmark.ts) 구축 완료 (v4.2 NEW)**
- **Provenance-tagged calibration framework — magic number 추적 시스템 완료 (v4.2 NEW)**
- 본 챌린지를 통해 한국유통연구원·중소벤처기업진흥공단 보유 수출·유통 데이터와 결합하여 시장진출 추천 정확도 고도화

---

## 2. 문제 정의 (Problem Statement)

*(v4.1과 동일 — 수출기업 생존 위기 / 실패 사례 / 시장 검증 접근 불가 / 중진공·한유원 정책 과제. 본 문서에서는 생략.)*

---

## 3. 솔루션 — AI Market Twin

### 3.1 솔루션 개요

AI Market Twin은 **7~22분 내, 40만~400만 원 비용으로 K-product 해외 진출 성공 확률을 예측**하는 AI SaaS 플랫폼입니다. 24개국 정부 공식 OpenData에 그라운딩된 가상 소비자 AI 페르소나가 1인칭 보이스로 제품에 대한 반응을 시뮬레이션합니다.

멀티 LLM(Claude · OpenAI · DeepSeek) 앙상블, 3-Layer Voice Sanitizer, 시각 분석(Multimodal LLM), **자동 정확도 검증 파이프라인(2026-05-16 NEW)**, **provenance-tagged calibration framework(2026-05-15 NEW)** 를 통합한 의사결정 인프라입니다. 특히 DeepSeek 등 오픈소스 기반 LLM 활용으로 단일 벤더 의존성을 제거하고, 추론 비용을 기존 대비 1/5~1/10 수준으로 최적화합니다.

### 3.2 핵심 차별화 요소 (5가지, v4.2 NEW 1건)

#### ① AI 페르소나 1인칭 보이스
실제 소비자처럼 사고하는 AI 페르소나가 1인칭으로 직접 말합니다.

> 예: "이 제품 가격이 우리 동네 슈퍼마켓 기준으로는 약간 비싼 편이에요. 그래도 한국 화장품이라서 친구한테 추천하고 싶어요." — 30대 여성, 도쿄 거주, 회사원

#### ② 24개국 정부 공식 통계 그라운딩 (Live DB)
KOSIS(한국), BLS(미국), e-Stat(일본) 등 각국 공식 OpenData를 27개 통계 시드로 사전 적용. 페르소나의 소득·문화·소비 패턴이 임의 추정이 아닌 실측 데이터로 검증됩니다.

#### ③ 시각 분석 (Multimodal LLM)
제품 이미지 업로드 시 패키지·라벨·시각 모티프 분석으로 신뢰도 리스크를 자동 감지합니다.

#### ④ 페르소나 라이브러리 자산화 (Data Moat)
워크스페이스별 페르소나 재사용 풀로 "고객이 늘수록 더 빠르고 더 정확해지는" 데이터 모트.

#### ⑤ **자동 정확도 검증 + Provenance Calibration (v4.2 NEW)**
ground-truth 데이터셋과 통계 검정(bootstrap CI, paired t-test, FDR) 기반 자동 채점 파이프라인. 모든 시뮬레이션 calibration 상수에 **provenance 태그(DATA_DERIVED / DOMAIN_RULE / TUNING_ANCHOR)** 및 holdout 검증 의무 부여. **(§4.4 상세)**

### 3.3 4단계 티어드 시뮬레이션 시스템 (v4.2 업데이트)

| 티어 | 페르소나 수 | 소요 시간 | LLM 구성 | 용도 |
|---|---|---|---|---|
| **초기검증** | 200명 | 약 7분 | Anthropic 단일 | 초기 가설 검증 |
| **검증분석** | 1,200명 (6 sims × 200) | 약 12분 | **Claude + OpenAI + DeepSeek round-robin (v4.2 NEW)** | 기본 의사결정 |
| **검증분석+** | 3,000명 (15 sims × 200) | 약 12~17분 | 멀티 LLM + 시각 | 정밀 분석 + 이미지 평가 |
| **심층분석** | 5,000명 (25 sims × 200) | 약 17~22분 | 멀티 LLM 앙상블 | 엔터프라이즈 시장진출 결정 |

> **v4.2 핵심 변경**: 검증분석(Decision) 티어가 **anthropic single → 3-provider round-robin** 으로 업그레이드. 자체 정확도 벤치마크(v1, 2026-05-16)에서 single-LLM이 K-product 추천 시 CN/VN을 일관 과대평가하는 LLM bias가 확인되어 즉시 fix 적용. 6 sims × 3 providers (2-2-2 균등 분배)로 model prior가 cross-cancel.

> 기존 시장조사는 6개월·약 13억 원이 소요되었으나, Market Twin의 모든 티어는 22분 이내에 완료됩니다.

---

## 4. 핵심 기술 구현 방안 *(v4.2 대폭 업데이트)*

### 4.1 풀스택 + 멀티 LLM 아키텍처

**프론트엔드 + 호스팅**
- Next.js 16 App Router (RSC + Server Actions)
- Vercel 프로덕션 배포 (markettwin.ai)
- 다국어 지원 (한국어 / 영어)
- 실시간 진행: SSE + EnsembleProgress 컴포넌트

**데이터 레이어**
- Supabase Postgres (Workspace RLS 격리)
- Originating country first-class 컬럼 (수출국 기반 시뮬레이션)
- Shared Pooler 연결 (Vercel Edge 호환)
- 30일 read-only 공유 토큰 (보안)
- **Cloud Run worker 분리 배포 — 시뮬 핵심 로직(페르소나 풀, prompts, grounding)이 worker에서 실행. Vercel에서 dispatch + fallback inline (v4.2 NEW)**

**LLM 프록시 패턴** *(v4.2 업데이트)*
- 통합 인터페이스: Anthropic / OpenAI / DeepSeek / Gemini / xAI (5-vendor, 단일 추상화)
- 단계별 라우팅 (env 구성 가능):
  - **Claude Sonnet 4.6** → 페르소나 합성 (1인칭 voice quality 보존, Haiku 대비 voice differentiation 검증 완료 2026-05-02)
  - **Claude Haiku 4.5** → Countries + Pricing 구조화 JSON
  - **Claude Sonnet / GPT-4o / DeepSeek-V3** → 내러티브 + 앙상블 synthesis (round-robin)
  - **Gemini** → deep_pro tier 한정 (현재 503 spike 시 Anthropic 자동 failover)
- 벤더 락인 회피 + 가격 인상 리스크 헤지

**시뮬레이션 파이프라인**
- Wizard → Persona generation → Reaction → Aggregation → **Country scoring (with Phase A marketSize 30% weight) → Pricing → Synthesis → Critique → Voice sanitizer**
- Aggregation 압축 단계로 다운스트림 LLM 토큰 절감
- EnsembleProgress: 멀티 LLM 병렬 실행 + 진행 추적
- 시뮬-스케일 → 앙상블-스케일 narrative rewriter

**Provenance-tagged Calibration Framework (v4.2 NEW)**

모든 시뮬레이션 magic number는 `packages/shared/src/simulation/calibration/` 에 격리되어 3-tier provenance 태그를 의무화:

- `DATA_DERIVED`: 외부 데이터셋 출처 (World Bank, OECD, Statista, IR 공시 등)
- `DOMAIN_RULE`: 비즈니스 판단 (regulatory blocker 룰 등)
- `TUNING_ANCHOR`: 시뮬 결과 관찰 기반 — `informedByRuns`, `holdoutProducts`, `reviewBy` 의무 선언

핵심 anchor:
```typescript
// score-weights.ts — Phase A marketSize 30% weight
FINAL_SCORE_WEIGHTS = { marketSize: 0.3, culturalFit: 0.15, ... }
// holdoutProducts: ["jinro-chamisul"]
// reviewBy: 2026-08-15

// income-bracket-slack.ts — Phase B v2 page bracket validation
// competition-rubric.ts — segment-differentiation bands
// ltv-multipliers.ts — category-specific repeat rates
// profession-caps.ts — diet-restricted persona cap=2/sim
```

이 framework가 calibration drift 방지 + 모든 magic number가 holdout 제품에 대해 자동 검증.

### 4.2 품질 방어 시스템 — 3-Layer Voice Sanitizer

LLM 페르소나 보이스에서 발견되는 3가지 슬립 패턴을 프롬프트와 런타임 sanitizer 양면으로 차단합니다.

**Slip Pattern 1 — 문화 간 보이스 누출**
- 일본 페르소나에서 영문 응답 또는 한국식 표현 혼입
- Defense: Locale-filter + 프롬프트 ko/ja anchor + 런타임 감지 → 재생성

**Slip Pattern 2 — Brand-name bias**
- 페르소나가 자발적으로 브랜드명(Olive Young, COSRX 등) 호명
- Defense: 28-브랜드 사전 cross-check, 자연 멘션만 통과

**Slip Pattern 3 — Auto-translation 감지**
- 1인칭 페르소나가 기계번역 톤으로 떨어지는 패턴
- Defense: 직역체 패턴 감지 휴리스틱 → 페르소나 재합성

### 4.3 비용 엔지니어링

- 단계별 LLM 라우팅으로 비용 최적화 — 작업 특성에 맞는 모델 선택
- **DeepSeek 오픈소스 모델 활용**으로 추론 비용 1/5~1/10 수준 달성 (GPT-4 대비)
- Aggregation 압축 단계로 다운스트림 토큰 사용량 절감
- 페르소나 재사용 풀 도입으로 한계비용 감소 메커니즘 구현
- Admin billing dashboard로 시뮬별 토큰 추적 및 비용 가시화
- 멀티 벤더 전략으로 단일 LLM 가격 인상 리스크 헤지
- **Per-tier budget cents (Kill switch) — TIER_BUDGET_CENTS로 runaway ensemble 방지 (v4.2 NEW)**

### 4.4 정확도 검증 인프라 *(v4.2 NEW — 챌린지 핵심 보강)*

기존 v4.1까지는 수동 검증 (제품별 5점 만점 채점)에 의존. v4.2에서 **자동 채점 파이프라인 + 통계 검정 layer** 신규 구축.

#### 4.4.1 Ground Truth 데이터셋 (`validation/ground-truth/*.json`)

10개 K-product 표준 검증 셋 (5개 카테고리 × 4개 가격대):

| 카테고리 | 제품 | 가격 | Split |
|---|---|---|---|
| K-Food | 삼양 불닭볶음면, 농심 신라면, 비비고 만두, 빙그레 메로나 | $1.5-8 | TUNING (4) |
| K-Beauty | COSRX, Anua Heartleaf Toner, BoJ Relief Sun | $18-20 | TUNING 2 / HOLDOUT 1 |
| K-Wellness | 정관장 홍삼정 에브리타임 | $30 | TUNING |
| K-Alcohol | 진로 참이슬 | $2.5 | HOLDOUT |
| Appliances | LG OLED TV C-series | $1,500 | HOLDOUT |

**스키마 핵심 차별점:**
- `metric`이 enum (revenue_rank_overseas, market_share_pct, growth_trajectory 등 9종) — "매출 1위 vs 점유율 1위 vs 성장률 1위" 혼동 방지
- 각 `evidence` row마다 `asOf` 시점 + `source.confidence` 등급 + `source.type` (IR > trade_data > market_research > ...)
- `leakageRisk.inTrainingData` flag — LLM이 학습 데이터로 정답 알 가능성 명시

#### 4.4.2 자동 채점 5-Metric

| Metric | 가중 | 정의 |
|---|---|---|
| Top-3 hit rate | 30% | sim Top-3 ∩ truth Top-3 / 3 |
| Spearman rank correlation | 25% | sim rank vs truth rank |
| Reject recall | 20% | truth.rejectMarkets 중 sim NO-GO 비율 |
| Confidence calibration | 15% | STRONG consensus ↔ 적중률 |
| Trend match | 10% | growth_trajectory 일치 |
| → **Composite accuracy** | | weighted sum, 0-100 |

#### 4.4.3 통계 검정 Layer (`packages/shared/src/validation/stats.ts`)

- **Bootstrap CI**: 95% 신뢰구간 (mulberry32 seeded, B=2000)
- **Paired t-test**: 빌드 A vs B 정확도 차이 통계 검정
- **Benjamini-Hochberg FDR**: 다중 비교 보정
- **Spearman ρ**: tie-averaging 지원
- **Power analysis**: 검출 가능 effect size 계산

#### 4.4.4 Failure Mode Classifier

4가지 실패 패턴 자동 분류:
- `confident_wrong`: STRONG consensus + truth와 불일치 → leakage 의심 / systemic bias
- `weak_correct`: WEAK consensus + 우연 적중 → 신뢰 불가
- `persistent_miss`: 동일 country를 3+ 제품에서 미스 → 구조적 결함
- `drift_regression`: 직전 commit 대비 정확도 하락

#### 4.4.5 Benchmark v1 결과 (2026-05-16)

10-product 자동 채점 결과:
- **Mean composite: 54.0 / 100** (95% CI [41.3, 66.6])
- TUNING 50.3 / HOLDOUT 62.6 — overfit 신호 직접 미발견 (n=3 한계)

자동 발견한 4개 신규 결함 → Phase E 로드맵 (§9)에서 6주 closure 계획:
- **결함 #9**: Single-LLM Anthropic CN/VN bias → **2026-05-16 fix shipped** (decision tier 6 sims × 3 providers round-robin)
- **결함 #10**: top3 vs top1 ranking mismatch → **2026-05-16 fix shipped** (Phase E winner picker: mean rank, tie-break by mean score)
- **결함 #11**: description echo bias 재발 → Phase E Week 3
- **결함 #12**: STRONG consensus ≠ accuracy → Phase E Week 3

#### 4.4.6 CI Gating (`.github/workflows/validation.yml`)

- 매 PR: schema audit + calibration-anchor↔holdout split sync 검증 (cheap, no DB)
- Manual dispatch: full benchmark scoring (DB 필요)
- Critical 미스매치 시 build fail

---

## 5. OpenData 활용 계획 *(v4.2 §5.3 외부 anchor 계획 신규)*

### 5.1 현재 활용 중인 OpenData (27개 통계 시드)

*(v4.1과 동일 — KOSIS, BLS, e-Stat, ONS, GSO 등 24개국 정부 통계. 2026-05-01 Phase 1 라이브.)*

### 5.2 OpenData 활용 방법론 (Statistical Grounding)

*(v4.1과 동일 — 4-step: 통계 시드 추출 → 페르소나 슬롯 정의 → 페르소나 합성 시 통계 검증 → Annual Refresh Policy.)*

### 5.3 본 챌린지를 통한 OpenData 활용 확장 계획 *(v4.2 업데이트)*

#### 확장 1: 한국 수출입 데이터 통합
- 관세청 수출입 통계 (HSCode별)
- 국가별·품목별 수출 추이
- → 페르소나에 "한국 제품 소비 경험" 변수 추가

#### 확장 2: 산업통상자원부 데이터 활용
- 한국 브랜드 해외 진출 사례 데이터
- FTA 발효 국가별 관세·규제 정보
- → 시장진출 추천에 규제 리스크 변수 반영

#### 확장 3: KOTRA 해외시장조사 데이터
- KOTRA 해외 무역관 시장 보고서 (공개 자료)
- 국가별 진출 성공·실패 사례 DB
- → Reference Case 학습 데이터로 활용

#### **확장 4 (v4.2 NEW): UN Comtrade + IR/DART External Anchor 통합**

Phase E Week 4-5 (§9)에서 구현:
- **UN Comtrade API** (무료, HSCode-keyed): "한국이 2024년 X 카테고리를 Y국에 $Z 수출" → country scoring prompt에 prior 주입
- **DART(전자공시) 선별 스크래핑**: Top 50 K-export 제품의 해외 매출 분포 사전 추출 → "이 카테고리의 해외 매출 분포는 US 40% / JP 25% / ..." prior 주입
- **목적**: Tavily/Sonar 검색이 못 잡는 한국어 IR 공시 + 무역 데이터를 시뮬에 직접 anchoring → 결함 #1 (EU/CN under-rating), #7 (CN mass-average), #9 (LLM CN bias) 근본 해결

---

## 6. 한유원·중진공 데이터 결합 방안

*(v4.1과 동일 — KORIA 유통 행태 + KOSME 중소수출기업 사례 → 4-Layer Recommendation Engine. 본 문서에서는 생략.)*

---

## 7. 시장 분석

*(v4.1과 동일 — AI 마켓 리서치 시장 $7.97B (2025) → $16.80B (2030), CAGR 16.1%. K-Beauty/K-Food 약 31조 원, K-Content 16조 원+.)*

---

## 8. 비즈니스 모델

*(v4.1과 동일 — SaaS 구독 / 엔터프라이즈 컨설팅 / API 라이선싱 3-stream. 가격은 plan_ladder_state 메모리 참조.)*

---

## 9. 추진 일정 및 마일스톤 *(v4.2 Phase E 통합)*

### 9.1 본 챌린지 6개월 일정 (선정 시) — v4.2 업데이트

| 월차 | 단계 | 산출물 | Phase E 통합 |
|---|---|---|---|
| M1 | 기획·데이터 분석 | 한유원·중진공 데이터 구조 분석, 통합 스키마 설계 | **Phase E Week 1-2 병행**: ground-truth evidence backfill (10 fixture × 5+ rank rows) |
| M2 | 데이터 통합 | API 연동, ETL, 비식별화 | **Phase E Week 3**: 결함 #11 description sanitizer + #12 confidence UI |
| M3 | 추천 엔진 개발 | 4-Layer 추천 엔진 프로토타입 | **Phase E Week 4-5**: UN Comtrade + IR/DART external anchor 통합 |
| M4 | 페르소나 합성 고도화 | KORIA 채널 데이터 반영, 8개 카테고리 확장 | **Phase E Week 6**: Final benchmark — composite ≥ 80 gate |
| M5 | 실증 테스트 | KOSME 등록 중소수출기업 10개사 베타 테스트 | KORIA·KOSME 데이터 반영 후 재검증 — 80% 정확도 KPI 확인 |
| M6 | 성과 보고 | 최종 보고서·데모데이·만족도 조사 | 정확도·만족도·실증 사례 정리 |

### 9.2 KPI 및 성과 지표 *(v4.2 업데이트)*

**정량 지표:**
- 베타 테스트 참여 중소수출기업: 10개사 이상
- 시뮬레이션 실행 횟수: 100회 이상
- **추천 정확도 (auto-composite): 80% 이상** (현재 baseline 54%, Phase E 6주 closure)
- 기존 시장조사 대비 비용 절감: 90% 이상
- 기존 시장조사 대비 시간 단축: 95% 이상
- **(v4.2 NEW) Calibration governance: 100% of TUNING_ANCHOR has holdoutProducts declared**
- **(v4.2 NEW) Zero confident_wrong findings on benchmark**

**정성 지표:**
- KORIA·KOSME 데이터 통합 시스템 구축 완료
- 4-Layer 추천 엔진 프로덕션 배포
- 우수 베타 사례 3건 확보

### 9.3 Phase E 6주 닫는 로드맵 *(v4.2 NEW)*

| 주 | 활동 | 게이트 |
|---|---|---|
| 1 ✅ | 결함 #9 + #10 fix shipped (decision multi-LLM, mean rank winner) | composite ≥ 60 |
| 2 | Ground truth evidence backfill (rankCorrelation/rejectRecall coverage 80%+) | ≥ 70 |
| 3 | 결함 #11 description sanitizer + #12 confidence UI | ≥ 73 |
| 4-5 | UN Comtrade + IR/DART external anchor 주입 | ≥ 78 |
| 6 | Final 10-product benchmark | **≥ 80** |

비용: ~$320-620 (rerun depth 의존).

---

## 10. 기대 효과

*(v4.1과 동일 — Direct/Policy/Industry/Social impact. 본 문서에서는 생략.)*

---

## 11. 팀 및 자원

*(v4.1과 동일 — Chris Lee CEO/CTO, 자문단, 채용 계획. 인프라: Next.js + Supabase + 멀티 LLM + GCP/AWS Activate. 인증: ISMS-P 2027 Q2 / ISO 27001 2027 Q3. AI 책임성: NIST/EU AI Act/OECD/한국 AI 윤리.)*

---

## 12. 결론

> AI Market Twin은 한국 수출기업의 글로벌 진출 실패율 84%라는 국가적 과제에, AI·OpenData 융합으로 답하는 솔루션입니다. 본 챌린지를 통해 한유원·중진공이 보유한 유통·수출 데이터와 결합함으로써, 단순한 AI 시뮬레이션을 넘어 "한국 정부 데이터 기반 글로벌 진출 추천 인프라"로 발전할 수 있습니다.

### 12.1 본 챌린지 적합성 요약 *(v4.2 업데이트)*

| 영역 | 내용 |
|---|---|
| AI 기술 | 멀티 LLM 앙상블 (Claude·OpenAI·DeepSeek), 3-layer sanitizer, 멀티모달 분석, **자동 정확도 검증 파이프라인 (v4.2 NEW)** |
| OpenData 활용 | 24개국 정부 통계 27 시드 라이브 적용 **+ Comtrade/IR external anchor 통합 계획 (v4.2 NEW)** |
| 시장진출 전략 추천 | 4-Layer 추천 엔진으로 우선순위 진출국 Top 3 + 전략 제시 |
| 한유원·중진공 데이터 결합 | 유통 채널 + 중소수출기업 사례 통합 추천 엔진 구축 계획 |
| 중소수출기업 직접 가치 | 기존 약 13억 원·6개월 → 40만~400만 원·22분 이내 (300배 이상 절감) |
| 실증 가능성 | Phase 1 라이브, COSRX E2E 검증 완료, **10-product benchmark v1 (mean 54%) → Phase E 6주 80% closure (v4.2 NEW)** |
| **검증 거버넌스 (v4.2 NEW)** | **Provenance-tagged calibration + holdout split + 통계 검정 (bootstrap CI/paired t-test/FDR) + failure-mode classifier** |

### 12.2 본 사업의 의의

Market Twin은 K-product 글로벌 진출의 "의사결정 인프라"가 되는 것을 목표로 합니다. 본 챌린지는 우리의 솔루션이 정부 보유 데이터와 결합하여 단순한 민간 SaaS를 넘어 "K-수출 정책 인프라"로 발돋움할 결정적 기회입니다.

선정 시 6개월 내 한유원·중진공 데이터 통합 추천 엔진을 완성하고, 10개 이상 중소수출기업의 실제 진출 의사결정을 지원하여 실증 사례를 확보하겠습니다. 또한 **Phase E 6주 정확도 closure를 통해 80% auto-composite KPI를 달성**하여, "주장된 정확도"가 아닌 "측정·검증된 정확도"로 정책 기관 신뢰를 확보합니다.

---

**「 데이터로 K-product의 다음 시장을 추천하다 」**
AI Market Twin × 한유원 × 중진공
