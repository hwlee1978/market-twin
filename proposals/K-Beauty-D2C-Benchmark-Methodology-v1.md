# K-Beauty D2C 해외 출시 결과 vs Market Twin 시뮬레이션 비교 (v1)

> **Status**: Phase A research + Phase B.1 anchor historization 인프라 완료. Phase B.2 (실제 sim 재런, LLM 비용 발생) pending user authorization.
>
> **Document version**: v1 (research + infra; sim 결과 미반영)
> **Owner**: ㈜미스터에이아이
> **Last updated**: 2026-06-03

---

## TL;DR

3건의 한국 D2C 뷰티 브랜드 해외 출시 사례를 Market Twin 시뮬레이션 결과와 비교했습니다.

| Brand | Calibration 여부 | 실제 Top market | Market Twin 예측 |
|---|---|---|---|
| **Anua** | Calibration set | US > JP > UK | _Phase B에서 채움_ |
| **Tirtir** | **HOLDOUT** (한 번도 fit한 적 없음) | **JP** (2021-2023) → US (2024) | _Phase B에서 채움_ |
| **Beauty of Joseon** | Calibration set | US (압도) > UK | _Phase B에서 채움_ |

**투명성 공개**: 3건 중 2건은 우리 calibration corpus에 포함된 브랜드입니다. Tirtir만 한 번도 시뮬 결과에 fit한 적 없는 holdout이며, **JP-first** 라는 비직관적 정답을 짚어내는지가 진짜 test입니다.

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

### 2.5 Calibration corpus 공개

| Brand | v1-v11 benchmark fixture 포함? | 의미 |
|---|---|---|
| Anua | Yes (v6 ~ v11) | Anchor 튜닝 시 이 브랜드의 실제 결과 사용됨 |
| Beauty of Joseon | Yes (v1 ~ v11) | 동일 |
| Tirtir | **No** | 한 번도 시뮬 결과 평가/튜닝에 사용된 적 없음 |

본 문서를 읽는 분께: Tirtir의 결과를 두 calibration case의 "신뢰성 보정선"으로 사용해 주시기 바랍니다. Anua·BoJ가 잘 맞아도 Tirtir가 틀리면 우리 시스템의 일반화 한계를 시사합니다.

---

## 3. Case Studies

### 3.1 Anua (Calibration set)

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

#### Market Twin 시뮬레이션 (Phase B 채울 예정)

| 평가 | Predicted | Actual | Match |
|---|---|---|---|
| Top-1 country | _TBD_ | US | _TBD_ |
| Top-3 ranking | _TBD_ | US, JP, UK | _TBD_ |
| Persona 주요 demo | _TBD_ | 20-30 여성, 민감성/지성, TikTok 사용자 | _TBD_ |
| Hero SKU 반응 | _TBD_ | Cleansing Oil > Toner | _TBD_ |

#### Discussion (Phase B 후 채움)

_TBD — 시뮬 결과 분석 + miss 케이스 정직 보고_

---

### 3.2 Tirtir (HOLDOUT — 진짜 테스트)

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

#### Market Twin 시뮬레이션 (Phase B 채울 예정)

| 평가 | Predicted | Actual | Match |
|---|---|---|---|
| Top-1 country (~2020 Q2 input) | _TBD_ | **Japan** | _TBD — JP면 strong win, US면 honest miss_ |
| Top-3 ranking | _TBD_ | JP, US, (KR domestic) | _TBD_ |
| Hero SKU 반응 (cushion in JP) | _TBD_ | Red Cushion viral in JP | _TBD_ |
| Viral 트리거 예측 가능? | N/A (방법론적으로 불가능) | Darcei 영상 2024.4 | 명시적 N/A |

#### 해석 가이드

- **If Sim says "Japan #1"**: Market Twin이 naïve "K-beauty=US" stereotype을 깨고 일본 시장 수용성을 짚어냄. Strong evidence of actual market understanding.
- **If Sim says "US #1"**: 우리 시스템이 K-beauty 통념에 빠진 것. 정직하게 miss로 보고. 단, Top-3에 일본이 포함되어 있다면 부분 cred.
- **2024 viral 트리거 예측**: 방법론상 불가능. 평가 항목 아님.

#### Discussion (Phase B 후 채움)

_TBD_

---

### 3.3 Beauty of Joseon (Calibration set)

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

#### Market Twin 시뮬레이션 (Phase B 채울 예정)

| 평가 | Predicted | Actual | Match |
|---|---|---|---|
| Top-1 country | _TBD_ | US | _TBD_ |
| Top-3 ranking | _TBD_ | US, UK, (KR domestic 무시) | _TBD_ |
| Persona 주요 demo | _TBD_ | 25-40 여성, skincare enthusiast, Reddit/Hyram-style 추종 | _TBD_ |
| Hero SKU 반응 | _TBD_ | Relief Sun viral, Dynasty Cream 꾸준 | _TBD_ |
| **Japan/China 비반응 예측?** | _TBD_ | 양 시장 모두 무명 | _TBD — 흥미로운 negative test_ |

#### Discussion (Phase B 후 채움)

_TBD_

---

## 4. Limitations & Honest Disclosure

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

### 5.2 시뮬 parameters

- LLM ensemble: Claude (Sonnet) + OpenAI (gpt-4o) + Gemini (2.5 Pro) + DeepSeek
- Country pool: 24 (KOSIS · BLS · e-Stat + 21 추가 seed)
- Persona sample: 200 (stratified by income · age · country)
- Anchor stack: Hofstede + World Bank + DART + Comtrade + KOTRA (Phase F.0)

### 5.3 재현성

각 시뮬 input JSON과 Phase F.0 anchor weights는 **NDA 하에 paid pilot 고객에게 공개 가능**합니다.

---

**문의**: ㈜미스터에이아이 (hwlee197874@gmail.com)
