# K-Beauty D2C Hypothesis-tier 결과 Postmortem

> Companion to `K-Beauty-D2C-Benchmark-Methodology-v2.md`.
> Focused root-cause speculation on **왜 hypothesis tier 가 1/3 top-1 hit 만 보였는가**.
> Decision tier 6×3 LLM 재런 결과는 별도 v3 부록에서 비교.
>
> **Date**: 2026-06-03
> **Owner**: ㈜미스터에이아이

---

## TL;DR

3개 brand × asOfDate vintage input × hypothesis tier (1 sim × 200 personas × Anthropic-only) 실측 결과:

```
Anua    (HOLDOUT)         2021-12-31  →  Sim: DE  |  Actual: US  ❌ (US rank 6/10)
Tirtir  (TRUE holdout)    2020-06-30  →  Sim: CN  |  Actual: JP  ❌ (JP rank 7/10)
BoJ     (TUNING)          2021-12-31  →  Sim: US  |  Actual: US  ✅ (US rank 1/11)
```

이 결과의 root cause 추정은 **세 가지가 동시 작용**입니다:

1. **단일 LLM prior가 dominate** (Anthropic만 사용 → multi-LLM averaging 부재)
2. **Anchor에 brand-specific 전략 신호 없음** (founder network·면세점·viral lottery는 거시 anchor에 없음)
3. **Persona pool이 시간 cut-off 안 됨** (2024 시점 K-beauty 인식이 backtest에 누수)

가장 큰 단일 원인은 **(1)** 으로 추정. Decision tier (6 sim × 3 providers) 가 multi-LLM round-robin으로 single-prior bias를 cancel하면 Anua·Tirtir 중 적어도 한 건은 결과가 바뀔 가능성 있음.

---

## 1. Per-brand analysis

### 1.1 Anua → DE 추정 root cause

**Sim 추론 패턴 (synthesis critique에서 추출):**
> "EU CPNP 미신고 + Flaconi·Douglas 미입점 + 어성초 인지도 zero + CN CFDA 미등록"

→ 4개 HIGH 리스크가 **모두 EU/CN 입점 issue**입니다. 즉 모델은 DE를 "이미 정복한 시장"이 아니라 **"다음에 정복할 시장"** 으로 framed.

**왜 DE?:**
- 2021 Q4 anchor 상태:
  - **Comtrade 2021**: Korea→DE K-beauty (HS 3304) 흐름이 상위권 (US TikTok viral 전이라 US 신호 상대적으로 약함)
  - **World Bank 2021**: DE 가계소비 PPP가 candidate countries 중 상위 (시장 규모 anchor)
  - **DART**: Anua 미상장 → empty (브랜드별 매출 신호 없음)
- 모델 reasoning: 어성초 = 과학적 ingredient → "DE 소비자가 가장 받아들일" framing
- "Olive Young EU pipeline + dm-Drogerie" 같은 mid-2010s K-beauty EU 인프라가 anchor에 잔재

**왜 US 못 짚었나:**
- US TikTok viral (2023.7+)는 2021 anchor에 신호가 거의 없음
- Anua는 2021년 9월 Amazon US 진입했지만 매출은 2022까지 미미 → trade flow에 안 잡힘
- 모델이 본 "기존 K-beauty US 통계"는 별로 매력적이지 않은 미국 시장 (라네즈·아모레 정도)

**검증 가능한 hypothesis:**
- Decision tier multi-LLM이면 OpenAI/DeepSeek은 다른 prior → 합의 결과 변동
- DeepSeek은 중국 시장에 강한 prior 있을 가능성 (CN 짚을 수 있음)
- OpenAI는 US 시장 보편적 prior (US 짚을 가능성)

### 1.2 Tirtir → CN 추정 root cause (decisive case)

**Sim 추론 패턴:**
- 8 samples × CN=76, CN=73 — median 69
- HIGH 리스크 3개: **NMPA(중국) 등록 미완료 + JAKIM Halal 부재 + 72시간 임상 부재**
- "JAKIM Halal" 언급 → 모델이 인도네시아도 고려했음 (Tirtir 후보 시장에 ID 포함)

**왜 CN?:**
- 2020 Q2 anchor 상태:
  - **Comtrade 2020**: Korea→CN cushion foundation (HS 3304.99) 흐름이 압도적 1위 (광군절 전후 매년 폭발)
  - **관세청 2020년 12개월**: 한국 화장품 수출 CN > US (pre-COVID 시장 구조)
  - **World Bank 2020 CN**: GDP/cap + 인구로 가장 큰 가용 시장
- "Glass skin" 클레임 + cushion foundation = 2020년 시점 CN 럭셔리 + 트렌드 양쪽 신호 모두 부합
- DART Tirtir 미상장 → empty (브랜드 특이 정보 없음)

**왜 JP 못 짚었나 — 핵심 insight:**
- Tirtir의 일본 first 전략 (Lotte 면세점 → Don Quijote → Qoo10) 은 **창업자 이유빈의 그룹바이 네트워크 + 일본 인플루언서 마케팅 베팅**에서 나온 결정
- 이 brand-specific GTM 신호는 **어떤 거시 anchor에도 존재하지 않습니다**:
  - Comtrade: 카테고리 합산 무역, 브랜드 단위 아님
  - DART: 미상장
  - World Bank: 거시 지표
  - KOTRA: HTTP 500 + anyway snapshot
- 일본 면세점 채널의 cushion foundation 수요는 anchor에 잡히지 않는 niche
- → 모델이 합리적인 거시 추론을 했지만 brand-level 비밀 정보를 못 본 case

**검증 가능한 hypothesis:**
- Decision tier 결과: **JP가 top-1이 될 가능성 낮음** (anchor 신호 동일하므로). Top-3에 JP가 들어오면 partial credit.
- 진짜 JP 잡으려면 input에 "창업자 일본 인플루언서 네트워크 활용 가능" 같은 brand strategy 필드가 있어야 함.

### 1.3 BoJ → US 적중 (그러나 신중하게 해석)

**Sim 추론 패턴:**
- 5 samples × US=71 / 71 / 72 / 71 / 68 → median 68
- HIGH 리스크: "채널 공백 + FDA 미확인 + 다중 시장 등록 미완료" — 모두 US 진입 friction issue
- voice slip 0/200 (한국 채널어 거의 없음 — BoJ가 한국 인지도 낮은 인디라 persona 적합)
- "BPOM 인증" (인도네시아) top trust 28% — 인니에서도 US 만큼 강한 신호 있었음

**왜 US?:**
- 2021 Q4 anchor:
  - **Comtrade 2021**: BoJ는 미상장이라 brand-level 신호 없음
  - **DART**: empty (Goodai Global 미상장 시점)
  - **World Bank**: 일반 거시 지표
- 입력 description에 명시적 신호 — "Reddit r/AsianBeauty + Western K-beauty YouTube reviewers — minimal Korea domestic marketing"
- "조선 왕실 미용 modernized + Kyuhab Chongseo + 한방" = scientific + heritage 결합 → 영어권 K-beauty 콘텐츠 크리에이터의 narrative 부합
- Dynasty Cream (hero pre-Relief Sun) 입력 → 사실상 BoJ가 2021 시점 가지고 있던 진짜 hero에 가까움

**왜 잘 맞았는지의 honest 해석 — 두 가지 가능성:**
- **(a) Calibration overlap**: BoJ는 우리 TUNING split — anchor weight가 BoJ-US 연결을 학습했을 가능성. 단, 우리는 Relief Sun (실제 viral SKU)가 아닌 Dynasty Cream을 input했음에도 US를 짚음 — fit 효과만으로 설명 안 됨.
- **(b) Genuine signal**: BoJ의 description 자체가 "Reddit + Western 리뷰어" 라는 미국 시장 직접 단서를 포함 → 모델이 그 framing을 따른 합리적 추론.

이 케이스는 **(a) + (b) 결합**일 가능성이 가장 높습니다. Anua·Tirtir와의 차이를 만든 것은 **description-level signal의 강도** (BoJ가 Reddit/Hyram 언급으로 US를 직접 가리킴 vs Anua "Olive Young 1위 sensitive-skin" 은 시장 시그널 모호).

---

## 2. Cross-cutting patterns

세 case를 비교해 발견한 **공통 root cause 5가지**:

### 2.1 Single-LLM prior 우세 (가장 큰 단일 원인 추정)

Hypothesis tier는 1 sim × Anthropic-only. Anthropic Sonnet 4.6은 K-beauty 분야에서 특정 prior가 강합니다:
- 어성초/heartleaf → 유럽 (clean beauty / dermo) 으로 framing
- 쿠션 foundation → 중국 (광군절 BB 부흥)
- 한방 + 영어 콘텐츠 → 미국 (Reddit AsianBeauty)

Decision tier 의 3-provider round-robin (Anthropic 2 + OpenAI 2 + DeepSeek 2) 에서:
- DeepSeek은 중국 시장 prior 더 강할 가능성 (중국 회사)
- OpenAI는 미국 시장 보편 prior
- Anthropic prior가 1/3로 희석됨

→ **Anua는 Anthropic의 EU prior에 강하게 영향받음**으로 추정. Multi-LLM에서 합의 변동 가능성.

### 2.2 Brand-specific 전략을 anchor만으로 못 잡음

Tirtir 케이스가 결정적. Anchor 시스템 (Comtrade · World Bank · DART · 관세청 · Hofstede)은 모두 **거시·산업 단위** 데이터입니다. 다음 brand-level 결정 변수는 anchor에 잡히지 않습니다:

- 창업자의 개인 네트워크 (이유빈 → 일본 인플루언서)
- 채널 우선순위 결정 (Lotte 면세점 → 도쿄 Don Quijote)
- 인플루언서 marketing 베팅 (Anua → US TikTok 콘텐츠 크리에이터)
- 광고 모델 timing (Anua Kendall Jenner 2026)

해결책 후보:
- Brand strategy interview input field (founder network · 채널 우선순위 · 마케팅 베팅)
- LinkedIn / 네이버 카페 / 인스타그램 분석 anchor 추가
- 인플루언서 KOL 그래프 anchor

### 2.3 DART empty for indie/unlisted brands

3 brand 중 **2 brand (Anua, Tirtir)는 모회사 미상장**이라 DART anchor가 비었습니다:
- Anua: The Founders Inc 미상장 (2026 시점에도)
- Tirtir: 2024.4 Hahm/Gudai PE 인수 — 그 전엔 그냥 founder-owned 비상장

DART는 한국 상장사 매출 기반 brand-level grounding이라, **indie/스타트업 brand에는 자체적으로 적용 불가**. 이게 anchor 신호가 약해지는 원인.

해결책 후보:
- 비상장 brand용 매출 추정 anchor (스타트업 IR 자료, VC pitch deck DB, 등)
- 트래픽/소셜 미디어 follower count anchor

### 2.4 Persona pool 시간 cut-off 안 됨 — 정보 누수

Sim log에서 persona 발언:
- "Olive Young 1위 제품이면 일단 Amazon에서 $20 긁어요" (2024+ K-beauty 인식)
- "BPOM 인증 확인 후 신뢰" (post-2023 인니 화장품 규제 인식)
- "EU CPNP 미신고" (2024+ MoCRA·CPNP 인식)

200 personas는 우리 production pool에서 sampling되며, **2024-2026 시점의 K-beauty 인식**을 가집니다. Anchor는 2020-2021에 cut-off 했지만 persona는 그대로 → **시점 mismatch**.

이게 anchor의 hindsight-free 효과를 부분 무력화. Persona가 "Anua = Olive Young 1위 + Amazon 베스트셀러" 를 알고 있으면 anchor가 뭐라 하든 결과에 영향.

해결책 후보:
- Per-asOfDate persona pool 분리
- Persona description에 시점 framing ("당신은 2021년 12월의 ___ 입니다")
- Fresh-gen-only mode (pool 비활성화, 비용 증가)

### 2.5 KOTRA HTTP 500 — 외부 API 불안정성

3 sim 모두 KOTRA anchor가 빈 채로 실행됐습니다 (HTTP 500). KOTRA는 anyway snapshot-only라 시간 cut-off가 불가하지만, 정상 작동 시 brand-level export 신호 보완. 외부 API 의존이 sim 안정성을 떨어뜨림.

해결책: KOTRA 결과를 캐시 + retry-with-exponential-backoff (이미 일부 구현됐을 수 있음)

---

## 3. Decision tier 가 무엇을 바꿀 수 있는가 (예측)

| Brand | Hypothesis (현재) | Decision tier 예측 | 변동 가능성 |
|---|---|---|---|
| Anua | DE (Anthropic prior 우세) | Anthropic 2 + OpenAI 2 + DeepSeek 2 합의 → US 또는 JP로 이동 가능성 | **HIGH** — provider별 prior 분산 효과 |
| Tirtir | CN (거시 anchor만으로는 합리적 추론) | 동일 anchor 정보 → 여전히 CN 우세 가능성 / JP top-3 진입 가능성 | **LOW** — 같은 anchor 신호 |
| BoJ | US (description signal + tuning fit) | US 안정 | **VERY LOW** — multi-LLM 합의 동일 결과 예상 |

**가장 큰 expected change**: Anua. Decision tier에서 **US 또는 JP** 로 이동할 가능성. 만약 변동 없으면 우리 anchor 자체가 2021 시점 EU shift 패턴을 본 것 (즉 honestly DE가 합리적이었음).

**Tirtir는 거의 안 바뀔 가능성**. Anchor 신호가 동일하므로 multi-LLM도 같은 입력에서 같은 출력 합의. 이건 우리 시스템의 **anchor-level 한계** 의 강한 증거.

**BoJ는 거의 안 바뀜**: description-level signal + tuning fit이 multi-LLM에서도 일관.

---

## 4. 다음 액션

- [x] Hypothesis tier 3 brand sim 실행 ($12.48)
- [x] 본 postmortem 작성
- [ ] **Decision tier 3 brand sim 실행 중** (background, ~$54-160 budget)
- [ ] Decision tier 결과 → v3 부록으로 hypothesis 와 비교
- [ ] (v4 후보) Persona pool 시점 cut-off — fresh-gen only mode
- [ ] (v5 후보) Brand strategy interview input field

---

**문의**: ㈜미스터에이아이 (hwlee197874@gmail.com)
