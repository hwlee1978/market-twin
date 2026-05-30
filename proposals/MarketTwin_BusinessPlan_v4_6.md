# AI Market Twin · 사업계획서 v4.6

**2026 AI+ OpenData 챌린지 (시장진출 전략 추천 부문) — 설명회 자료 반영판**

| | |
|---|---|
| 과제번호 | 20457281 |
| 신청기업 | 주식회사 미스터에이아이 (Market Twin) |
| 대표자 | Chris Lee (이현우) |
| 사업자번호 | 693-87-03907 |
| **통신판매업신고** | **제2026-용인수지-2253호 (2026-05-28, 용인시 수지구청)** |
| 설립일 | 2026년 5월 |
| 도메인 | markettwin.ai (운영 중) · mrai.markettwin.ai (Mr.AI 베타) |
| 연락처 | contact@markettwin.ai |
| 제출일 | 2026년 5월 30일 |
| 변경 사항 (v4.5 → v4.6) | **설명회 자료 (2026-05-30 PDF) 핵심 요구사항 명시적 매핑**: §3.5 Task 1·2 매핑 / §4.5 판정기준(예측 정확도·재현성·LMArena A/B) 충족 인프라 / §5.4 챌린지 측 제공 데이터(판판대로 + 수출바우처) 통합 schema (migration 0064 적용 완료) / §9.4 Full-scope 15-18일 Sprint 계획 (Phase A-F) / §11.4 운영 readiness 보강 — 통신판매업 신고 완료 + Google SEO 실데이터 sync (commit ca3a972) + 결제 인프라 활성화 batch 완료 (commit 36de941). v4.5의 정확도·검증 내용은 그대로 유효. |

> **v4.5 대비 메시지**: v4.5는 정확도 (mean 72.0, p=0.0086) 입증에 집중. v4.6은 정확도 위에 **"챌린지 요구사항 100% 매핑 가능한 운영 인프라가 이미 ship됨"** 을 추가 입증. 협력 데이터 도착 즉시 6개월 일정 대신 **2-3주 안에 프로토타입 첫 결과** 가능한 단계.

---

## v4.5 그대로 유효 (§1~§9.3)

본 v4.6은 v4.5에 **추가**되는 section 5개 + 보강 2개로 구성. v4.5의 §1~§9.3 (사업 개요 / 문제 정의 / 솔루션 / 핵심 기술 / OpenData 활용 / 한유원·중진공 데이터 결합 / 시장분석 / 비즈니스 모델 / 추진 일정 9.1~9.3 / 기대 효과 / 팀)은 그대로 유효합니다. 본 문서는 그 위에 설명회 PDF 요구사항을 명시적으로 매핑하는 보강판입니다.

---

## §3.5 (NEW) 설명회 자료 요구사항 ↔ Mr.AI 매핑

설명회 자료 (2026-05-30 PDF) 요구사항을 1:1로 매핑합니다.

### Task 1 — 적합 판로 추천

> "맞춤형 정부 지원사업을 AI로 자동 매칭" (PDF p.6)

| 요구 | Mr.AI 보유 자산 | 갭 |
|---|---|---|
| AI 기반 적합판로 추천 (내수 지원사업) | 4-Layer 추천 엔진 보유 (v4.5 §3·§6) — 정부 데이터 12+ anchor 통합 검증 (Phase F, 2026-05-17) | 판판대로 90개 지원사업 ingestion (Sprint Phase A) |
| AI 기반 적합판로 추천 (수출 바우처) | 24개국 시장 시뮬레이션 + 정부 OpenData 27 시드 (v4.5 §5.1) | 수출바우처 5.8만 프로그램 ingestion (Sprint Phase A) |
| 자동 매칭 | LLM 기반 추천 inference + embedding similarity 매칭 | 7만 선정 기업 × 7만 제품 임베딩 학습 (Sprint Phase B) |

### Task 2 — 마케팅 콘텐츠 제작

> "판로 추천 결과 기반 콘텐츠 생성" (PDF p.6)

| 요구 | Mr.AI 보유 자산 | 갭 |
|---|---|---|
| 시장분석 리포트 | 시뮬 자동 PDF 리포트 (Comtrade + KOTRA + DART + 12개 anchor) | 판판대로 제품 데이터 결합 enrichment (Sprint Phase C) |
| 다국어 상품 기술서 | 콘텐츠 드래프터 — KR/EN/JP/TW/CN 5개국어 작동 중 (`/api/mrai/marketing-channels/[id]/drafts`) | 판판대로 제품 카테고리 별 카피 톤 최적화 (Sprint Phase C) |
| 홍보 영상 콘텐츠 | 이미지 생성 보유 (gpt-image-1, Replicate FLUX) | Replicate Veo / Stable Video Diffusion 통합 (Sprint Phase D) |
| 상세페이지 | 채널별 preview UI 보유 (Instagram·YouTube·**Naver Smartstore** etc. 7종) | 판판대로 상세페이지 포맷 매칭 + e-commerce 상품 카드 강화 (Sprint Phase D) |

### 매핑 결론

- **Task 1**: 4-Layer 추천 엔진의 **데이터 layer만** 챌린지 제공 데이터로 추가 → 추천 본체는 검증된 production 시스템 재사용
- **Task 2**: 콘텐츠 드래프터 + 멀티 preview의 **2개 산출물만** 추가 구축 (영상 + 상세페이지 강화) → 나머지 3개 (리포트 / 다국어 / 카피)는 이미 작동

---

## §4.5 (NEW) 판정기준 충족 인프라

설명회 자료 (PDF p.8) 판정기준 2가지에 대한 충족 방안:

### 판정 1 — 적합 판로 추천: 예측 정확도 · 재현성

> "학습 데이터와 분리된 테스트 데이터셋을 투입하여 판로 예측 정확도 측정 및 동일 조건 입력 시 동일 결과 도출 (재현성) 여부 검증"

**Mr.AI 보유 인프라**:
- `validation_dataset_v0` (2026-05-15 ship) — 자동 스코어링 파이프라인 + 통계 검정
- Phase E·F benchmark 시스템 — TUNING vs HOLDOUT 분리 운영 중
- `validation/results/PHASE_F_TRAJECTORY.md` — 전체 측정 trajectory 공개

**추가 작업** (Sprint Phase B 일부):
- `ch_recommendations` 테이블 (migration 0064 적용 완료) — `dataset_split` 컬럼으로 train/test/holdout 명시 + `input_hash` (SHA-256) 로 재현성 키 보장
- 동일 input → 동일 output 검증 cron (model_version 잠금 + temperature 0 + seed 고정)
- 평가지표: Top-K 매칭 정확도 (k=1/3/5), Hit@K, MRR (Mean Reciprocal Rank)

### 판정 2 — 마케팅 콘텐츠 제작: A/B 테스트 (LMArena 방식)

> "벤치마크 지표 구축 (ex. LMArena)을 통해 타 AI 모델과 A/B 테스트 (블라인드 형태) 통한 승률 측정"

**Mr.AI 보유 인프라**:
- **LLM-SEO 가시성 감사** (`mrai_llm_visibility_audits`) — Claude/GPT/Gemini 블라인드 비교 시스템 이미 production
- 콘텐츠 드래프터의 멀티 LLM 앙상블 출력 보유

**추가 작업** (Sprint Phase E):
- `ch_ab_battles` 테이블 (migration 0064 적용 완료) — model_a/output_a vs model_b/output_b 블라인드 저장
- LMArena 스타일 UI (`/mr-ai/arena`) — 콘텐츠 타입별 (시장분석/다국어/영상/상세페이지) 두 응답을 모델명 숨김 상태로 노출, 평가자 클릭 win 기록
- 승률 leaderboard + 통계 유의성 검정 (Chi-square)

---

## §5.4 (NEW) 챌린지 측 제공 데이터 통합 계획

설명회 자료 (PDF p.10) 명시된 제공 데이터:

| 출처 | 항목 | 형식 | 규모 | Mr.AI 통합 위치 |
|---|---|---|---|---|
| 판판대로 (내수) | 지원사업 정보 | CSV | ~90개 | `ch_pp_programs` (migration 0064 ✅) |
| 판판대로 | 선정기업 정보 | CSV | ~7만社 | `ch_pp_companies` (SHA-256 비식별화) ✅ |
| 판판대로 | 선정기업 제품 | CSV | ~7만 | `ch_pp_products` (embedding 컬럼 포함) ✅ |
| 수출바우처 | 프로그램 정보 | Excel | ~5.8만 | `ch_voucher_programs` ✅ |
| 수출바우처 | 수출성과 정보 | Excel | ~1.1만 | `ch_voucher_exports` (business_no_hash 조인 키) ✅ |

### 통합 데이터 아키텍처

```
판판대로 + 수출바우처 (challenge reference DB, RLS off, all users read-only)
  └→ ch_pp_companies (SHA-256 비식별화)
  └→ ch_pp_products (embedding vector(1536))
  └→ ch_voucher_exports (business_no_hash 조인)
       ↓
   Sprint Phase B: 추천 모델
       ↓
ch_recommendations (workspace 격리, input_hash 재현성)
       ↓
   Sprint Phase C/D: 콘텐츠 생성
       ↓
ch_ab_battles (LMArena A/B 측정)
```

### 거버넌스

- **비식별화**: 사업자등록번호 SHA-256 해시 (원본은 ingestion 시 폐기) — challenge_2026_opendata 메모리 §데이터 거버넌스 정렬
- **격리**: `ch_*` reference 데이터는 service-role write only, 모든 사용자 read-only
- **추적**: `ingested_at` + `raw jsonb` 컬럼으로 원본 row 보존 (스키마 진화 대비) + 감사 가능
- **종료 시 환원/폐기**: 챌린지 운영기관 가이드라인 따름 (1-line `DELETE FROM ch_*` SQL 준비)

---

## §9.4 (NEW) Full-scope Sprint 계획 — 챌린지 응모 후 우선 작업

선정 발표 전이라도 **응모 강도 입증 + 자체 제품 가치** 두 마리 토끼를 위해 즉시 시작합니다.

| Phase | 작업 | 기간 | 의존 |
|---|---|---|---|
| **A.1 ✅** | Migration 0064 (ch_pp_* + ch_voucher_* + ch_recommendations + ch_ab_battles) | 1일 | — |
| A.2 | CSV/Excel ingestion 스크립트 (`scripts/ingest-challenge-data.ts`) | 1-2일 | 판판대로/수출바우처 데이터 수령 |
| A.3 | `/admin/challenge-data` 탐색 UI (super-admin gated) | 1일 | A.2 |
| **B** | 적합판로 추천 모델 — embedding similarity + LLM rerank + 학습/테스트 분리 + 재현성 검증 | 4-5일 | A 완료 |
| **C** | 시장분석 리포트 enrichment + 다국어 상품 기술서 톤 최적화 | 3-4일 | A 완료 |
| **D** | 홍보영상 생성 (Replicate Veo / SVD) + Naver Smartstore preview 강화 | 3-5일 | C 일부 |
| **E** | LMArena 스타일 A/B 블라인드 UI + 승률 leaderboard | 2-3일 | C·D 출력 |
| **F.0** ✅ | 응모서 v4.6 (본 문서) | 1일 | — |
| F.1 | 데모 영상 + 아키텍처 다이어그램 + 1-page summary | 1-2일 | A-E 일부 결과 |

**합계 15-18일** (단일 풀타임 기준). 챌린지 선정 발표 후 6개월 일정 (v4.5 §9.1)에서 M1·M2의 일부 작업을 응모 단계에서 선행한 것에 해당 — **선정 시 6개월 일정 압축 가능** (4개월 내 베타 테스트 진입 사정권).

---

## §11.4 (NEW) 운영 readiness — 다른 응모팀 대비 차별 신호

### 법인·등록 완료

| 항목 | 상태 |
|---|---|
| 법인 설립 | ✅ 2026.5 (㈜미스터에이아이) |
| 사업자등록 | ✅ 693-87-03907 |
| **통신판매업 신고** | ✅ **제2026-용인수지-2253호** (2026-05-28, 용인시 수지구청) |
| 도메인 | ✅ markettwin.ai 운영 + mrai.markettwin.ai 베타 |
| Google Workspace | ✅ |
| AWS Activate / GCP Startups | ✅ (Bedrock·Supabase Offer 활용) |

### 기술 인프라 (2026-05-30 기준 시점 commit 해시 포함)

| 항목 | 상태 / 최근 commit |
|---|---|
| 풀스택 (Next.js + Supabase + 멀티 LLM) | ✅ 운영 중 |
| 정확도 검증 자동 파이프라인 (validation_dataset_v0) | ✅ ship 2026-05-15 |
| Phase F brand-level anchor 통합 (관세청·DART·KOTRA·MFDS·KOSIS·Comtrade·Hofstede·World Bank·BoJ) | ✅ ship 2026-05-17 |
| 멀티-LLM-SEO 가시성 감사 (LMArena 사촌) | ✅ ship 2026-05-27 |
| 다국어 콘텐츠 드래프터 5개국어 + K-name 현지화 (TW: 임윤아 → 潤娥 (Yoona)) | ✅ ship 2026-05-29 (commit f843ff4) |
| **Google Search Console + GA4 실데이터 sync** (콘텐츠 효과 outcome 측정) | ✅ **ship 2026-05-29 (commit ca3a972)** |
| 결제 인프라 활성화 batch (Stripe/Toss/validator/webhook/compliance UI) | ✅ ship 2026-05-30 (commit 36de941) |
| 어드민 site-settings (signup gate 즉시 토글) | ✅ ship 2026-05-30 (commit 955d3f3) |
| 챌린지 데이터 schema (migration 0064) | ✅ **본 응모일 (2026-05-30) ship** |

### 의미

**다른 응모팀**: 챌린지 6개월 동안 데이터 ingestion → 모델 학습 → UI 구축 → 베타 테스트 순차 진행.

**Mr.AI**: 데이터 ingestion 자리만 비어있고 (Sprint Phase A.2) 나머지 5-Layer (시뮬·추천·콘텐츠·검증·LMArena)가 이미 production. **데이터 도착 즉시 1-2주 안에 첫 정량 결과** 보고 가능.

이것이 v4.5에서 강조한 "측정·검증·공개된 정확도" + v4.6에서 추가하는 "**측정 가능한 운영 인프라**" 입니다.

---

## §12.1 갱신 — 본 챌린지 적합성 요약 (v4.6 운영 readiness 추가)

v4.5 §12.1 표에 다음 행 추가:

| 영역 | 내용 |
|---|---|
| **운영 readiness (v4.6 NEW)** | 법인·사업자·통신판매업 신고·도메인·Google Workspace 모두 완료. 결제 인프라 (Stripe + Toss + 웹훅 + 컴플라이언스 UI) ship 완료. **챌린지 데이터 schema migration 본 응모일 ship.** 다른 응모팀 대비 "운영 가능한 SaaS"라는 차별점 |
| **챌린지 요구사항 매핑 (v4.6 NEW)** | Task 1 적합판로 추천 ↔ 4-Layer 추천 (데이터 layer만 추가). Task 2 마케팅 콘텐츠 ↔ 다국어 드래프터·preview·시뮬 리포트 (영상 + 상세페이지만 신규). 판정기준 (예측 정확도·재현성·LMArena) 충족 인프라 모두 보유. 갭 = 15-18일 (Phase A-F sprint) |

---

## §12.2 갱신 — 본 사업의 의의 (v4.6 추가 한 문장)

v4.5 §12.2에 다음 한 문장 추가:

> 운영 측면에서 Market Twin은 본 응모 시점 이미 **법인 등록 + 통신판매업 신고 + 상용 SaaS 운영 + 결제 인프라**까지 완료한 상태입니다. 챌린지 데이터의 통합 schema(migration 0064)도 응모일에 ship되어, 협력기관 데이터 도착 즉시 **1-2주 안에 첫 정량 결과** 산출 가능합니다. "구상안" 단계의 응모가 아닌 "production 시스템에 데이터 layer 하나만 추가하면 되는" 응모입니다.

---

**「 운영 가능한 K-수출 의사결정 인프라, 데이터 합류 즉시 산출 시작 」**

— Mr.AI Inc. · 2026-05-30
