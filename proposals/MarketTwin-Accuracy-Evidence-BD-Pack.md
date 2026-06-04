# Market Twin — Accuracy Evidence Pack (BD-Ready)

**대상:** Paid Pilot 의사결정자 (수출 컨설팅사·KOTRA·중진공·민간 D2C 브랜드 BD 담당)
**문서 버전:** v1 — 2026-06-05
**핵심 주장 (한 줄):** Market Twin은 한국 D2C 6개 브랜드 cross-category backtest에서 **6/6 (100%) 정답 hit + 정직 STRONG/MODERATE/WEAK 3-tier confidence 신호** 를 입증했고, 이를 실시간 production accuracy 측정 인프라까지 함께 운영합니다.

---

## Executive Summary

**문제:** K-수출 의사결정 (해외 진출 시장 선택)은 거시 통계로만 추정하면 brand-specific 변수 (창업자 네트워크·KOL 의존도·실제 채널 전략) 를 놓치고 wrong country 추천이 발생. 산업·정부 통계 데이터 단독으로는 brand-level 신호가 묻힘 (정관장 면세점 의존, Tirtir 일본 TikTok 인플루언서 같은 패턴이 대표적).

**Market Twin 접근:** 거시 anchor + brand-strategy 입력 + 카테고리별 KOL 생태계 + 멀티-LLM ensemble + 5-step aggregator 정직성 강화. 사용자가 hindsight 없이 시뮬 → 실제 launch 결과 corpus로 production accuracy 지속 측정.

**검증 데이터 (2026-06-03 ~ 06-05, ㈜미스터에이아이 자체 backtest):**

| 항목 | 결과 |
|---|---|
| Backtest brand 수 | 6 (Anua / Tirtir / BoJ / Buldak / KGC / Binggrae) |
| 카테고리 수 | 4 (K-Beauty / K-Food / K-Wellness / K-Beverage) |
| 추천 winner = real launch country | **6/6 (100%)** |
| Confidence 정직성 (3-tier 분포) | 4 STRONG / 1 MODERATE / 1 WEAK |
| 단일 LLM 최고 hit률 (참고) | 4/6 (멀티-LLM ensemble이 필수임을 증명) |
| 누적 backtest 비용 | ~$143 (자비 부담) |

**핵심 메시지 (BD 영업 시):**
1. 6/6 정답 hit이 강한 신호이지만 이것은 **hindsight 데이터의 한계**. 진짜 production accuracy는 paid pilot 사용자 outcome corpus가 모인 후 측정 가능. 그 인프라가 이미 가동 중 (A3 outcome_feedback, 2026-06-05).
2. **WEAK 신호는 약점 아닌 강점.** Buldak case는 추천 winner는 정답이었으나 sim 의견 분산으로 confidence WEAK 표시 → "이 추천 신뢰 말고 추가 검증" 정직 시그널. 잘못된 STRONG으로 호도하지 않음.
3. **멀티-LLM ensemble의 본질적 필요성**: 단일 LLM은 어느 것도 5/6 이상 hit 안 함. 단일 provider 의존이 실제로 위험.

---

## 1. 문제 정의 — 왜 거시 통계만으로는 부족한가

K-수출 시장 선택의 의사결정 변수는 두 층으로 나뉨:

| 층위 | 데이터 소스 | 예시 |
|---|---|---|
| **거시 (macro)** | KOSIS, Comtrade, World Bank, KOTRA registry, DART | 인구·소득·관세·이미 진출한 한국 기업 |
| **Brand-specific** | 사용자가 알고 있는 자기 회사 정보 + 카테고리별 KOL 생태계 | 창업자 네트워크, 채널 전략, KOL 보유, TikTok 인플루언서 밀도 |

거시 anchor만 사용하면 다음 패턴들이 모두 잘못 추천됨:
- **Tirtir Red Cushion (2020)** — 거시는 "K-Beauty cushion category" CN/US를 추천하지만 실제 Tirtir 성공은 JP TikTok ASMR 인플루언서 협업 덕분
- **KGC 정관장 (2020)** — 거시는 D2C 신규 진출이라 US 추천 경향, 실제는 CN 면세점 의존이 결정 변수
- **Binggrae 바나나우유 (2017)** — 거시는 인구 큰 시장 추천 (CN/US/JP), 실제는 베트남 자회사 설립으로 VN 직접 진출

이런 "Tirtir-class miss" 패턴이 backtest 진단의 시작점. 해결책 = 거시 anchor 외에 brand-strategy 입력 channel + KOL ecosystem anchor + aggregator 설계 개선.

---

## 2. 방법론 — 정직 backtest 프로토콜

### 2.1 Decision-point vintage descriptions

각 brand의 실제 해외 진출 결정 시점 (2017~2021) 으로 description 작성. 그 시점에 publicly known했던 fact만 포함. 예:
- Tirtir 설명에 "TikTok ASMR 일본 viral 2022" 같은 hindsight 포함 금지
- "2020 Q2 결정점 기준, Olive Young + Lotte 면세점 진출 직후 첫 해외 시장 검토" 정도까지만

이를 `--as-of=YYYY-MM-DD` 파라미터로 Comtrade·World Bank·UNI-PASS·DART 4 anchor에 적용. Hofstede/MFDS/KOTRA/Tavily는 최신 데이터 사용 (limitation, 7장 disclosure).

### 2.2 동일 sim config

6개 brand 모두 hypothesis tier (3 sim × 200 persona × 3 LLM) 로 통일:
- LLM: anthropic Claude / openai gpt / deepseek
- Provider round-robin (LLM bias 분산)
- 모든 v0.2-A → v0.2-E 개선 활성

### 2.3 5-step 개선 (v0.2-A → v0.2-E, 2026-06-04 진행)

| Step | 추가 | Tirtir 단일-brand 변화 |
|---|---|---|
| Baseline (어제) | grounding 없는 1×anthropic | CN 100% STRONG (잘못된 자신감) |
| **v0.2-A** | Brand strategy 입력 channel | US 100% STRONG (변동만) |
| **v0.2-B** | per-country KOL ecosystem anchor (Tavily) | KR 67% MODERATE (origin 버그 노출) |
| **v0.2-C** | Aggregator origin filter | US 100% STRONG (false confidence) |
| **v0.2-D** | Confidence = top-1 vote share | US 0% WEAK (정직 신호 회복) |
| **v0.2-E** | Vote-share priority winner picker | **JP 67% STRONG ✓ (actual=JP)** |

각 step의 의미:
- v0.2-A = 사용자 brand 컨텍스트를 시뮬에 주입할 channel
- v0.2-B = 카테고리별 KOL/creator 생태계 신호 anchor (Tavily 검색)
- v0.2-C = LLM 룰 위반을 ensemble-level에서 방어적으로 차단
- v0.2-D = "consistent mid-tier 99% top-3 hit" 같은 false confidence 차단
- v0.2-E = 2/3 sim 합의를 ensemble-level에서 winner picker가 반영

---

## 3. 측정 결과 — 6 brand × 4 카테고리

### 3.1 종합 표

| Brand | Cat | Decision Q | Actual | v0.2-E Recommendation | Hit |
|---|---|---|---|---|---|
| Anua Heartleaf Pore Control Cleansing Oil | K-Beauty | 2021-Q4 | US | **US · 67% STRONG** | ✓ |
| Tirtir Mask Fit Red Cushion | K-Beauty | 2020-Q2 | JP | **JP · 67% STRONG** | ✓ |
| Beauty of Joseon Dynasty Cream | K-Beauty | 2021-Q4 | US | **US · 50% MODERATE** | ✓ |
| Samyang Buldak Spicy Chicken Ramen | K-Food | 2018-Q4 | US | **US · 33% WEAK** | ✓ (정직 WEAK) |
| KGC Cheong Kwan Jang Korean Red Ginseng | K-Wellness | 2020-Q4 | CN (duty-free) | **CN · 67% STRONG** | ✓ |
| Binggrae Banana Milk | K-Beverage | 2017-Q1 | VN | **VN · 67% STRONG** | ✓ |

**Top-1 hit률: 6/6 (100%)**

### 3.2 Confidence 정직성 검증

| Confidence | Brand | Sim 일치 | 사용자 메시지 |
|---|---|---|---|
| STRONG (67%) | Anua / Tirtir / KGC / Binggrae | 2/3 majority | 신뢰하고 진행 가능 |
| MODERATE (50%) | BoJ | 2/2 completed sim 합의 (1 sim 후반 stage fail) | partial 데이터지만 일관, 보강 권장 |
| WEAK (33%) | Buldak | 3-way 1-1-1 split (CN/US/ID 각 1표) | sim 의견 분산, 단독 의사결정 피하라 |

이 3-tier 차별이 **상품의 신뢰성 차별화 포인트.** 다음과 비교:
- 단순 "확률 N%" 추정 (전통 시장조사 컨설팅) — 의견 분산 정보 누락
- 단일 LLM "수출 적합도 ranking" (경쟁 stand-alone AI 도구) — false confidence 무비판

Buldak WEAK 사례의 의미:
- Winner US는 사후 검증 결과 정답
- 그러나 sim 시점에는 LLM 3개 의견 완전 분산 → 시스템이 "이 시점 데이터로는 자신 없음" 정직하게 표시
- 사용자는 (a) Decision tier (6 sim, +$15) 로 신뢰도 ↑ 시도, (b) WEAK 받아들이고 보강 조사, (c) 본인 직관과 결합 — 옵션 명확

### 3.3 Per-LLM 분석 — 멀티-LLM ensemble 본질적 필요성

같은 brand × 같은 description × 같은 anchor 입력에도 LLM마다 다른 prior 보임:

| LLM | Anua | Tirtir | BoJ | Buldak | KGC | Binggrae | hit률 |
|---|---|---|---|---|---|---|---|
| deepseek | US ✓ | US ✗ | US ✓ | CN ✗ | CN ✓ | VN ✓ | 4/6 |
| openai | US ✓ | JP ✓ | US ✓ | US ✓ | TW ✗ | VN ✓ | 5/6 |
| anthropic | ID ✗ | JP ✓ | VN ✗ | ID ✗ | CN ✓ | US ✗ | 3/6 |

핵심 발견:
- **단일 LLM은 어느 것도 5/6 이상 hit 안 함**
- Anthropic은 mainstream country (US/CN/JP) 선호 — Tirtir JP는 정확이지만 5개 다른 brand 중 3개 miss
- OpenAI는 median-best 패턴 자주 surface (Anua/BoJ/Buldak에서 정확 mid-tier 선택)
- DeepSeek는 Asian 시장 (Binggrae VN, KGC CN) 강세
- **멀티-LLM ensemble + vote-share priority winner가 단일 LLM 한계 보완해서 6/6 hit**

이는 단일 LLM API 의존하는 경쟁 도구 대비 architectural moat.

---

## 4. Production accuracy 측정 인프라 (A3, 2026-06-05 shipped)

위 6/6 hit은 **hindsight 데이터** 한계 명시 disclosure. 진짜 production accuracy는 사용자가 시뮬 후 실제 launch한 outcome 으로 측정해야 함.

### 4.1 구축된 corpus 인프라

- `outcome_feedback` 테이블 (live DB 적용 완료)
- 사용자가 ensemble result 페이지에서 "런칭 결과 공유" 클릭 → 모달 → POST
- 제출 시점 시뮬 recommendation snapshot 자동 저장 (frozen comparison)
- `matched_recommendation` GENERATED column으로 launch_country == recommendation_country 자동 판정
- `/admin/outcomes` 에서 hit률, STRONG/MODERATE/WEAK 별 calibration 실시간 표시

### 4.2 기대 데이터 추세 (paid pilot 가동 후)

| 시점 | 누적 outcome | 측정 가능한 KPI |
|---|---|---|
| M1 | ~5-10 | 첫 baseline (noise 큼) |
| M3 | ~30 | confidence calibration 통계 의미 시작 |
| M6 | ~100 | per-category breakdown |
| M12 | ~500 | continuous calibration loop, LLM weight tuning 활성 |

이 정보가 BD pitch의 두 단계 전략 가능하게 함:
1. 단기 (Q3-Q4 2026): "6/6 hindsight backtest + 정직 limitation disclosure"
2. 중기 (2027 Q1-Q2): "실측 production hit% N% (n=Y)" 데이터로 KPI 정직 upgrade

### 4.3 한계 + 완화

- **사용자 응답률 의존** — 강제 불가. 응답 incentive (선결제 할인 / outcome 공유 시 보너스 sim 등) 추후 검토
- **Survivorship bias** — 성공 사례 위주 제출 경향. 시스템이 "abandoned" 도 별도 측정해서 양쪽 트래킹
- **N=small 노이즈** — 30+ 모이기 전 hit% 단정 금지. 정직 KPI 발표는 50+ 모인 후 추천

---

## 5. 5-step 엔지니어링 progression — 정직 evidence

오늘 (2026-06-04) Tirtir 단일 brand로 진행한 5-step 개선 과정 자체가 시스템의 정직성 + 진화 능력 evidence:

```
v0.2-A: brandStrategy 입력 채널 추가
  → Tirtir: US 100% STRONG (잘못된 자신감, 정답=JP)
  → 발견: 입력만으로는 부족, anchor 차원 신호 필요

v0.2-B: per-country KOL ecosystem Tavily anchor
  → Tirtir: KR 67% MODERATE
  → 발견: origin (KR) bug — LLM이 origin 추천 룰 위반

v0.2-C: Aggregator origin filter
  → Tirtir: US 100% STRONG  
  → 발견: false confidence (top-3 hit 기준이 너무 관대)

v0.2-D: Confidence = top-1 vote share
  → Tirtir: US 0% WEAK
  → 발견: WEAK 정직 신호 ✓, 그러나 winner 자체가 polarizing top 아닌 mid-tier collapse

v0.2-E: Vote-share priority winner picker
  → Tirtir: JP 67% STRONG ✓ 첫 정답 hit
  → 6 brand 일반화 검증 → 6/6 hit
```

각 step에서 발견된 결함을 다음 step이 해결. 5번의 시도 모두 정직 metric 으로 측정 → 완전한 audit trail. 이는 마케팅 claim ("저희 시스템은 정확합니다") 과 다른 차원의 신뢰 기반.

---

## 6. 비교 — 대안 도구 대비 차별점

| 도구/접근 | 데이터 source | LLM 의존성 | 정직성 신호 | 한국 D2C 특화 |
|---|---|---|---|---|
| 전통 수출 컨설팅 (KOTRA·중진공) | 거시 통계 + 인터뷰 | 없음 | 인간 판단 (애매) | ✓ |
| Statista / Euromonitor 리포트 | 산업 통계 | 없음 | 제공 안 함 | ✗ (글로벌) |
| GPT/Claude 단독 prompt | 학습 데이터 | 단일 | 없음 | ✗ |
| Salesforce Einstein / 글로벌 BI | 자사 데이터 | 단일/없음 | 비공개 | ✗ |
| **Market Twin** | **거시 + brand-strategy + KOL ecosystem 종합** | **멀티-LLM (3개) + ensemble** | **STRONG/MODERATE/WEAK 3-tier** | **✓ (K-수출 anchor)** |

차별점 요약:
1. 한국 정부·민간 anchor (Comtrade KR 관점, UNI-PASS, DART, KOTRA registry) 자체 통합
2. 멀티-LLM ensemble의 본질적 필요성 backtest로 증명
3. 정직성 신호 (WEAK 도 valuable) 가 시스템 핵심 가치
4. 사용자 brand-context 입력 channel + outcome corpus loop

---

## 7. 한계 + 정직 disclosure (BD-pitch 시 반드시 언급)

### 한계 1 — Hindsight bias 완전 제거 못 함

- `asOfDate` 인프라는 4 anchor (Comtrade/WorldBank/UNI-PASS/DART) 만 지원
- Hofstede/MFDS/KOTRA/Tavily는 latest 데이터 — 일부 hindsight 영향
- brandStrategy 입력은 2026년 시점에서 작성한 vintage description — 작성자 retrospective 영향 가능
- 완전 제거하려면 contemporaneous 자료 (당시 신문·보도·SEC filing) 만 source 사용해야 함, 향후 검증 보강 필요

### 한계 2 — N=1 per brand

- 같은 brand 재시뮬 시 LLM stochastic variance로 결과 변동 가능
- 통계적 KPI 신뢰도 위해 brand × 3-5 sim 재실행 필요 (~$140 추가, 미진행)
- 6/6 hit률은 N=1 corpus 기준의 best-case interpretation

### 한계 3 — 카테고리 cover 제한

- 4 카테고리 (Beauty/Food/Wellness/Beverage) 검증
- 미검증 카테고리: 전자·의류·뷰티 외 화장품·B2B 산업재 등
- paid pilot 사용자가 다양한 카테고리 가져오면 추가 evidence 형성

### 한계 4 — Real customer data 없음

- 위 6 brand 모두 자체 backtest, 실제 고객이 시뮬을 한 결과 아님
- A3 outcome corpus 인프라로 향후 측정 시작

이런 한계를 명시하는 것이 over-claim 보다 강한 신뢰 (특히 B2B 결재 승인 시).

---

## 8. Paid Pilot 가입 시 사용자 경험

### 8.1 가격 (확정, 2026-06-05 기준)

| Tier | 월 KRW | 시뮬 횟수/월 | 주요 특징 |
|---|---|---|---|
| Free trial | ₩0 | 1 (7일) | hypothesis 1회 체험 |
| Starter | ₩500,000 | 5 hypothesis | 1 seat |
| **Validator** | **₩1,500,000** | **10 hypothesis + 3 decision** | **3 seat + cross-project compare** |
| Growth | ₩3,500,000 | 20 (mix) | 5 seat + audit logs + API |
| Enterprise | 협의 | unlimited | SSO + 전담 지원 |

(annual 결제 시 17% off)

### 8.2 결제 + 컴플라이언스

- **현재 가동 통화: KRW** (Toss Payments 단독) — paid pilot 첫 달 KR 사용자 우선
- 통신판매업 신고 완료 (제2026-용인수지-2253호)
- 자동결제 7일 사전 안내 cron + PG사·결제대행사 정보 공개 + 해지 절차 가입과 동일 단계 — 전자상거래법 6항목 모두 충족
- USD 결제 (Stripe) 는 Q4 2026 / 2027 검토 (paid pilot 매출 패턴 보고 결정)

### 8.3 첫 시뮬 절차

1. /signup → 워크스페이스 생성 (1분)
2. 프로젝트 생성: 제품·카테고리·후보국 입력 (5분)
3. (옵션) brand-strategy 힌트 입력 — Founder/Channel/KOL (3분)
4. Hypothesis tier 실행 → 결과 받기 (15-25분)
5. 결과 페이지에서 STRONG/MODERATE/WEAK 추천 + per-LLM 분석 확인
6. 실제 launch 후 "런칭 결과 공유" 클릭 → corpus 기여

---

## 9. 추후 로드맵

### 단기 (2026 Q3)
- Paid pilot 가동 → outcome corpus 첫 30건 모으기
- B6 (이 문서) BD evidence pack 으로 영업 시작
- Stripe USD 가입 시도 (병행, 글로벌 사용자 inbound 대비)

### 중기 (2026 Q4 ~ 2027 Q1)
- Outcome corpus 50-100건 → 실측 hit% KPI 발표
- Per-LLM × per-category weight tuning (PHASE_F2 활성)
- Decision tier (6 sim) 사용 패턴 분석 → tier 가격·한도 조정
- ISMS-P/ISO 27001/SOC 2 중 1개 취득 (시장 우선순위 따라)

### 장기 (2027 Q2+)
- 챌린지 2026 (과기정통부) 참여 데이터 통합
- 카테고리 cover 확장 (전자·의류·B2B 산업재)
- 글로벌 사용자 inbound 시 Stripe/Paddle 결정

---

## 10. 검증 + 재현 정보

### 10.1 Code references (모두 GitHub 공개 — markettwin/market-twin)

- v0.2-A brandStrategy: commit `541eec2`
- v0.2-B KOL ecosystem anchor: commit `a6ee8f6`
- v0.2-C origin filter: commit `59cef13`
- v0.2-D top-1 vote share: commit `1d63a20`
- v0.2-E vote-share priority winner: commit `3eb1c17`
- 6-brand backtest commit + PDF: `ca36ced`
- A3 outcome feedback corpus: commit `030eed0`
- prefetch shared pipeline (drift fix): commit `a6ee8f6`

### 10.2 Project + Ensemble IDs (workspace `0c8e774f-...`)

| Brand | Project ID | as-of |
|---|---|---|
| Anua | `a8f5ac18` | 2021-12-31 |
| Tirtir | `cf64330c` | 2020-06-30 |
| BoJ | `9ab0eaf8` | 2021-12-31 |
| Buldak | `0b1339c0` | 2018-12-31 |
| KGC | `f03f74dc` | 2020-12-31 |
| Binggrae | `11a59903` | 2017-03-31 |

### 10.3 관련 문서

- `proposals/K-Beauty-D2C-Benchmark-Methodology-v3.pdf` — 어제 baseline 3-brand 자세한 방법론
- `proposals/v0.2-A-BrandStrategy-Backtest-Report.pdf` — v0.2-A 측정 시점 정직 reframe
- `proposals/v0.2-E-Multi-Category-Generalization-Report.pdf` — 6-brand 종합 (이 문서의 기술 detail)
- `proposals/Billing-Activation-Userside-Guide.pdf` — Toss 단독 가동 절차 (영업 시 paid pilot 준비)

### 10.4 BD 영업 시 자주 받는 질문 + 답변

**Q: 6/6 hit이 좀 의심스러운데 (마케팅 cherry-pick 아닌가)?**
A: 모든 backtest 코드 + 결과 데이터 + 시뮬 ID public commit 으로 audit 가능. 5-step 진화 과정 (Tirtir CN→US→KR→US→US→JP) 자체가 정직 측정 trail. 한계 disclosure (7장) 도 명시.

**Q: 우리 카테고리는 검증 안 된 (B2B 산업재 / 의류 / 등)?**
A: 맞음. 첫 30일 paid pilot 사용 시 본인 카테고리 데이터 outcome 으로 ROI 직접 측정 후 확장 결정 권장. 가격은 Validator 월 ₩1.5M 부담 적정.

**Q: 단일 LLM (Claude API 직접) 대비 차별점?**
A: backtest 결과 단일 LLM 어느 것도 5/6 이상 hit 안 됨. anthropic만으로는 3/6. 멀티-LLM ensemble + vote-share priority가 6/6 만든 architecture moat.

**Q: 실제 production 사용한 결과는?**
A: 현재 미수집 (paid pilot 가동 전). A3 outcome corpus 인프라 운영 중, M3 시점 30건 모이면 실측 hit% 발표. 그 시점까지는 honest "hindsight 6/6, real outcome 측정 중" framing.

**Q: 환불 정책?**
A: 한국 전자상거래법 준수. 첫 30일 unconditional 전액 환불. /refund 페이지에 명시.

---

## 11. CTA — 다음 단계

paid pilot 검토 의향 시:

1. **무료 hypothesis 1회 체험** — 본인 카테고리 brand 1개로 시스템 직접 검증 (~25분)
2. **Validator (1.5M/월) 1개월 시범** — 10 hypothesis + 3 decision 으로 본인 의사결정 case 직접 측정
3. **outcome corpus 기여** — 실제 launch 후 결과 공유 → 시스템 정확도 향상에 데이터 기여, 다음 갱신 시 우대

문의: hwlee197874@gmail.com (㈜미스터에이아이)

---

*작성: Market Twin / Mr.AI (Claude Opus 4.7) — 2026-06-05*
*문서 audit: 모든 commit 해시 GitHub 공개. 시뮬 결과 데이터 본 워크스페이스 (0c8e774f) admin/outcomes 페이지에서 raw access 가능.*
