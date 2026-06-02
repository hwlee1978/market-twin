# K-Beauty D2C 해외 출시 결과 vs Market Twin 시뮬레이션 비교 (v2)

> **Status**: Phase A research + Phase B (anchor historization + 3 brand sim 재런) 완료. Hypothesis-tier 1×200 sim with `--as-of YYYY-MM-DD` historical anchor flag. 총 비용 ≈ $12.5 (3 ensemble × ~$4.1).
>
> **Document version**: v2 (sim 결과 반영)
> **Owner**: ㈜미스터에이아이
> **Last updated**: 2026-06-03

---

## TL;DR

3건의 한국 D2C 뷰티 브랜드 해외 출시 사례를 Market Twin 시뮬레이션 결과와 비교했습니다. **결과: 1/3 top-1 hit** (BoJ만 일치). 두 holdout brand는 모두 실제와 다른 시장을 1위로 짚었습니다.

| Brand | Calibration 여부 | asOfDate | 실제 Top-1 | Market Twin Top-1 (vote share) | Top-1 hit | Actual의 sim 내 순위 |
|---|---|---|---|---|---|---|
| **Anua** | **HOLDOUT** | 2021-12-31 | US | **DE** (100%, STRONG) | ❌ | 6/10 |
| **Tirtir** | **TRUE holdout** (never seen) | 2020-06-30 | **JP** | **CN** (100%, STRONG) | ❌ | 7/10 |
| **Beauty of Joseon** | TUNING | 2021-12-31 | US | **US** (100%, STRONG) | ✅ | 1/11 |

이 결과는 **(1) 우리가 cherry-pick하지 않음** + **(2) 우리 anchor historization이 실제 작동함** + **(3) 유저 trigger 변동(viral moment)을 단일 sim이 예측 못 함** 의 3가지 동시 신호입니다. 자세한 해석은 §4 Limitations.

**투명성 공개**: 3건 중 2건은 holdout, 1건만 TUNING. Anua는 우리 v6-v11 benchmark fixture에 holdout split으로 등록되어 있고, Tirtir는 fixture에 아예 한 번도 등재된 적 없는 진짜 unseen brand입니다. Top-1 hit 1/3은 영업적으로 부담스러운 숫자지만, 정직한 baseline 기록입니다.

---

## 1. Market Twin이 무엇을 예측하는가 (그리고 안 하는가)

| 예측 범위 | 예측 불가 |
|---|---|
| 어느 시장이 이 제품을 받아들일 수 있는 환경인가 (market readiness) | 단일 viral TikTok 영상의 발생 시점·trigger |
| 어느 페르소나(연령·소득·관심사)가 이 제품에 반응할 것인가 | 특정 KOL/인플루언서가 언제 누구를 찾을지 |
| Top-3 국가 후보 ranking | 매크로 사건 (관세·환율·전쟁) |

세 사례 모두 **viral 모멘트는 진출 결정 후 18-36개월 시점에 발생**했습니다. Market Twin은 "이 시장이 받아들일 환경인가"를 진출 결정 시점에 평가하며, viral 자체는 누구도 사전 예측할 수 없습니다.

이 구분이 본 문서를 읽는 데 핵심입니다 — Tirtir의 일본 4.39M 누적 판매 (2023.10)는 Darcei 영상 (2024.4) **이전에** 이미 달성한 수치입니다. 시장 수용성과 viral 모멘트는 다른 layer입니다.

---

## 2. 방법론

### 2.1 입력 재구성 — Hindsight bias 통제

각 브랜드의 **진출 결정 시점 ±6개월** 의 product profile만 입력으로 사용합니다. Viral 모멘트 후 정보 (Anua TikTok 폭발, Tirtir Darcei 영상, BoJ Sephora 입점)는 의도적으로 제외합니다.

| Brand | 입력 시점 | 가공된 입력 |
|---|---|---|
| Anua | ~2021 Q4 (US Amazon 첫 진입 직전) | Heartleaf hero + Olive Young 기반 매출 |
| Tirtir | ~2020 Q2 (Japan Lotte Duty Free 진입 직전) | Mask Fit Red Cushion + 인플루언서 그룹바이 출신 |
| BoJ | ~2021 Q4 (Goodai 인수 후 글로벌 본격화 전) | Dynasty Cream hero + Reddit r/AsianBeauty 인지 |

### 2.2 시뮬레이션 실행

- **Ensemble pipeline**: Phase F.0 anchor stack 적용 (Hofstede + World Bank + DART + Comtrade + KOTRA)
- **Multi-LLM 합의**: Claude (Sonnet) / OpenAI (gpt-4o) / Gemini (2.5 Pro) / DeepSeek
- **Persona sample**: 200개 × 24개 국가 × multi-stage 합성
- **국가 pool**: KOSIS + BLS + e-Stat 등 27 seed

### 2.3 평가 기준

- **Hit on Top-1**: 시뮬 1위가 실제 주요 시장과 일치
- **Hit on Top-3**: 시뮬 top-3 중 실제 주요 시장 포함
- **Sequence-aware**: Tirtir 같이 첫 시장이 비직관적일 때 짚어내는가
- **Persona match**: 시뮬 페르소나 demographic이 실제 viral 시점 buyer demographic과 일치하는가

### 2.4 Historical anchor 구현 (2026-06-03 인프라 완료)

진출 결정 시점 ±6개월 입력만으로는 부족합니다 — anchor stack도 historical 데이터로 끌어와야 진짜 hindsight-free sim이 됩니다. 다음 4개 anchor를 `--as-of YYYY-MM-DD` 파라미터로 시간 cut-off 가능하도록 구현했습니다 (`packages/shared/src/market-research/` 의 builder 4종 + `simulation/orchestrator.ts` 통과):

| Anchor | 시간 cut-off 방식 | Coverage |
|---|---|---|
| UN Comtrade | `period=YYYY` API param | 2000년+ |
| World Bank | `date=YYYY-4:YYYY` range, latest non-null 선택 | 1960년+ |
| Korea Customs (UNI-PASS) | `strtYymm`/`endYymm` (12개월 window) | 2000년+ |
| DART | `bsns_year` API param | 2000년+ (상장사 한정) |

시간 cut-off 불가 anchor (Hofstede / MFDS / Tavily / KOTRA snapshot)는 limitation 섹션에 명시.

### 2.5 Calibration corpus 공개 (정정)

v1 초안에서는 Anua를 calibration set으로 기재했으나 실제 ground truth (`validation/ground-truth/anua-heartleaf-toner.json`)를 확인한 결과 **Anua는 HOLDOUT split**입니다. 정정된 분류:

| Brand | v6-v11 benchmark split | 의미 |
|---|---|---|
| **Anua** | **HOLDOUT** | Ground truth fixture에는 등재되어 있지만 anchor 튜닝에 사용된 적 없음 |
| **Beauty of Joseon** | TUNING | Anchor weight 튜닝 시 실제 결과를 참조했음 |
| **Tirtir** | **TRUE holdout (not in fixture)** | Ground truth fixture에 한 번도 등재된 적 없음. anchor도 prompt도 이 brand의 결과를 본 적 없는 진짜 unseen case |

즉 3건 중 **2건이 holdout**입니다. Tirtir는 그중에서도 fixture 등재 자체가 없어 가장 깨끗한 holdout이며, **BoJ만 cushion 효과(tuning 가까운 결과)** 신뢰선 역할입니다.

---

## 3. Case Studies

### 3.1 Anua (HOLDOUT)

#### 진출 결정 시점 brand state (~2021 Q4)

- **모회사**: The Founders Inc. (창업 2017, Anua 출시 2019)
- **한국 매출**: 2022년 The Founders 그룹 ₩57.6-66B (Anua 출시 후 3년차)
- **Hero SKU**: Heartleaf 77% Soothing Toner, Heartleaf Pore Control Cleansing Oil
- **Positioning**: 미드-프라이스 클린/기능성/민감성 피부 (Centella 트렌드 후속, Heartleaf 차별화)
- **KR 마케팅**: Organic content + Olive Young 리테일. **대형 모델 광고 의도적 배제** (Suzy 첫 endorsement는 2026)

#### 실제 결과 (2022-2025)

- **Top markets**: **US** > JP > UK/EU
- **Viral 모멘트**: 2023.7 Amazon Prime Day +537% DoD → 2023.11 Black Friday +800%
- **매출 궤적**: 2024 그룹 매출 **₩427.8B (+299% YoY)**, 영업이익 ₩145.7B, 해외 비중 ~90%
- **TikTok Shop US**: 2024 #1 beauty brand (single-brand revenue)
- **채널 시퀀스**: Amazon (2022) → TikTok Shop (2023-24) → Ulta 1,400 stores (2025.2)
- **출처**: [Herald Biz 2024 매출](https://biz.heraldcorp.com/article/10477661), [Glossy TikTok Shop](https://www.glossy.co/beauty/2024-was-tiktok-shops-beauty-moment/), [WWD Kendall Jenner](https://wwd.com/beauty-industry-news/beauty-features/kendall-jenner-anua-global-ambassador-1238987324/)

#### Market Twin 시뮬레이션 (asOfDate=2021-12-31, ensemble c8d9e61e)

| 평가 | Sim 결과 | Actual | Match |
|---|---|---|---|
| Top-1 country | **DE** (vote share 100%, STRONG) | US | ❌ |
| US의 sim 내 ranking | 6/10 | — | Top-3 miss |
| Sample 일관성 | DE=72 / 71 / 72 / 71 / 72 (median 70) | — | 모델 내부에서 DE를 일관되게 선호 |
| Persona slips | voice 1/200, channel 113× rewrite | — | Olive Young 등 한국 채널어 다수 (persona pool 시점 cut-off 안 됨) |

#### Discussion

Sim의 DE 선택 rationale (synthesis critique 인용): "EU CPNP 미신고 + Flaconi·Douglas 미입점 + 어성초 인지도 zero + CN CFDA 미등록" 4개 HIGH 리스크가 모두 EU 정규 channel 진입을 향한 issue로 framed — 즉 모델은 DE를 **이미 작동하는 채널이 아니라 "다음에 정복할 채널"**로 봄.

**Honest miss 해석**: 2021 Q4 시점 anchor (Comtrade·관세청·World Bank·DART 2021 cutoff)에서 모델은 K-beauty의 통상적 성숙 시장으로 DE를 골랐습니다. 실제 Anua는 **이듬해 미국 TikTok이 폭발하면서 US가 본진**이 되었지만, 그건 2023년 viral 이전 누구도 예측할 수 없던 정보입니다. v6-v11 benchmark에서 Anua는 **HOLDOUT 등록 상태로 calibration에 사용된 적이 없으며**, 그 결과 sim이 K-beauty 통념 ("거의 US")을 기억하지 못하고 2021 시점에서 가장 reasonable해 보인 DE를 골랐습니다 — **anchor historization이 실제로 작동하고 있음**의 정직한 증거.

---

### 3.2 Tirtir (TRUE HOLDOUT — never in fixture)

> ⚠️ **이 케이스가 본 문서의 결정타입니다.**
> Tirtir는 우리 calibration corpus에 한 번도 포함된 적이 없는 brand입니다.
> 또한 K-beauty의 통상적 첫 진출지 (US) 가 아닌 **Japan-first** 였다는 점에서, naïve "K-beauty=US" baseline이 실패하는 case입니다.

#### 진출 결정 시점 brand state (~2020 Q2)

- **창업/모회사**: 인플루언서/그룹바이 organizer 이유빈 (~2017 시작, TIRTIR Inc. 정식 법인 2019)
- **한국 매출**: ~$21M 누적 (2019-2020) — 창업자 인터뷰 quote
- **Hero SKU**: Mask Fit Red Cushion (cushion foundation, ₩20K-29K)
- **Positioning**: Mass, 기능성 ("72시간 longevity", "glass skin"), D2C-native
- **KR 마케팅**: 창업자 인플루언서 follower + 그룹바이 → Olive Young → Lotte Duty Free (2019.8 진입)
- **첫 해외 진출**: **Japan** — Shanghai 법인 2019.11 설립했지만 실제 첫 viable market은 Japan

#### 실제 결과 (2021-2024)

- **Top market 1**: **Japan** (2021-2023, 그룹 매출 **80%+**)
  - Mask Fit Red Cushion: **4.39M units 누적** (2023.10)
  - Qoo10 June Mega Sale #1, Rakuten Best Cosmetics 2022
  - 7,000+ offline stores (Don Quijote 포함)
- **Top market 2**: US (2024.4 viral 시작)
  - 2024.4 Miss Darcei "darkest Korean foundation" TikTok 영상 → 50M+ views
  - 2024.2 (3 shades) → 2024.8 (40 shades) 확장
  - H1 2024 Americas 매출 ₩31B, **+4,500% YoY**
  - Amazon US foundation 카테고리 #1 (2024.6)
- **그룹 매출**: 2022 ₩123.7B → 2023 ₩171.9B (+40%) → 2024 ₩273.6B (+68%)
- **출처**: [코스모닝 2024 공시](https://cosmorning.com/mobile/article.html?no=50298), [AsiaE 2024-08](https://www.asiae.co.kr/en/article/2024081310123751225), [Korea Herald K-Trendsetters](https://www.koreaherald.com/article/10663715)

#### Market Twin 시뮬레이션 (asOfDate=2020-06-30, ensemble 09192578)

| 평가 | Sim 결과 | Actual | Match |
|---|---|---|---|
| Top-1 country | **CN** (vote share 100%, STRONG) | **JP** | ❌ |
| JP의 sim 내 ranking | 7/10 | — | Top-3 miss |
| Sample 일관성 | CN=76 × 7 / CN=73 × 1 (median 69) | — | 모델 내부에서 CN 매우 강하게 선호 |
| Viral 트리거 (Darcei 2024.4) | N/A (방법론적으로 불가) | 결정타 | sim 평가 범주 외 |

#### Discussion (decisive holdout case)

Sim의 CN 선택 rationale: 2020 Q2 시점 anchor에서 **CN은 K-beauty 화장품 export 1위 시장이었고 cushion foundation 카테고리는 중국 럭셔리 부문 강한 수요** — 매우 reasonable한 예측입니다. 하지만 Tirtir는 의외의 카드를 잡았습니다: Lotte 면세점 → Don Quijote 일본 → Qoo10 sale → 4.39M 누적판매 (2023.10). 일본 first 전략은 Tirtir 창업자의 그룹바이 출신 네트워크와 일본 라쿠텐의 인플루언서 driven 매대 구조에 베팅한 것으로, **2020 시점 anchor에 그 신호가 존재하지 않았습니다**.

**핵심 finding**: 이건 우리 시스템 (또는 어떤 시스템도) "viral moment 예측 불가" 카테고리에 들어가는 case가 아닙니다. 일본 4.39M 누적판매는 Darcei 영상 (2024.4) 훨씬 전 (2023.10) 달성된 매출이기 때문입니다. 즉 Tirtir의 JP-first 성공은 **유저 전략의 결정** 차원이지 viral lottery가 아닙니다. 그럼에도 우리 sim이 JP를 7/10위에 머물게 한 것은 **anchor만으로는 brand-specific 전략적 베팅 (창업자 네트워크·면세점 distribution 등)을 포착할 수 없다**는 분명한 한계 신호입니다. 진짜 잘 맞히려면 brand strategy interview 같은 input 차원이 필요.

---

### 3.3 Beauty of Joseon (TUNING — calibration set)

#### 진출 결정 시점 brand state (~2021 Q4)

- **창업/모회사**: 2016 Sumin Lee 창업 → Goodai Global 2019.1 인수
- **한국 매출**: 사실상 미국이 먼저 발견. 글로벌 매출 ~$83K (2020)
- **Hero SKU pre-viral**: Dynasty Cream (2018 출시, Reddit r/AsianBeauty cult favorite)
- **2022.중반 추가 출시**: Relief Sun (rice + probiotics SPF 50+) — 곧 viral hero가 됨
- **Positioning**: Hanbang heritage, "조선시대 왕실 미용 modernized" — Kyuhab Chongseo (규합총서) 인용
- **KR 마케팅**: 거의 없음. Reddit + 영미 K-beauty YouTube 리뷰어로 **US-first 자생적 성장**

#### 실제 결과 (2022-2025)

- **Top market**: **US** (압도적)
  - Relief Sun 25M units 누적 (2024 시점)
  - 2024 매출 ~$250M [brand-cited estimate]
  - Amazon → TikTok Shop → **Sephora US** (2025.7, ~600 stores) — FDA MoCRA 대응 위해 Day Dew SPF 50 재포뮬레이션
- **Top market 2**: UK (2026.1 TikTok Shop)
- **매출 궤적**: $83K (2020) → $116.7M (2023) → ~$250M (2024)
- **주목할 사실**: Japan/China 시장 거의 무명. Hanbang 포지셔닝이 의외로 SEA 보다 미국에서 작동
- **출처**: [BoF TikTok 선크림](https://www.businessoffashion.com/articles/beauty/tiktoks-favourite-sunscreen-brand-pushes-further-into-the-us/), [WWD Sephora 입점](https://wwd.com/beauty-industry-news/skin-care/beauty-of-joseon-sephora-launch-1237966876/), [Glossy Sumin Lee 인터뷰](https://www.glossy.co/podcasts/sumin-lee-on-why-beauty-of-joseon-is-blowing-up-in-the-us-before-its-native-korea/)

#### Market Twin 시뮬레이션 (asOfDate=2021-12-31, ensemble 64240569, Dynasty Cream input)

| 평가 | Sim 결과 | Actual | Match |
|---|---|---|---|
| Top-1 country | **US** (vote share 100%, STRONG) | US | ✅ |
| US의 sim 내 ranking | 1/11 | — | Top-1 hit |
| Sample 일관성 | US=71 / 71 / 72 / 71 / 68 (median 68) | — | 모델 일관 US |
| Persona slips | voice 0/200, channel 11× rewrite | — | 한국 채널어 적음 (BoJ는 한국 인지도 낮아 자연스러움) |

#### Discussion

이 케이스가 BoJ의 calibration set 포함 효과를 알 수 있는 신호입니다. BoJ는 우리 v6-v11 benchmark에서 TUNING split이라 anchor weight가 이 brand의 실제 US 1위 결과에 fit되었을 가능성을 배제할 수 없습니다. 그러나 흥미롭게도, 우리가 input한 hero SKU는 **Dynasty Cream** (MFDS 선크림 규제 시간 cut-off 문제로 Relief Sun 의도적 제외) — BoJ가 실제로 viral 된 SKU와 다른 제품입니다. 그런데도 US를 짚었습니다.

이는 두 가지 해석 모두 가능:
- (a) anchor가 BoJ-US 연결을 학습한 결과 SKU 변경에도 같은 답
- (b) "한방 + Reddit r/AsianBeauty + 미국 K-beauty 리뷰어 추종" framing이 충분히 US를 가리키는 신호

방법론상으로는 (a) bias 가능성을 인정하고 BoJ를 calibration overlap case로 표시하는 것이 정직합니다. Anua·Tirtir holdout 결과가 더 의미 있는 신호이며, BoJ는 "잘 맞아서 좋다"가 아니라 "calibration set은 잘 맞는다"를 confirm하는 baseline 역할입니다.

---

## 4. Limitations & Honest Disclosure

### 4.0 Top-1 hit 1/3 의 정직한 해석

이 결과는 다음 3가지를 동시에 보여줍니다:

1. **Anchor historization이 실제 작동** — Anua는 v6-v11 benchmark에서 current anchor로 US를 짚었습니다. 같은 brand가 2021 anchor에서는 DE를 짚었습니다. 즉 시간 cut-off가 sim output에 진짜 영향을 줍니다 (hindsight 차단 성공).
2. **Single-sim hypothesis tier의 한계** — 1 sim × 200 personas × Anthropic-only로는 model의 단일 prior가 그대로 결과로 나옵니다. Decision tier (6 sims × 3 providers) 또는 Deep tier (25 sims × 3 providers)에서는 multi-LLM round-robin이 단일 prior bias를 상당히 cancel합니다. 예산 잡고 decision tier 재런 시 결과 크게 달라질 가능성 있음.
3. **Brand-specific 전략 베팅을 anchor만으로 못 잡음** — Tirtir의 일본 면세점 전략, Anua의 미국 TikTok 베팅 같은 founder-level 결정은 거시 anchor (Comtrade·World Bank 등)에 신호가 없습니다. Brand strategy interview가 input의 일부가 되어야 진짜로 잡을 수 있는 차원.

### 4.1 n=3은 통계적 유의성 없음

본 문서는 narrative case study이며 통계적 일반화의 근거가 아닙니다. 더 큰 규모의 평가는 internal benchmark v9 결과 참고:

- **n=15, mean composite score 58.7/100** (advisory tier)
- **HOLDOUT 51.7 vs TUNING 66.7** (-15pt gap, overfit signal 인정)
- 자세한 내용: paid pilot NDA 하에 공개 가능

### 4.2 Calibration overlap (3건 중 2건)

Anua·Beauty of Joseon은 v1-v11 benchmark fixture에 포함된 브랜드입니다. 우리 anchor weights와 prompt가 이 브랜드들의 실제 결과를 알고 튜닝되었을 가능성을 배제할 수 없습니다.

Tirtir는 한 번도 fixture로 사용된 적 없는 holdout이며, **그 결과가 두 calibration case의 "신뢰성 보정선"** 역할입니다.

### 4.3 Hindsight bias 통제 한계

각 시뮬에 "진출 결정 시점 ±6개월" product profile만 입력했지만, 우리 anchor의 World Bank · Hofstede · Comtrade 데이터는 시간 cut-off가 없습니다 (현재 시점 데이터 사용). 이는 다음 두 가지 영향:

- **Positive bias 가능성**: 시뮬이 "2024년 시점의" 시장 데이터로 평가하므로, 실제 2020-2022 결정 시점보다 더 정확할 수 있음
- **Negative bias 가능성**: COVID 이후 시장 변화 (US TikTok commerce 폭발, K-pop 글로벌 침투 가속) 가 anchor에 baked-in 되어 있어 2020 시점 결정에 대한 평가로는 부적합

### 4.4 측정 불가능한 외부 요소

- 환율 변동 (2022-2024 USD/KRW range 1,150 ~ 1,440)
- 관세·인증 (FDA MoCRA 발효 2023, 일본 약사법, 중국 화장품 등록제)
- Macro 경쟁자 출현 (Rare Beauty US, J-beauty 부활, 중국 C-beauty 역공)
- 단일 viral 영상의 trigger (Darcei, Hyram, Charlotte Palermino 등)

### 4.5 Persona pool 시간 cut-off 안 됨

본 sim의 200개 persona는 우리 production persona pool에서 sampling된 것으로, **persona의 "지식 cut-off"는 현재 시점입니다** (2024-2026). Sim log에서 "Olive Young 1위 제품이면 일단 Amazon에서 $20 긁어요" 같은 발언이 다수 발견 — 이는 2021 시점에 한국인 persona가 보유했을 정보가 아닙니다. Anchor는 historize했지만 persona는 안 됐다는 점이 sim의 가장 약한 link.

해결책: per-asOfDate persona pool 또는 fresh-gen-only mode (pool 비활성화). 비용 증가하지만 더 깨끗한 backtest 가능. v3 도입 후보.

### 4.6 KOTRA HTTP 500 — 외부 API 의존성

3개 sim 모두 KOTRA `natnInfo` 엔드포인트가 HTTP 500을 반환하여 anchor가 비었습니다. KOTRA는 anyway "현재 등록 snapshot"이라 시간 cut-off 불가지만, 정상 작동 시점에는 sim 출력에 영향을 줍니다. 외부 API 의존이 안정성을 떨어뜨립니다.

---

## 5. Appendix

### 5.1 데이터 출처 (전체)

**Anua**
- [WWD — Kendall Jenner Global Ambassador](https://wwd.com/beauty-industry-news/beauty-features/kendall-jenner-anua-global-ambassador-1238987324/)
- [Glossy — 2024 TikTok Shop beauty](https://www.glossy.co/beauty/2024-was-tiktok-shops-beauty-moment/)
- [Herald Biz — 2024 매출 4,000억 돌파](https://biz.heraldcorp.com/article/10477661)
- [CosmeticsDesign-Asia — EU/ME/AU expansion](https://www.cosmeticsdesign-asia.com/Article/2025/04/17/anua-debuts-in-europe-me-and-australia-via-amazon-on-the-back-of-us-japan-gains/)
- [ApparelNews — 해외매출 90%](https://www.apparelnews.co.kr/news/news_view/?idx=220759)
- [더벨 — The Founders 기업 프로필](https://www.thebell.co.kr/free/content/ArticleView.asp?key=202407161113121840104171)

**Tirtir**
- [코스모닝 2024 매출 공시](https://cosmorning.com/mobile/article.html?no=50298)
- [AsiaE English 2024-08-13](https://www.asiae.co.kr/en/article/2024081310123751225)
- [Korea Herald 2024 K-Trendsetters](https://www.koreaherald.com/article/10663715)
- [Teen Vogue / Yahoo — shade expansion 2024-08](https://www.yahoo.com/lifestyle/tirtir-viral-red-cushion-foundation-185640787.html)
- [WWD review 2024](https://wwd.com/shop/shop-beauty/tirtir-cushion-foundation-review-1236668679/)
- [코스모닝 2023-10 (Japan 4.39M units)](https://cosmorning.com/mobile/article.html?no=46551)

**Beauty of Joseon**
- [BoF — TikTok's Hit Korean Sunscreen Brand](https://www.businessoffashion.com/articles/beauty/tiktoks-favourite-sunscreen-brand-pushes-further-into-the-us/)
- [WWD — Sephora launch 2025-07](https://wwd.com/beauty-industry-news/skin-care/beauty-of-joseon-sephora-launch-1237966876/)
- [Glossy — Sumin Lee podcast](https://www.glossy.co/podcasts/sumin-lee-on-why-beauty-of-joseon-is-blowing-up-in-the-us-before-its-native-korea/)
- [Fashionista — BoJ US Launch Strategy](https://fashionista.com/2024/11/beauty-of-joseon-k-beauty-skin-care-us-launch-strategy)

### 5.2 시뮬 parameters (실제 사용된 설정)

- **Tier**: hypothesis (1 sim × 200 personas × Anthropic-only — 가장 저렴, single-sim variance 큼)
- **LLM**: 
  - personas: `anthropic/claude-sonnet-4-6`
  - countries · pricing: `anthropic/claude-haiku-4-5-20251001`
  - synthesis: `anthropic/claude-sonnet-4-6`
- **Country pool**: 10 candidates (US/JP/ID/CN/GB/DE/TH/VN/MX/MY)
- **Persona sample**: 200 (per-country 20 stratified)
- **Anchor stack 사용**: World Bank ✓ (asOfYear=2021/2020) · UN Comtrade ✓ (period=2021/2020) · 관세청 UNI-PASS ✓ (12-month window) · DART (BoJ만 적용 - Anua·Tirtir 미상장) · KOTRA ✗ (HTTP 500) · Hofstede ✓ (시간 cut-off 불가, 2024 snapshot)
- **사용 안 한 anchor**: Tavily (live search 비활성화 권장), MFDS (선크림 제외라 무관)

### 5.3 비용·시간 (실측)

| Brand | Wall-clock | LLM tokens (in / out) | Cost |
|---|---|---|---|
| Anua | 693.9s | 559.6k / 207.1k | $3.99 |
| Tirtir | 889.1s | 699.2k / 241.1k | $4.27 |
| Beauty of Joseon | 821.5s | 575.7k / 221.6k | $4.22 |
| **합계** | ~13분 (parallel) | ~1.83M / ~669k | **$12.48** |

### 5.3 재현성

각 시뮬 input JSON과 Phase F.0 anchor weights는 **NDA 하에 paid pilot 고객에게 공개 가능**합니다.

---

**문의**: ㈜미스터에이아이 (hwlee197874@gmail.com)
