# AI Market Twin · One-Pager (정부·투자자용)

**K-product 해외 진출 성공 확률을 AI가 예측합니다**

| | |
|---|---|
| 법인 | 주식회사 미스터에이아이 (Market Twin) |
| 사업자번호 | 693-87-03907 (2026년 5월 설립) |
| 대표 | Chris Lee · contact@markettwin.ai |
| 도메인 | https://www.markettwin.ai |
| 단계 | Pre-launch (closed beta) · 사업계획서 v4.5 (2026-05-17) |

---

## 문제

> **한국 수출기업의 1년 생존율 49.2%, 5년 생존율 16.3%.**

원인의 본질은 "현지 소비자 사전 검증 부재". 기존 시장조사는 약 **13억 원·6개월**이 소요되어 중소수출기업에게는 사실상 접근 불가능합니다.

## 솔루션

**24개국 정부 OpenData × AI 가상 소비자 페르소나 시뮬레이션** — 7~22분 내, 40만~400만 원에 시장 검증을 완료합니다. 기존 방식 대비 **1,000배 빠르고 300배 저렴**.

- **24개국 정부 통계** 라이브 grounding (KOSIS, BLS, e-Stat, 베트남 GSO, 인도네시아 BPS 등 27 시드)
- **멀티 LLM 앙상블** (Claude · OpenAI · DeepSeek 동시 round-robin) + 3-layer voice sanitizer
- **6종 외부 anchor stack** — Hofstede 문화지수 / World Bank 거시 / UN Comtrade / 관세청 / DART 재무·지역매출 / KOTRA 진출기업

## 측정·공개된 정확도 (Phase F.1 결과)

> **첫 통계적 유의 win 달성 (paired t-test p=0.0086 ✓)**

```
6-product paired benchmark, 2026-05-17
  Mean composite     72.0 / 100   (95% CI [61.7, 83.3])
  HOLDOUT n=2        75.4         (TUNING n=4: 70.4 — overfit 없음)
  vs v6 paired Δ     +17.4 pt     (p = 0.0086, 95% conf 유의)
  vs v0 baseline     +31.6 pt     (40.4 → 72.0, 단일 일자)
```

게이트 ≥80 사정권 진입. **2/6 fixture (LG OLED 84.1, KGC 96.4) 이미 게이트 통과**.

5-metric 자가 평가 (top3Hit / rankCorrelation / rejectRecall / confidenceCalibration / trendMatch) + paired t-test + FDR + bootstrap CI 모든 결과 GitHub 공개 (https://github.com/hwlee1978/market-twin/tree/main/validation/results).

## 차별화

| 영역 | 일반 AI 챗봇 / 시장조사 | AI Market Twin |
|---|---|---|
| 데이터 grounding | 일반 web 학습 | 24개국 공식 통계 + 6 anchor |
| 출처 추적 | 불가 | 모든 페르소나 발언 → 출처 통계 셀로 추적 |
| 정확도 공개 | 없음 | paired t-test, FDR, 5-metric 주간 측정·공개 |
| 비용·시간 | 13억 원·6개월 | 400만 원·22분 |

## 시장 + 비즈니스 모델

- **AI 마켓 리서치 시장**: $7.97B (2025) → $16.80B (2030), CAGR 16.1%
- **K-Beauty·K-Food 해외 시장**: 약 31조 원 / **K-Content**: 16조 원+
- **수익 모델**: SaaS 구독 ₩290k-1.49M (4-tier) + 엔터프라이즈 컨설팅 + API 라이선싱
- **타깃**: 중소수출기업 + 정부·공공기관 (KOTRA 형태) + 글로벌 K-product 브랜드

## 정부 사업 적합성 (2026 AI+ OpenData 챌린지 응모)

| 항목 | 내용 |
|---|---|
| 과제번호 | 20457281 (시장진출 전략 추천 부문) |
| 가치 | 한유원(KORIA)·중진공(KOSME) 데이터 통합으로 K-수출 정책 인프라화 |
| 검증 거버넌스 | 자체 정확도 측정·공개 인프라 (chal_reviewer가 검증 가능한 유일한 응모) |
| 실증 가능성 | v7 mean 72.0, paired p=0.0086 — 단순 "주장" 아닌 "측정된" 정확도 |

## 팀·자원

- Chris Lee (CEO/CTO) — 풀스택 + AI 시뮬레이션 시스템 단독 구축
- 인프라: Next.js + Supabase + 멀티 LLM (Claude · OpenAI · DeepSeek) + Vercel + Cloud Run worker
- 인증 로드맵: ISMS-P 2027 Q2, ISO 27001 2027 Q3
- AI 책임성: NIST AI RMF · EU AI Act · OECD AI 원칙 · 한국 AI 윤리 가이드라인 준수

## Ask

- **정부·공공기관**: 2026 AI+ OpenData 챌린지 선정 → 6개월 내 KORIA/KOSME 데이터 통합 + 10개사 베타 실증
- **투자자**: 시드 라운드 (정확도 80점 게이트 도달 + paid pilot 10개사 확보 단계까지 12개월 runway)
- **K-product 브랜드**: 사전 시장 검증 베타 참여 (KOTRA-style gov buyer 추천 환영)

## 더 알아보기

| 자료 | 위치 |
|---|---|
| 마케팅 사이트 | https://www.markettwin.ai |
| 방법론 + 정확도 공시 | https://www.markettwin.ai/methodology.html |
| 신뢰성·AI 책임성 | https://www.markettwin.ai/trust.html |
| 사업계획서 v4.5 (전체) | proposals/MarketTwin_BusinessPlan_v4_5.docx |
| Phase F 정확도 trajectory | validation/results/PHASE_F_TRAJECTORY.md |
| Anchor 설계 lessons | validation/results/ANCHOR_DESIGN_LESSONS.md |

---

**「 데이터로 K-product의 다음 시장을 추천하다 」**
contact@markettwin.ai · https://www.markettwin.ai
