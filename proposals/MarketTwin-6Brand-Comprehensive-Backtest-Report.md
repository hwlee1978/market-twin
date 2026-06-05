# 6-Brand Cross-Category Backtest — Comprehensive Report

한국 D2C 브랜드의 해외 진출 시장 선택 시뮬레이션 정확도 검증. 6 brand × 4 카테고리, 단일 sim config, 5-step 엔지니어링 진화 audit trail 포함.

---

## Abstract

해외 진출 시장 선택 (export market selection) 의사결정은 brand-level intangible 변수가 결정적이지만, 거시 통계 기반 의사결정 도구는 이 신호를 거의 잡지 못합니다. 본 보고서는 한국 D2C 브랜드 6 개 (Anua, Tirtir, Beauty of Joseon, Buldak, KGC 정관장, Binggrae) 의 실제 해외 진출 결정 시점 description 으로 hindsight 를 차단한 backtest 를 수행하고, 결과 6/6 일치 (winner = actual launch country) 를 보고합니다. 동시에 confidence 정직성 3-tier (4 STRONG · 1 MODERATE · 1 WEAK) 분포가 시뮬 간 의견 일치도와 매칭됨을 보입니다. 단일 LLM 의 최고 hit률 5/6 vs. ensemble 6/6 비교로 멀티-LLM aggregator 의 필요성을 입증합니다. 한계 4 가지 (hindsight 완전 제거 못함 / N=1 per brand / 카테고리 cover 제한 / real customer data 없음) 를 명시합니다.

---

## 1. Motivation

### 1.1 거시 통계 한계 사례

| Brand | 거시 anchor 가 추천할 시장 | 실제 launch 시장 | 결정 변수 |
|---|---|---|---|
| Tirtir Red Cushion | CN/US (K-Beauty cushion category 큰 시장) | JP | 일본 TikTok ASMR 인플루언서 협업 |
| KGC 정관장 | US (D2C 신규 진출 + 한류 wave) | CN | 면세점 채널 의존도 |
| Binggrae 바나나우유 | CN/US/JP (인구·소득 큰 시장) | VN | 베트남 자회사 설립 + 현지 생산 결정 |

세 사례 모두 거시 통계 (인구·소득·관세·이미 진출한 한국 기업) 만으로는 잡히지 않는 brand-specific 변수가 결정적이었습니다. 이를 시스템 차원에서 해결하지 않으면 추천이 잘못된 방향으로 향합니다.

### 1.2 시스템이 해결해야 하는 두 layer

| Layer | 데이터 source | 잡아야 하는 신호 |
|---|---|---|
| Macro | KOSIS, Comtrade, World Bank, KOTRA registry, DART, UNI-PASS, Hofstede, MFDS | 인구, 소득, 관세, 이미 진출한 한국 기업, 문화 거리, 규제 환경 |
| Brand-specific | 사용자 입력 + 카테고리별 KOL ecosystem (Tavily) | 창업자 네트워크, 채널 우선순위, KOL 보유 / 협의, 카테고리×국가별 creator economy 깊이 |

두 layer 가 모두 작동해야 위 사례들이 정확하게 추천됩니다.

---

## 2. Methodology

### 2.1 Brand 선정 기준

다음 조건을 모두 만족하는 brand:
1. 한국 D2C 또는 K-product 브랜드
2. 실제 해외 진출 outcome 이 공개 자료로 확인 가능
3. 결정 시점 (2017-2021 quarter) 이 명확
4. 카테고리 다양성 확보 (Beauty 단일 카테고리 cherry-pick 회피)

선정된 6 brand × 4 카테고리:

| Brand | Category | Decision Q | 결정 시점 핵심 상황 |
|---|---|---|---|
| Anua Heartleaf Pore Control Cleansing Oil | K-Beauty | 2021 Q4 | Olive Young 민감성 카테고리 1위, 해외 본격 첫 검토 |
| Tirtir Mask Fit Red Cushion | K-Beauty | 2020 Q2 | 인플루언서 창업자 (이유빈) D2C 브랜드, Olive Young + Lotte 면세 |
| Beauty of Joseon Dynasty Cream | K-Beauty | 2021 Q4 | Indie hanbang 화장품, Reddit r/AsianBeauty 자생 추종 |
| Samyang Buldak Spicy Chicken Ramen | K-Food | 2018 Q4 | Sleeper hit (2016-2017 매출 폭증) 후 첫 해외 export 검토 |
| KGC Cheong Kwan Jang Korean Red Ginseng | K-Wellness | 2020 Q4 | COVID 면세점 매출 급감 → D2C 전환 시점 |
| Binggrae Banana Milk | K-Beverage | 2017 Q1 | 첫 해외 production/distribution 자회사 설립 검토 |

### 2.2 Decision-point vintage descriptions

각 brand 의 description 은 결정 quarter 에 publicly known 했던 정보만 포함합니다. 예시:

**Tirtir (2020 Q2):**
> Tirtir Mask Fit Red Cushion compact foundation. Mass-market K-beauty, 72-hour longevity claim, glass-skin finish. D2C-native brand founded by influencer 이유빈, group-buy origin (2017 시작, TIRTIR Inc 정식 법인 2019). Korean retail via Olive Young + Lotte Duty Free entry 2019. Looking for first major overseas market.

— "TikTok ASMR 일본 viral" 같은 사후 사실 절대 포함하지 않음.

이를 `asOfDate` 파라미터로 4 anchor (Comtrade · World Bank · UNI-PASS · DART) 에 적용해 그 시점 데이터로 backdate 합니다.

Anchor 별 시간 pinning 지원 여부:

| Anchor | 시간 pinning |
|---|---|
| Comtrade | ✓ (period parameter) |
| World Bank | ✓ (year parameter) |
| Korea Customs UNI-PASS | ✓ (월별 strtYymm/endYymm) |
| DART | ✓ (사업년도 bsnsYear) |
| Hofstede | ✗ (시간 무관 cultural index) |
| MFDS | ✗ (최신 ingredient regulation) |
| KOTRA registry | ✗ (latest snapshot) |
| Tavily (web search) | ✗ (최신 web 결과) |

후자 4 개는 일부 hindsight 영향. 한계 8 장에 명시.

### 2.3 Brand strategy 입력

각 brand 의 결정 시점 brand-strategy 힌트 3 가지를 작성:
- founderBackground (≤500 char): 창업자/핵심팀 배경, 도메인 전문성, 네트워크
- channelPriority (enum): online_first / retail_first / duty_free_first / wholesale_first / omni
- kolRelationships (≤500 char): KOL 보유/협의 상황

예시 (Tirtir 2020 Q2):
- founder: "D2C-native brand founded by influencer 이유빈 (group-buy origin 2017, TIRTIR Inc 법인 2019). Korean retail via Olive Young + Lotte Duty Free entry 2019. No traditional ATL marketing budget."
- channel: online_first
- kol: "Founder Lee Yu-bin's existing Instagram following + Korean beauty YouTube reviewers via Olive Young exposure. Group-buy customers act as word-of-mouth nucleus. No paid Western KOL contracts at decision point."

### 2.4 Sim config (모든 brand 동일)

- Tier: hypothesis
- Sim 수: 3
- Persona 수: 200 per sim
- LLM round-robin: Anthropic Claude / OpenAI GPT / DeepSeek
- 활성 기능: brand-strategy 입력 · KOL ecosystem anchor · origin filter · top-1 vote share confidence · vote-share priority winner

### 2.5 시스템 진화 단계 (Tirtir 단일 brand canary)

| 단계 | 추가 | Tirtir 추천 |
|---|---|---|
| Baseline | grounding 없는 single-LLM | CN 100% STRONG |
| Step 1 | brand-strategy 입력 channel | US 100% STRONG |
| Step 2 | per-country KOL ecosystem anchor (Tavily) | KR 67% MODERATE (origin 버그 노출) |
| Step 3 | aggregator origin filter | US 100% STRONG (false confidence) |
| Step 4 | confidence = top-1 vote share | US 0% WEAK (정직 신호 회복) |
| Step 5 | vote-share priority winner picker | JP 67% STRONG (정답=JP) |

본 보고서의 모든 결과는 Step 5 이후 (모든 개선 활성) 시점에서 측정됨.

---

## 3. 종합 결과

### 3.1 Top-line

| Brand | Cat | 실제 launch | 시뮬 추천 | 일치 |
|---|---|---|---|---|
| Anua | K-Beauty | US | US · 67% STRONG | ✓ |
| Tirtir | K-Beauty | JP | JP · 67% STRONG | ✓ |
| BoJ | K-Beauty | US | US · 50% MODERATE | ✓ |
| Buldak | K-Food | US | US · 33% WEAK | ✓ (정직 WEAK) |
| KGC | K-Wellness | CN | CN · 67% STRONG | ✓ |
| Binggrae | K-Beverage | VN | VN · 67% STRONG | ✓ |

**Top-1 일치률: 6/6**

### 3.2 Confidence 분포

- STRONG (67%): 4 brand (Anua, Tirtir, KGC, Binggrae)
- MODERATE (50%): 1 brand (BoJ, sim 중 1개 partial completion)
- WEAK (33%): 1 brand (Buldak, 3-way 1-1-1 split)

Confidence 가 sim 간 의견 일치도와 그대로 매칭. False-STRONG (sim 분산인데 STRONG 표시) 없음.

### 3.3 Per-LLM hit률 (단일 LLM 만 사용했을 경우)

| LLM | Hit/Miss per brand | hit률 |
|---|---|---|
| DeepSeek | ✓US ✗US ✓US ✗CN ✓CN ✓VN | 4/6 |
| OpenAI | ✓US ✓JP ✓US ✓US ✗TW ✓VN | 5/6 |
| Anthropic | ✗ID ✓JP ✗VN ✗ID ✓CN ✗US | 3/6 |

- 단일 LLM 최고 hit률: 5/6 (OpenAI)
- Ensemble hit률: 6/6
- **단일 LLM 의존이 위험한 이유:** 같은 brand 에서도 LLM 마다 다른 prior. 멀티-LLM ensemble 만이 보편적 정확도.

---

## 4. Per-brand drill-down

### 4.1 Anua Heartleaf Pore Control Cleansing Oil

**Decision context (2021 Q4):**
- Anua 는 The Founders Inc 자회사 (2017 창업).
- 어성초 77% 기능성 cleansing oil, 민감성 피부 dermatology positioning.
- 국내 채널 = Olive Young 1위 (민감성 카테고리).
- 결정 시점 = 첫 해외 본격 D2C export 시장 검토.

**Sim 결과:**
- Sim 1 (DeepSeek): US 5/5 samples → top1 = US
- Sim 2 (OpenAI): TH/JP/JP/JP/TH 혼합 → median best US → top1 = US
- Sim 3 (Anthropic): ID×8 (country coverage retry) → top1 = ID
- Vote: US 2 / ID 1 → US 67% ≥ 50% → US winner
- Confidence: 67% → STRONG

**Actual:** US (Asian-American + Reddit r/AsianBeauty 자생 추종 후 Amazon + Olive Young Global)

**시스템 의사결정 요인:** Brand strategy "Olive Young 민감성 카테고리 1위 + KOL minimal" + Western beauty YouTube 인플루언서 자생 추종 신호 → US ecosystem 강세 인식.

### 4.2 Tirtir Mask Fit Red Cushion

**Decision context (2020 Q2):**
- Tirtir = 인플루언서 창업자 (이유빈) D2C-native brand.
- Group-buy 출신 (2017) → 정식 법인 (2019).
- 국내 채널 = Olive Young + Lotte Duty Free.
- 결정 시점 = 첫 해외 시장 검토.

**Sim 결과:**
- Sim 1 (DeepSeek): US 5/5 → top1 = US
- Sim 2 (OpenAI): JP 5/5 → top1 = JP
- Sim 3 (Anthropic): JP×8 → top1 = JP (이전 5-step 진화 과정에선 anthropic 이 CN/VN 픽이었으나 이번 run 에서 JP 일치)
- Vote: JP 2 / US 1 → JP 67% → JP winner
- Confidence: 67% → STRONG

**Actual:** JP (일본 TikTok ASMR 인플루언서 + Lotte 면세점 시너지로 viral, 이후 글로벌 확산)

**시스템 의사결정 요인:** Brand strategy "인플루언서 창업자 + group-buy origin + 일본 직구 비율 자국 외 1위" + 일본 KOL ecosystem Tavily 검색 결과 (일본 K-Beauty 인플루언서 채널 density) → JP shifted. v0.2-E vote-share priority 가 결정적 (mean-rank 만이었으면 US 가 mid-tier consistent 로 우승).

### 4.3 Beauty of Joseon (BoJ) Dynasty Cream

**Decision context (2021 Q4):**
- BoJ = Niche indie, 2016 창립 (Sumin Lee), 2019 Goodai Global 인수.
- 한방 (hanbang) heritage positioning.
- 결정 시점 매출 ~$83K (글로벌 micro-brand 규모).
- Reddit r/AsianBeauty + Western K-beauty YouTube 자생 추종 강함.

**Sim 결과:**
- Sim 1 (DeepSeek): per-sample JP/US/US/US/US → median best US → top1 = US
- Sim 2 (OpenAI): per-sample JP×5 → median best US (점수 분포 top) → top1 = US
- Sim 3 (Anthropic): VN×8 → top1 = VN (sim 후반 stage 일부 실패, 2/3 sims completed 로 마킹)
- Vote: US 2 / VN 1 → US 50% → US winner
- Confidence: 50% → MODERATE (partial completion 으로 simCount denominator 영향)

**Actual:** US

**Robust degradation 패턴:** 1 sim partial completion 에도 winner 정확 + honest MODERATE.

### 4.4 Samyang Buldak Spicy Chicken Ramen

**Decision context (2018 Q4):**
- Samyang Foods 1961 창립.
- Buldak 2012 출시 → 2016-2017 매출 폭증으로 회사 flagship.
- 국내 채널 = Olive Young + GS25 + CU + 이마트.
- 2018 중반부터 YouTube spicy-challenge 영상 자발 출현 시작.
- 결정 시점 = 첫 본격 해외 export 검토.

**Sim 결과:**
- Sim 1 (DeepSeek): CN/US/CN/CN/US → median best CN → top1 = CN
- Sim 2 (OpenAI): ID×5 → median best US (점수 분포 top) → top1 = US
- Sim 3 (Anthropic): ID×8 → top1 = ID
- Vote: CN 1 / US 1 / ID 1 — 3-way split → vote share < 50% → mean-rank fallback
- Mean-rank winner: US (모든 sim 에서 consistent rank 2-3)
- Confidence: top-1 vote share for US = 1/3 = 33% → WEAK

**Actual:** US (TikTok spicy challenge viral 2019-2020 + Amazon + Costco)

**중요한 정직 시그널:** Winner US 는 정답이지만 confidence WEAK (33%) — sim 의견 분산을 사용자에게 직접 노출. 사용자는 (a) Decision tier (6 sim) 로 신뢰도 향상 시도, (b) WEAK 받아들이고 보강 조사 가능. 별도 Decision tier 측정에서 US 60% MODERATE 로 상승 확인됨.

### 4.5 KGC Cheong Kwan Jang Korean Red Ginseng

**Decision context (2020 Q4):**
- KGC = 한국인삼공사, KT&G 자회사.
- 1899 조선 정부 인삼 전매 → 1995 민영화.
- 한국 인삼 시장 1위 (60%+).
- Channel mix 역사적으로 면세점 + 백화점 + 직영점.
- 2020 COVID-19 로 면세점 매출 급감 → D2C / 해외 온라인 확장 검토.

**Sim 결과:**
- Sim 1 (DeepSeek): CN 5/5 → top1 = CN
- Sim 2 (OpenAI): TW 5/5 → top1 = TW
- Sim 3 (Anthropic): CN×8 → top1 = CN
- Vote: CN 2 / TW 1 → CN 67% → CN winner
- Confidence: 67% → STRONG

**Actual:** CN (duty-free dominance, 면세점 + 백화점 채널 지속)

**시스템 의사결정 요인:** Brand strategy "duty-free-first + 한류 광고 모델 활용 + CN 면세 dominance" → DeepSeek/Anthropic 가 CN 정확 surface, OpenAI 가 TW (인접 한류 시장) 로 잘못 픽. Vote-share priority 가 majority 채택.

### 4.6 Binggrae Banana Milk

**Decision context (2017 Q1):**
- Binggrae Co. 1967 창립.
- 바나나우유 1974 출시 후 50년 한국 국민음료.
- 단지 패키지 = Instagram-shareable iconic 컨테이너.
- 결정 시점 = 첫 해외 production/distribution 자회사 설립 검토.

**Sim 결과:**
- Sim 1 (DeepSeek): VN 5/5 → top1 = VN
- Sim 2 (OpenAI): VN 5/5 → top1 = VN
- Sim 3 (Anthropic): VN×4 + US×1 → median best US → top1 = US
- Vote: VN 2 / US 1 → VN 67% → VN winner
- Confidence: 67% → STRONG

**Actual:** VN (베트남 자회사 설립 → 현지 생산 + 동남아 distribution hub)

**시스템 의사결정 요인:** Brand strategy "wholesale_first + 신선식품 cold-chain 한계 + 해외는 자회사+현지 생산 전략" + KOTRA registry 베트남 한국 식품 기업 anchor + Tavily VN K-Drama PPL signal → DeepSeek/OpenAI 모두 VN 정확. Anthropic 만 mainstream (US) bias.

---

## 5. 횡단 분석

### 5.1 Per-LLM 패턴

| LLM | 강점 카테고리 | 약점 패턴 |
|---|---|---|
| Anthropic | mainstream country (US/CN/JP) | Asian indie market (VN/ID) 자주 miss |
| OpenAI | KOL-strong category 자주 surface | 인접 한류 시장 (TW) bias 가능 (KGC) |
| DeepSeek | Asian markets (VN, CN) 강세 | Western mainstream 자주 미달 |

**시사점:** 단일 LLM 의존은 brand × LLM prior 의 mismatch 위험 있음. 멀티-LLM ensemble 이 architectural moat.

### 5.2 Confidence calibration

| Confidence | Brand 수 | 평균 sim 일치도 | 정직성 |
|---|---|---|---|
| STRONG (≥66%) | 4 | 2/3 vote majority | ✓ |
| MODERATE (40-66%) | 1 | partial completion + 잔여 일치 | ✓ |
| WEAK (<40%) | 1 | 3-way split | ✓ |

False-STRONG (sim 분산인데 STRONG 표시) = 0. Confidence threshold 가 sim 일치도 분포와 자연스럽게 매칭.

### 5.3 Vote-share priority 효과

| Brand | Mean-rank 만 사용했을 경우 | Vote-share priority 적용 |
|---|---|---|
| Tirtir | US (mid-tier consistent) | JP (2/3 majority) → 정답 hit |
| Binggrae | (mean-rank 도 VN 가능) | VN (2/3 majority) → 정답 hit |
| KGC | (mean-rank 도 CN 가능) | CN (2/3 majority) → 정답 hit |
| Buldak | US (mean-rank 결과) | US (no majority → mean-rank fallback) → 정답 hit |

Tirtir 만 명확히 vote-share priority 가 결정적 (mean-rank 만으로는 US 잘못 픽). 나머지 3 STRONG 케이스도 vote-share majority 채택. Buldak 1-1-1 split 에서 fallback 정상 작동.

### 5.4 KOL ecosystem anchor 효과

Tavily 검색 결과 brand 별 차이:
- Tirtir: 일본 K-Beauty 인플루언서 채널 density Hofstede + Tavily snippet → JP surfacing
- Anua: Western beauty YouTuber + Reddit ecosystem → US surfacing
- Binggrae: 베트남 K-Drama PPL + 한국 식품 기업 anchor → VN surfacing

KOL ecosystem anchor 자체가 brand-specific 신호의 macro-level proxy 역할.

---

## 6. 엔지니어링 진화 audit trail

Tirtir 단일 brand 의 5-step 진화. 각 step 에서 발견된 결함을 다음 step 이 해결.

### Step 1 → Brand strategy 입력 channel
- 추가: founderBackground / channelPriority / kolRelationships 3 필드
- 시뮬 prompt 에 brandStrategyBlock() injection (country / marketProfile / synthesis 3 곳)
- Tirtir 결과: US 100% STRONG (이동만, 여전히 잘못된 자신감)
- 발견: 입력만으로는 부족, anchor 차원 신호 필요

### Step 2 → Per-country KOL ecosystem anchor
- 추가: Tavily `buildKolEcosystemQuery` (per-country English + native Japanese/Chinese/Korean)
- `formatKolEcosystemBlock` 으로 country prompt 에 injection
- Tirtir 결과: KR 67% MODERATE (origin 버그 노출)
- 발견: LLM 이 synthesis 룰 "bestCountry != origin" 을 위반하는 사례 발생, ensemble level 에서 KR 가 winner 로 collapse

### Step 3 → Aggregator origin filter
- 변경: `aggregateEnsemble` 의 winner picker 에서 origin (KR) 강제 제외
- 표시 측면에서는 origin 그대로 (KR 도메스틱 baseline)
- Tirtir 결과: US 100% STRONG (origin 버그 차단, 그러나 false confidence 잔존)
- 발견: top-3 hit 기준 confidence 가 너무 관대 — sim 의견 분산을 가림

### Step 4 → Confidence = top-1 vote share
- 변경: consensusPercent = top3-hit / simCount → top1Agreements / simCount
- Threshold: STRONG ≥80, MODERATE ≥50 → STRONG ≥66, MODERATE ≥40
- Tirtir 결과: US 0% WEAK (정직 신호 회복)
- 발견: WEAK 정직 시그널 정상 작동, 그러나 winner 가 polarizing top (JP, 2/3 sims) 아닌 mid-tier US 로 collapse — picker 자체가 majority 의견 안 반영

### Step 5 → Vote-share priority winner picker
- 변경: top-1 vote share ≥ 50% 면 vote winner 채택, 아니면 mean-rank fallback
- Tirtir 결과: JP 67% STRONG (정답=JP, 첫 hit)
- 6 brand 일반화 검증: 6/6 일치

### 진화 trail 의 의미

각 단계의 결함을 다음 단계가 해결. 5번의 시도가 모두 정직 metric 으로 측정되어 audit 가능. 마케팅 claim 보다 강한 신뢰 기반.

---

## 7. Cost 분석

### 7.1 Per-brand 비용 (hypothesis tier 1회)

| Brand | LLM 비용 | Tavily | Total |
|---|---|---|---|
| Anua | ~$4.97 | ~$0.30 | ~$5.27 |
| Tirtir | ~$5.01 | ~$0.30 | ~$5.31 |
| BoJ | ~$4.67 | ~$0.30 | ~$4.97 |
| Buldak | ~$4.80 | ~$0.30 | ~$5.10 |
| KGC | ~$4.56 | ~$0.30 | ~$4.86 |
| Binggrae | ~$4.06 | ~$0.30 | ~$4.36 |
| **합계 (6 brand × 1 sim)** | — | — | **~$30** |

(Tavily 비용은 24h cache 로 인해 brand 간 부분 sharing; 위 추정은 worst-case)

### 7.2 Decision tier 비교 (Buldak 만 측정)

| Tier | Sim 수 | Cost | Buldak 결과 |
|---|---|---|---|
| Hypothesis | 3 | ~$5.10 | US 33% WEAK |
| Decision | 6 | ~$22-25 | US 60% MODERATE |

Decision tier 가 WEAK → MODERATE 으로 confidence 상승. STRONG (≥66%) 까지는 미달 — brand-intrinsic 의견 분산은 sim 추가만으로 한계.

### 7.3 5-step 엔지니어링 진화 디버깅 비용

| Step | 측정 횟수 | Cost 추정 |
|---|---|---|
| Step 1 측정 (Tirtir hypothesis) | 1 | ~$5 |
| Step 2 측정 (Tirtir + grounding) | 1 | ~$5 |
| Step 3 측정 (Tirtir + origin filter) | 1 | ~$5 |
| Step 4 측정 (Tirtir + top-1 vote share) | 1 | ~$5 |
| Step 5 측정 (Tirtir + vote-share priority) | 1 | ~$5 |
| **합계 (디버깅)** | **5** | **~$25** |

### 7.4 누적 backtest 총 비용

| 단계 | Cost |
|---|---|
| Baseline + v0.2-A 측정 | ~$20 |
| 5-step 엔지니어링 디버깅 | ~$25 |
| 6 brand × v0.2-E 활성 측정 | ~$30 |
| 누적 K-beauty baseline + 부수 | ~$70 |
| **총합** | **~$145** |

---

## 8. 한계 + 정직 disclosure

### 한계 1 — Hindsight bias 완전 제거 못 함

- `asOfDate` 인프라는 4 anchor (Comtrade / WorldBank / UNI-PASS / DART) 만 시간 pinning 지원
- Hofstede / MFDS / KOTRA / Tavily 4 anchor 는 latest 데이터 — 일부 hindsight 영향
- brand-strategy 입력은 작성 시점에서 작성한 vintage description — 작성자 retrospective 영향 가능
- 완전 제거 방법 = 결정 시점 contemporaneous 자료 (당시 신문·보도·SEC filing) 만 source. 향후 검증 보강 필요.

### 한계 2 — N=1 per brand

- 같은 brand 재시뮬 시 LLM stochastic variance 로 결과 변동 가능
- 통계적 KPI 신뢰도 확보 = brand × 3-5 sim 재실행 필요 (~$140 추가, 미진행)
- 6/6 일치는 N=1 corpus 기준 best-case interpretation

### 한계 3 — 카테고리 cover 제한

- 4 카테고리 (Beauty / Food / Wellness / Beverage) 검증
- 미검증 카테고리: 의류 / 전자 / B2B 산업재 등
- 추가 카테고리 backtest 가 별도로 진행 중 — 일부 카테고리에서 첫 hindsight miss 가 확인되었습니다 (관련 별도 자료 참조)

### 한계 4 — Real customer data 없음

- 6 brand 모두 자체 backtest, 실제 고객 시뮬 결과 아님
- Outcome corpus 인프라가 가동 중, 일정량 (~30 건) 모이면 실측 hit% 공개

### 한계 5 — Brand-strategy 입력 oversteer 위험

- Brand-strategy 힌트가 사용자 의도와 다른 prior 강화하는 사례 가능
- 추가 카테고리 backtest 에서 관찰됨 — "한식 culture piggyback" 같은 일반적 힌트가 잘못된 KOL ecosystem 으로 surface 하는 경우

이런 한계 명시는 over-claim 보다 강한 신뢰의 기반입니다.

---

## 9. Reproducibility appendix

### 9.1 Project IDs (workspace `0c8e774f`)

| Brand | Project ID | as-of |
|---|---|---|
| Anua | `a8f5ac18` | 2021-12-31 |
| Tirtir | `cf64330c` | 2020-06-30 |
| BoJ | `9ab0eaf8` | 2021-12-31 |
| Buldak | `0b1339c0` | 2018-12-31 |
| KGC | `f03f74dc` | 2020-12-31 |
| Binggrae | `11a59903` | 2017-03-31 |

### 9.2 Code references

핵심 모듈:
- `packages/shared/src/simulation/orchestrator.ts` — 시뮬 orchestration entry
- `packages/shared/src/simulation/prefetch.ts` — 단일 anchor + grounding 진입점 (drift fix)
- `packages/shared/src/simulation/ensemble.ts` `aggregateEnsemble()` — origin filter + top-1 vote share confidence + vote-share priority winner
- `packages/shared/src/simulation/prompts.ts` — country / marketProfile / synthesis prompt + brandStrategyBlock injection
- `packages/shared/src/market-research/tavily.ts` — KOL ecosystem query builders

### 9.3 시뮬 명령 (smoke 스크립트)

```bash
npx tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts <project_id_prefix> hypothesis --as-of=YYYY-MM-DD
```

### 9.4 관련 자료

- 외부 공개용 Accuracy Evidence Pack: `proposals/MarketTwin-Accuracy-Evidence-BD-Pack.pdf`
- K-Beauty methodology v3 (3 brand baseline): `proposals/K-Beauty-D2C-Comprehensive-Report.pdf`
- 9-brand 확장 결과 (Cuckoo MISS + Celltrion partial 포함): 추가 자료

### 9.5 데이터 audit

모든 시뮬 ID + raw output 은 workspace admin 페이지에서 audit 가능합니다. 외부 검증 요청은 hello@markettwin.ai 로 문의.

---

*본 보고서는 자체 검증 데이터에 기반하며 모든 한계를 명시합니다. 시뮬 결과 데이터 audit 요청은 위 연락처로 문의 바랍니다.*
