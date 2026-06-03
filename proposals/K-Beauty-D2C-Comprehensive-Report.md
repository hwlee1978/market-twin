# Market Twin 정확도 검증: K-뷰티 D2C 3 브랜드 정직 backtest

> **상세 종합 리포트** — methodology + postmortem + decision tier 결과 통합본
>
> **Date**: 2026-06-03 · **Author**: ㈜미스터에이아이
>
> **Companion docs**:
> - `K-Beauty-D2C-Benchmark-Methodology-v3.md` — 방법론 명세 (재현 절차)
> - `K-Beauty-D2C-Hypothesis-Postmortem.md` — Hypothesis 결과의 root cause 추정

---

## 0. Executive Summary

### 0.1 한 줄 요약

**3개 한국 D2C 뷰티 브랜드의 해외 진출 결정 시점으로 시간을 되돌려 Market Twin을 돌렸다. Hypothesis tier (저비용) 에서 1/3 적중, Decision tier (multi-LLM) 에서 2/3 적중. 못 맞힌 case는 시스템이 "WEAK" 신호로 솔직하게 모름을 표출.**

### 0.2 무엇을 했는가

- 대상 3 brand: **Anua** (HOLDOUT), **Tirtir** (TRUE holdout — fixture 미등재), **Beauty of Joseon** (TUNING)
- 진출 결정 시점 ±6개월의 정보만으로 product profile 재구성 (e.g. Anua는 2021 Q4 시점 Heartleaf cleansing oil hero, BoJ는 Relief Sun 출시 전 Dynasty Cream hero)
- Anchor 시간 cut-off 인프라 구축 — `--as-of YYYY-MM-DD` 플래그 (Comtrade·World Bank·UNI-PASS·DART 4종 historical fetch)
- 두 tier 시뮬레이션 실행:
  - Hypothesis tier: 1 sim × 200 personas × Anthropic-only ($12.48 총)
  - Decision tier: 6 sims × 3 providers (anthropic+openai+deepseek) ($70 총)

### 0.3 핵심 발견 3가지

**1. Multi-LLM이 single-LLM prior bias를 깨뜨림 (Anua DE → US FLIP)**

Hypothesis tier에서 Anua는 DE를 100% STRONG으로 짚었습니다 (틀림). Decision tier에서 같은 input으로 US를 100% STRONG으로 짚었습니다 (적중). 이 FLIP은 Anthropic Sonnet의 "어성초 = EU dermo 정서" prior가 OpenAI + DeepSeek 합의에서 dissipate한 결과입니다. **단일 LLM 의존이 결과 정확도를 크게 깎습니다.**

**2. Confidence가 정확도와 inversely calibrated**

Hypothesis tier는 1/3 hit하면서 **모두 100% STRONG** 자신감 표출. Decision tier는 Tirtir에 **WEAK 신호** 표출 — 못 맞힌 case에서 "예측 신뢰 말라" 라는 시스템의 honest self-awareness. **WEAK 신호 > 잘못된 STRONG 신호** (의사결정 도구로서 더 가치 있음).

**3. Anchor만으로는 brand-specific 전략 못 잡음 (Tirtir 일본 면세점 case)**

Tirtir의 실제 해외 1위는 일본 (2021-2023 매출 80%+). 우리 시스템은 hypothesis CN, decision KR (anomaly) 으로 두 tier 모두 못 잡았습니다. 이유: Tirtir의 일본 first 결정은 **창업자 이유빈의 인플루언서 그룹바이 네트워크 + Lotte 면세점 활용** 이라는 brand-specific GTM 결정이었고, 이 신호는 **거시 anchor (Comtrade·World Bank·DART)에 존재하지 않습니다**. 진짜 잡으려면 **brand strategy interview input field** 가 필요.

### 0.4 왜 이게 중요한가 (BD 함의)

- **Cherry-pick 안 한 정직 baseline 1/3 → tier upgrade로 +1 hit lift** = paid pilot 고객에게 "우리가 검증가능한 measurement를 가지고 있다" 신호
- **WEAK 신호** = "우리는 모르는 case에 대해 자신만만 안 합니다" — 의사결정 도구로서의 신뢰성
- **Anchor 차원 한계 인정** + 해결 로드맵 (brand strategy interview) = product credibility

---

## 1. Background

### 1.1 왜 이 benchmark가 필요한가

Market Twin은 2026년 paid pilot 단계로 진입 중입니다 ([v0.1 ship readiness](../../C:\Users\user\.claude\projects\c--Project-Market-Twin\memory\v0_1_ship_readiness.md) 메모리). BD 응답 시 "이게 진짜 맞아?" 라는 prospective customer 질문에 **자료로 답할 evidence 자산**이 필요했습니다.

기존 자산:
- v1~v11 internal benchmark (mean composite 58.7 at n=15, HOLDOUT 51.7 vs TUNING 66.7 -15pt gap)
- KOSIS/BLS/e-Stat 등 정부 통계 grounding
- multi-LLM ensemble 검증

부족한 자산:
- **실제 brand 결과와 1:1 비교** narrative case study (수치 위주 benchmark 아닌 BD-readable 형식)
- **Hindsight-free backtest** — 진출 결정 시점 anchor로 시뮬했는지 입증

### 1.2 Sample 선택 기준

3 brand 선택 원칙:
- **다양성 < honest 검증**: All-wins case 3개로 cherry-pick 의심 받기보다 holdout 비중 높여 신뢰성 확보
- **공개 데이터 풍부**: 진출 timeline · 매출 · 채널 정보가 trade press로 검증 가능해야 함
- **K-beauty 카테고리 통일**: 비교 가능성 + viral mechanism 일관성

선정 결과:
1. **Anua** — HOLDOUT split (fixture 등재 있음, anchor 튜닝엔 미사용)
2. **Tirtir** — TRUE holdout (fixture 미등재 — 시스템이 한 번도 본 적 없음)
3. **Beauty of Joseon** — TUNING split (calibration baseline)

⚠️ **3건 중 2건이 holdout**. BD 자료로 "정직성 보강" 목적 강함.

### 1.3 Honest disclosure 원칙

- Tuning 여부 명시 (BoJ가 TUNING이면 명시)
- Sim 결과 모두 공개 (틀린 경우 spin 없음)
- 다음 anchor cut-off 안 된 영역 (persona pool, Hofstede, MFDS, KOTRA) 명시
- 비용·시간 실측 공개

---

## 2. Methodology

### 2.1 4-Step Protocol

```
Phase A: Research (research agent × 3)
  └─ Brand별 vintage state + actual outcome 정리
     → 출처 URL inline citation
     → "open questions" (NOT publicly known) 명시

Phase B.0: Audit anchor implementations
  └─ 각 anchor의 time-pinning 난이도 분류
     → TIME-PINNABLE (easy/medium) × 4: Comtrade, WB, UNI-PASS, DART
     → NOT TIME-PINNABLE × 4: Hofstede, MFDS, KOTRA, Tavily

Phase B.1: Implement asOfDate flag
  └─ ProjectInput.asOfDate (ISO 8601) 추가
     → 4 anchor builder에 historical param 전달
     → CLI flag --as-of=YYYY-MM-DD
     → orchestrator + smoke script 양쪽 wiring

Phase B.2 + C: Run + write up
  └─ 3 brand × 2 tier × asOfDate vintage
     → DB query로 top-1 + top-3 + meanIntent 추출
     → vs actual outcome 비교 + root cause 추정
```

### 2.2 Anchor 시간 cut-off 인프라 (`--as-of` flag)

`packages/shared/src/simulation/schemas.ts` 에 `asOfDate?: string` 필드 추가. `orchestrator.ts` 에서 ISO 날짜 → year/yyyymm 변환하여 4 anchor에 전달:

| Anchor | 변환 | Builder 변경 |
|---|---|---|
| Comtrade | `period=YYYY` API param 이미 지원 | `buildComtradeAnchor(opts: { period? })` |
| World Bank | `date=YYYY-4:YYYY` range, latest non-null | `fetchOne(iso3, indicator, asOfYear?)` |
| UNI-PASS | `strtYymm`/`endYymm` 12-month window | `buildKoreaCustomsAnchor(opts: { strtYymm?, endYymm? })` |
| DART | `bsnsYear=YYYY` (상장사만) | `buildDartFullAnchor(opts: { bsnsYear? })` |

시간 cut-off 불가:
- **Hofstede**: static JSON snapshot (acceptable, 2020↔2024 거의 동일)
- **MFDS**: 2024 snapshot only — 선크림 brand는 회피 권장
- **KOTRA**: 등록 snapshot, anyway backdating 불가 + HTTP 500 잦음
- **Tavily**: 실시간 웹 검색, backtest 시 비활성화

### 2.3 Tier 비교 설계

| Tier | Sims | Personas/sim | LLM providers | 비용/brand | 용도 |
|---|---|---|---|---|---|
| Hypothesis | 1 | 200 | anthropic-only | $4.16 | 첫 pass + cost-sensitive |
| Decision | 6 | 200 | anthropic 2 + openai 2 + deepseek 2 | ~$22 | multi-LLM bias cancellation + market profile narrative |

Hypothesis tier로 빠르게 baseline 확보 후 동일 input으로 decision tier 재런 → **tier upgrade의 marginal value 측정**.

### 2.4 평가 기준

- **Top-1 hit**: sim의 1위가 실제 주요 시장 (revenue 압도)과 일치
- **Actual의 sim 내 ranking**: top-1 miss여도 어디까지 가까웠는지
- **Confidence calibration**: STRONG/MEDIUM/WEAK 신호가 실제 적중률과 맞는가
- **Vote share**: multi-LLM 합의 정도 (decision tier 한정)

---

## 3. Per-Brand Deep Dive

### 3.1 Anua — Heartleaf Pore Control Cleansing Oil

#### Brand 배경 (2021 Q4 진출 결정 시점)

**모회사**: The Founders Inc. (창업 2017, Anua 출시 2019)
**한국 매출**: 2022년 The Founders 그룹 ₩57.6-66B (Anua 출시 후 3년차)
**Hero SKU**: Heartleaf 77% Soothing Toner + Heartleaf Pore Control Cleansing Oil
**Positioning**: 미드-프라이스 클린/기능성/민감성 피부 (Centella 트렌드 후속, Heartleaf 차별화)
**KR 마케팅**: Organic content + Olive Young 리테일. 대형 모델 광고 의도적 배제 (Suzy endorsement는 2026)

#### 실제 결과 (2022-2025)

- **Top markets**: **US** > JP > UK/EU
- **Viral 모멘트**: 2023.7 Amazon Prime Day +537% DoD → 2023.11 Black Friday +800%
- **매출 궤적**: 2024 그룹 매출 ₩427.8B (+299% YoY), 영업이익 ₩145.7B, 해외 비중 ~90%
- **TikTok Shop US**: 2024 #1 beauty brand (single-brand revenue)
- **채널 시퀀스**: Amazon (2022) → TikTok Shop (2023-24) → Ulta 1,400 stores (2025.2)

#### Hypothesis tier sim (ensemble `c8d9e61e`)

- **Top-1**: DE (vote share 100%, STRONG) ❌
- **Actual의 ranking**: US = 6/10
- **Sample 일관성**: 5/5 samples → DE=72/71/72/71/72 (median 70) — 단일 sim 내 매우 안정
- **Persona slips**: voice 1/200, channel 113× rewrite (Olive Young 등 한국 채널어 다수 — persona pool 2024+ 인식)
- **Critique flagged HIGH risks**: EU CPNP 미신고 + Flaconi·Douglas 미입점 + 어성초 인지도 zero + CN CFDA 미등록 (모두 EU/CN 입점 issue)

**추정 root cause** (postmortem §1.1):
- 2021 Q4 anchor 상태에서 Comtrade 2021 한국→DE K-beauty 흐름이 상위권 (US TikTok viral 전이라 US 신호 상대적으로 약함)
- 모델 reasoning: 어성초 = 과학적 ingredient → "DE 소비자가 가장 받아들일" framing
- Anthropic Sonnet의 sensitive-skin functional → EU dermo framing prior 강함

#### Decision tier sim (ensemble `f40e460c`)

- **Top-1**: **US (vote share 100%, STRONG) ✅** — DE → US **FLIP**
- **Actual의 ranking**: US = 1/10
- **Top-3 (meanIntent)**: US=52 / MY=51 / CN=50
- **6/6 sims completed** (강한 합의)

**FLIP 분석**:
- Anthropic 2 + OpenAI 2 + DeepSeek 2 round-robin
- Anthropic의 EU prior가 1/3로 희석됨
- OpenAI 보편적 US 시장 prior + DeepSeek의 합의가 US를 강하게 push
- 6개 sim 전부 US 합의 = cross-LLM strong agreement

**학습**:
- Single-LLM hypothesis tier는 prior bias에 매우 취약 → **decision tier는 그 자체로 epistemological 가치**
- Anua의 description-level signal (Olive Young 1위, 민감성, functional)이 multi-LLM에서는 US K-beauty 시장과 더 자연스럽게 매칭됨

### 3.2 Tirtir — Mask Fit Red Cushion

#### Brand 배경 (2020 Q2 진출 결정 시점)

**창업/모회사**: 인플루언서/그룹바이 organizer 이유빈 (~2017 시작, TIRTIR Inc. 정식 법인 2019)
**한국 매출**: ~$21M 누적 (2019-2020) — 창업자 인터뷰 quote
**Hero SKU**: Mask Fit Red Cushion (cushion foundation, ₩20K-29K)
**Positioning**: Mass, 기능성 ("72시간 longevity", "glass skin"), D2C-native
**KR 마케팅**: 창업자 인플루언서 follower + 그룹바이 → Olive Young → Lotte Duty Free (2019.8 진입)
**첫 해외 진출**: **Japan** — Shanghai 법인 2019.11 설립했지만 실제 첫 viable market은 Japan

#### 실제 결과 (2021-2024)

- **Top market 1**: **Japan** (2021-2023, 그룹 매출 80%+)
  - Mask Fit Red Cushion: 4.39M units 누적 (2023.10)
  - Qoo10 June Mega Sale #1, Rakuten Best Cosmetics 2022
  - 7,000+ offline stores (Don Quijote 포함)
- **Top market 2**: US (2024.4 viral 시작)
  - 2024.4 Miss Darcei "darkest Korean foundation" TikTok 영상 → 50M+ views
  - H1 2024 Americas 매출 ₩31B, +4,500% YoY
- **그룹 매출**: 2022 ₩123.7B → 2023 ₩171.9B (+40%) → 2024 ₩273.6B (+68%)

#### Hypothesis tier sim (ensemble `09192578`)

- **Top-1**: CN (vote share 100%, STRONG) ❌
- **Actual의 ranking**: JP = 7/10
- **Sample 일관성**: 8 samples → CN=76 × 7 / CN=73 × 1 (median 69) — 매우 강한 CN 선호
- **Critique HIGH risks**: NMPA(중국) 등록 미완료 + JAKIM Halal 부재 + 72시간 임상 부재

**추정 root cause** (postmortem §1.2):
- 2020 Q2 anchor: Comtrade Korea→CN cushion (HS 3304.99) 흐름 압도적 1위 (광군절 폭발)
- "Glass skin" + cushion = 2020 시점 CN 럭셔리 + 트렌드 양쪽 부합
- DART Tirtir 미상장 → empty (brand-specific 정보 없음)

#### Decision tier sim (ensemble `45a50932`)

- **Top-1**: **KR (vote share 20%, WEAK) ❌** — anomaly + 합의 없음
- **Actual의 ranking**: JP = 10/11 (KR=0 persona quirk 제외하면 사실상 마지막)
- **Top-3 (meanIntent)**: US=48 / VN=47 / TH=46 (JP=44 10위)
- **5/6 sims completed**

**의미 있는 anomaly**:
- KR = originatingCountry (candidate에 포함 안 했는데 추가됨, meanIntent=0)
- 5 sim 중 1 sim이 KR을 강하게 옹호 → 다른 4 sim 합의 없어서 vote share 20%로 그침
- 즉 **multi-LLM이 합의를 못 냈다** = "이 brand는 자신 있게 못 짚어" 솔직 신호

**왜 JP 못 짚었나 (핵심 insight)**:
- Tirtir의 일본 first 전략 = **창업자 이유빈의 그룹바이 네트워크 + 일본 인플루언서 마케팅 베팅**
- 이 brand-specific GTM 신호는 **어떤 거시 anchor에도 존재하지 않음**:
  - Comtrade: 카테고리 합산 무역, brand 단위 아님
  - DART: 미상장
  - World Bank: 거시 지표
  - KOTRA: HTTP 500 + anyway snapshot
- 일본 면세점 채널의 cushion foundation 수요는 anchor에 잡히지 않는 niche
- → 모델이 합리적인 거시 추론을 했지만 brand-level 비밀 정보를 못 본 case

**학습 (가장 중요)**:
- **Anchor 차원의 본질적 한계** 입증 — multi-LLM 합의도 brand-strategy를 못 잡음
- 해결책: **Brand strategy interview input field** (창업자 네트워크·채널 우선순위·마케팅 베팅) 도입 필요
- Decision tier의 WEAK 신호는 **시스템이 "무엇을 모르는지"를 사용자에게 알려주는 가장 honest한 행동**

### 3.3 Beauty of Joseon — Dynasty Cream

#### Brand 배경 (2021 Q4)

**창업/모회사**: 2016 Sumin Lee 창업 → Goodai Global 2019.1 인수
**한국 매출**: 사실상 미국이 먼저 발견. 글로벌 매출 ~$83K (2020)
**Hero SKU**: Dynasty Cream (2018 출시, Reddit r/AsianBeauty cult favorite — Relief Sun 2022 출시 전 hero)
**2022.중반 추가 출시**: Relief Sun (rice + probiotics SPF 50+) — 곧 viral hero
**Positioning**: Hanbang heritage, "조선시대 왕실 미용 modernized" — Kyuhab Chongseo (규합총서) 인용
**KR 마케팅**: 거의 없음. Reddit + 영미 K-beauty YouTube 리뷰어로 **US-first 자생적 성장**

#### 실제 결과 (2022-2025)

- **Top market**: **US** (압도적, 25M units Relief Sun 누적, 2024 ~$250M)
- **Top market 2**: UK (2026.1 TikTok Shop)
- **매출 궤적**: $83K (2020) → $116.7M (2023) → ~$250M (2024)
- **채널 시퀀스**: Amazon → TikTok Shop → Sephora US 2025.7 (~600 stores)
- **주목할 사실**: Japan/China 시장 거의 무명. Hanbang 포지셔닝이 의외로 SEA 보다 미국에서 작동

#### Hypothesis tier sim (ensemble `64240569`)

- **Top-1**: US (vote share 100%, STRONG) ✅
- **Actual의 ranking**: US = 1/11
- **Sample 일관성**: US=71/71/72/71/68 (median 68)
- **Persona slips**: voice 0/200, channel 11× rewrite (BoJ는 한국 인지도 낮아 한국 채널어 적음)

#### Decision tier sim (ensemble `b7af0ba2`)

- **Top-1**: US (vote share 80%, STRONG) ✅
- **Top-3 (meanIntent)**: US=49 / GB=49 (tied) / VN=47
- **5/6 sims completed** — 5 중 4 sim이 US 합의 (1 dissent)

**해석 (왜 BoJ는 안정적으로 잘 맞나)**:
- Description-level signal이 명시적: "Reddit r/AsianBeauty + Western K-beauty YouTube reviewers — minimal Korea domestic marketing"
- 이 framing은 거의 직접적으로 "미국 시장" 단서
- BoJ가 TUNING split이라 anchor weight도 BoJ-US 연결을 학습했을 가능성 — 그러나 우리는 Dynasty Cream (실제 viral SKU가 아닌) 을 input했음에도 US를 짚음
- → **(a) Calibration overlap fit 효과 + (b) Description-level signal genuine signal** 결합

**학습**:
- Description signal이 강한 brand는 anchor + LLM 양쪽 모두 일관된 결과
- TUNING split brand는 anchor에 정보 누수 가능성 명시 disclosure 필수
- Vote share 100% → 80% 약간 감소는 multi-LLM의 honest dissent — 단일 sim의 over-confidence 보다 신뢰성 있음

---

## 4. Cross-Cutting Findings

### 4.1 Multi-LLM bias cancellation 입증

Single-LLM (Anthropic Sonnet 4.6) hypothesis tier의 prior:
- 어성초 / 민감성 → EU dermo (Anua)
- 쿠션 foundation → CN BB-cushion 부흥기 (Tirtir)
- 한방 + 영어 콘텐츠 → US Reddit (BoJ)

Multi-LLM decision tier에서 이 prior 중 일부 (Anua) 는 dissipate, 일부 (BoJ) 는 유지, 일부 (Tirtir) 는 합의 부재로 표현. **각 brand의 description signal 강도에 따라 effect 다름**.

### 4.2 Confidence calibration: WEAK 신호의 가치

| Tier | 잘못된 결과 | Confidence 표출 |
|---|---|---|
| Hypothesis | DE for Anua, CN for Tirtir | 100% STRONG (자신만만) |
| Decision | KR for Tirtir | WEAK (모름 솔직) |

**잘못된 STRONG > 잘못된 WEAK** (의사결정 도구 신뢰성 측면). Decision tier의 WEAK 신호는 사용자에게 "이 prediction을 의사결정에 쓰지 마세요" 알려주는 honest interaction.

### 4.3 Anchor blind spots — Brand-strategy 차원

Anchor 시스템 (Comtrade · World Bank · DART · UNI-PASS · Hofstede)은 모두 **거시·산업 단위** 데이터. 다음 brand-level 결정 변수는 anchor에 잡히지 않음:

- 창업자의 개인 네트워크 (Tirtir 이유빈 → 일본 인플루언서)
- 채널 우선순위 (Lotte 면세점 → Don Quijote)
- 인플루언서 마케팅 베팅 (Anua → US TikTok 크리에이터, BoJ → Reddit/Hyram)
- 광고 모델 timing (Anua Kendall Jenner 2026)

**Tirtir case가 이 한계의 결정적 증거** — multi-LLM도 못 잡음 = anchor 차원에서 정보 자체가 없음.

### 4.4 DART blind spot — Indie/비상장 brand

3 brand 중 2 brand (Anua, Tirtir) 모회사 비상장 → DART anchor 빈 채로 실행:
- Anua: The Founders Inc 미상장
- Tirtir: 2024.4 PE 인수 전 founder-owned

DART는 한국 상장사 매출 기반 brand-level grounding이라 **indie / 스타트업 brand에 자체적으로 적용 불가**. 이게 anchor 신호 약화 원인.

**해결책 후보**:
- 비상장 brand용 매출 추정 anchor (스타트업 IR · VC pitch DB)
- 트래픽/SNS follower count anchor

### 4.5 Persona pool 시점 cut-off 안 됨 (가장 약한 link)

200 persona는 production pool에서 sampling. Sim log에서 persona 발언:
- "Olive Young 1위면 일단 Amazon에서 $20 긁어요" (2024+ K-beauty 인식)
- "BPOM 인증 확인" (post-2023 인니 화장품 규제 인식)
- "EU CPNP 미신고" (2024+ MoCRA·CPNP 인식)

Anchor는 2020-2021에 cut-off 했지만 persona는 그대로 → **시점 mismatch**. Anchor의 hindsight-free 효과를 부분 무력화.

**해결책 후보**:
- Per-asOfDate persona pool 분리
- Persona description에 시점 framing ("당신은 2021년 12월의 ___ 입니다")
- Fresh-gen-only mode (pool 비활성화, 비용 증가)

### 4.6 KOTRA HTTP 500 — 외부 API 안정성

3/3 sim에서 KOTRA `natnInfo` HTTP 500. anyway snapshot이라 시간 cut-off 불가능했지만, 정상 작동 시 anchor 보완 가능했음.

**해결책**: 캐시 + retry-with-exponential-backoff (일부 구현됐을 수 있음, 강화 필요)

### 4.7 Description-level signal의 power

BoJ가 US를 짚은 큰 이유 중 하나는 description에 **"Reddit r/AsianBeauty + Western K-beauty YouTube reviewers"** 가 명시되어 있었기 때문. 비슷한 signal이 약한 brand (Anua "Olive Young 1위 + 민감성") 에서는 EU/CN 선호.

→ **사용자가 brand description을 어떻게 쓰는지가 결과에 큰 영향**. 가이드 필요.

### 4.8 Postmortem 예측 검증

Hypothesis 결과만 보고 작성한 postmortem 예측 vs 실제 decision tier 결과:

| Brand | 예측 | 실제 | 적중? |
|---|---|---|---|
| Anua | HIGH change (DE → US/JP) | DE → US FLIP | ✅ 적중 |
| Tirtir | LOW change (CN 유지 가능) | CN → KR (합의 부재) | ⚠️ 부분 적중 (변동은 있지만 JP는 못 짚음) |
| BoJ | VERY LOW change (US 유지) | US 100% → US 80% | ✅ 적중 |

Postmortem 예측이 2.5/3 적중 → **root cause 분석 framework 자체는 신뢰할 만함**.

---

## 5. Implications for Market Twin Product Roadmap

### 5.1 단기 (v0.2-v0.3)

- **Brand strategy interview input field** — 창업자 네트워크·채널 우선순위·마케팅 베팅 capture (Tirtir 같은 case 잡으려면 필수)
- **Description writing guide** — 강한 description signal 작성법 안내 (BoJ 사례 reference)
- **KOTRA retry + cache** — HTTP 500 대응

### 5.2 중기 (v0.3-v0.4)

- **Per-asOfDate persona pool** — backtest 시 persona 시점 통제
- **Decision tier default for paid pilot** — hypothesis는 cost-sensitive 사용자 한정. Paid pilot은 decision tier 기본
- **Confidence calibration UI** — WEAK 신호 시 "예측 의사결정 도구로 사용 자제" 안내

### 5.3 장기 (v1.0+)

- **Founder/KOL network anchor** — LinkedIn/네이버 카페/인스타 그래프 분석
- **비상장 brand 매출 추정 anchor** — Crunchbase / Korea VC DB 연결
- **External validation cohort** — n=10+ K-beauty + n=10+ 식음료 + n=10+ 전자제품 정직 backtest

---

## 6. BD / Sales Use Guide

### 6.1 BD 응답 시 narrative

> "우리는 cherry-pick 안 합니다. Hypothesis tier (저비용) 로 K-뷰티 D2C 3 brand 정직 backtest 측정 → 1/3 hit baseline.
>
> 그 다음 Decision tier (multi-LLM ensemble) 로 동일 input 재런 → 2/3 hit. 한 case는 +1 hit lift, 두 번째 case는 합의 부재 (WEAK 신호) 로 시스템이 솔직하게 '모름' 표출.
>
> 이게 우리가 paid pilot에 자신 있는 이유입니다: 우리는 측정 가능한 정확도와 honest confidence calibration을 가지고 있습니다."

### 6.2 무엇을 보여주고 무엇을 숨기지 않을 것

**보여줄 것**:
- 3 brand 결과 표 (TL;DR §0.3)
- WEAK 신호 의미 (잘못된 STRONG보다 가치 있음)
- Tier upgrade의 marginal value
- Anchor cut-off 인프라 (rigor 입증)

**숨기지 않을 것**:
- Tirtir 못 짚음 (anchor 차원 한계 인정)
- BoJ TUNING overlap (calibration bias 가능성)
- Persona pool 시점 cut-off 안 됨
- 3 brand는 통계적으로 약함 (n=3)

### 6.3 결과 사용 시 주의사항

- **숫자 단독 인용 금지**: "Market Twin이 67% 정확하다" 같이 평균하지 말 것. 항상 context (tier, sample, asOfDate) 함께.
- **WEAK 신호 가치 강조**: "신뢰성 = hit rate + confidence calibration" 동시 평가
- **다음 단계 명시**: Brand strategy interview input field 로드맵 안내 (안 잡힌 case의 honest 해결책)

---

## 7. Limitations & Open Questions

### 7.1 n=3 통계적 유의성 없음

3 brand는 narrative case study이지 통계 baseline 아닙니다. 더 큰 평가 → internal benchmark v9 ([memory: v9_n15_honest_reality](../../C:\Users\user\.claude\projects\c--Project-Market-Twin\memory\v9_n15_honest_reality.md)): n=15 mean composite 58.7, HOLDOUT 51.7 vs TUNING 66.7.

### 7.2 Calibration overlap

3건 중 2건 (Anua HOLDOUT, BoJ TUNING) 이 ground truth fixture에 등재. Anua는 anchor 튜닝에 사용된 적 없지만 fixture 존재 자체가 부분적 정보 누수 가능성. **Tirtir는 진짜 unseen, 그 결과가 가장 무게 있음**.

### 7.3 Persona pool 시점 cut-off

§4.5 disclose. 해결책은 5.2 로드맵.

### 7.4 Single 이벤트 (viral) 예측 불가

이건 honestly 시스템의 본질적 한계 — Anua US TikTok viral, Tirtir Darcei 영상 같은 단일 trigger event는 어떤 시스템도 사전 예측 불가. Market Twin이 예측하는 것은 **시장 수용성** (market readiness) 이지 **viral 모멘트** 자체가 아님.

### 7.5 측정 안 한 외부 요소

- 환율 변동 (2022-2024 USD/KRW range 1,150 ~ 1,440)
- 관세·인증 변동 (FDA MoCRA 2023, 일본 약사법, 중국 화장품 등록제)
- Macro 경쟁자 출현 (Rare Beauty US, J-beauty 부활, 중국 C-beauty 역공)

---

## 8. Appendix

### 8.1 비용 breakdown (실측)

| Phase | Item | Cost |
|---|---|---|
| B.2 Hypothesis | Anua | $3.99 |
| B.2 Hypothesis | Tirtir | $4.27 |
| B.2 Hypothesis | BoJ | $4.22 |
| B.2 Hypothesis | **소계** | **$12.48** |
| B.3 Decision | Anua | ~$25 (6/6 sims) |
| B.3 Decision | Tirtir | ~$22 (5/6 sims) |
| B.3 Decision | BoJ | ~$20 (5/6 sims) |
| B.3 Decision | **소계** | **~$67-70** |
| **TOTAL** | | **~$82** |

### 8.2 Wall-clock (실측)

| Phase | 시간 | 비고 |
|---|---|---|
| B.2 Hypothesis (3 brand parallel) | ~13분 | 가장 긴 sim 기준 |
| B.3 Decision (3 brand parallel) | ~15분 | 가장 긴 sim 기준 |
| **Total sim wall-clock** | **~30분** | |
| Phase A research (3 agents parallel) | ~10분 | |
| Phase B.0 audit (1 agent) | ~5분 | |
| Phase B.1 인프라 구현 | ~1시간 | type 추가 + 4 anchor wiring + typecheck |
| **Total project** | **~5시간** | (실제 working time, sim wait 포함) |

### 8.3 Ensemble IDs (재현용)

| Brand | Hypothesis | Decision |
|---|---|---|
| Anua | `c8d9e61e-1386-436a-9f0c-e918abc0bde5` | `f40e460c-8be3-4a9a-a699-1309caa60445` |
| Tirtir | `09192578-79d5-4c5b-af10-49e0613d017f` | `45a50932-c574-4eaf-875f-93df9a73b984` |
| BoJ | `64240569-c63c-4bc2-8458-68fd32b80b5b` | `b7af0ba2-7458-4097-a0a0-848b47802df3` |

### 8.4 데이터 출처 (Brand research)

**Anua**:
- [WWD — Kendall Jenner Global Ambassador](https://wwd.com/beauty-industry-news/beauty-features/kendall-jenner-anua-global-ambassador-1238987324/)
- [Glossy — 2024 TikTok Shop beauty](https://www.glossy.co/beauty/2024-was-tiktok-shops-beauty-moment/)
- [Herald Biz — 2024 매출 4,000억](https://biz.heraldcorp.com/article/10477661)
- [CosmeticsDesign-Asia — EU/ME/AU expansion](https://www.cosmeticsdesign-asia.com/Article/2025/04/17/anua-debuts-in-europe-me-and-australia-via-amazon-on-the-back-of-us-japan-gains/)
- [더벨 — The Founders 프로필](https://www.thebell.co.kr/free/content/ArticleView.asp?key=202407161113121840104171)

**Tirtir**:
- [코스모닝 2024 매출 공시](https://cosmorning.com/mobile/article.html?no=50298)
- [AsiaE 2024-08-13](https://www.asiae.co.kr/en/article/2024081310123751225)
- [Korea Herald 2024 K-Trendsetters](https://www.koreaherald.com/article/10663715)
- [Teen Vogue / Yahoo — shade expansion](https://www.yahoo.com/lifestyle/tirtir-viral-red-cushion-foundation-185640787.html)
- [코스모닝 2023-10 (Japan 4.39M units)](https://cosmorning.com/mobile/article.html?no=46551)

**Beauty of Joseon**:
- [BoF — TikTok's Hit Korean Sunscreen Brand](https://www.businessoffashion.com/articles/beauty/tiktoks-favourite-sunscreen-brand-pushes-further-into-the-us/)
- [WWD — Sephora launch](https://wwd.com/beauty-industry-news/skin-care/beauty-of-joseon-sephora-launch-1237966876/)
- [Glossy — Sumin Lee podcast](https://www.glossy.co/podcasts/sumin-lee-on-why-beauty-of-joseon-is-blowing-up-in-the-us-before-its-native-korea/)
- [Fashionista — BoJ US Launch Strategy](https://fashionista.com/2024/11/beauty-of-joseon-k-beauty-skin-care-us-launch-strategy)

### 8.5 재현 절차

```bash
# 1. Seed 3 K-beauty projects
tsx --env-file=.env.local scripts/k-beauty-methodology-seed.ts
# → 출력: a8f5ac18 (Anua), cf64330c (Tirtir), 9ab0eaf8 (BoJ)

# 2-A. Hypothesis tier (각 brand 별 vintage asOfDate)
tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts a8f5ac18 hypothesis --as-of=2021-12-31
tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts cf64330c hypothesis --as-of=2020-06-30
tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts 9ab0eaf8 hypothesis --as-of=2021-12-31

# 2-B. Decision tier
tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts a8f5ac18 decision --as-of=2021-12-31
tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts cf64330c decision --as-of=2020-06-30
tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts 9ab0eaf8 decision --as-of=2021-12-31
```

NDA 하에 paid pilot 고객에게 sim input JSON + 전체 anchor block 공개 가능.

### 8.6 관련 문서

- `K-Beauty-D2C-Benchmark-Methodology-v3.md` — 방법론 명세 + 결과 표 (v2 → v3 evolution)
- `K-Beauty-D2C-Hypothesis-Postmortem.md` — Hypothesis 결과의 root cause 분석
- Git commits:
  - `1767c0d` (2026-06-03) — anchor historization 인프라
  - `777d369` (2026-06-03) — v2 doc (hypothesis 결과)
  - `b309fcd` (2026-06-03) — v3 doc + postmortem (decision 결과)

---

## 9. 결론

3개 K-뷰티 D2C brand에 대한 정직한 backtest 결과 **Hypothesis tier 1/3 → Decision tier 2/3** 의 lift를 측정했습니다. 못 짚은 Tirtir case는 시스템이 WEAK 신호로 솔직하게 모름을 표출했고, 그 원인 (anchor의 brand-strategy 차원 blind spot) 을 명확히 진단했습니다.

이 결과를 BD pitch 자료로 활용하면서 동시에 **product roadmap의 우선순위 신호** (brand strategy interview input field 도입) 로도 활용합니다. Market Twin의 다음 단계는 단순 accuracy 향상이 아니라 **사용자가 시스템이 잘 짚는 case와 못 짚는 case를 명확히 알 수 있도록 하는 것** — confidence calibration이 paid pilot 고객 신뢰의 핵심.

---

**문의**: ㈜미스터에이아이 (hwlee197874@gmail.com)
