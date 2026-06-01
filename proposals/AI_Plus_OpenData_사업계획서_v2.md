# AI+ OpenData 챌린지 사업계획서

**과제번호**: 20457281
**과제명**: 중소·소상공인을 위한 AI 시장진출 전략 추천 시스템
**주관기관**: 중소벤처기업진흥공단(KOSME) · 한국중소벤처기업유통원(KOMA)
**신청기업**: ㈜미스터에이아이 (Mr.AI Inc.)
**대표자**: 이현우 (Hyunwoo Lee)
**사업자등록번호**: 693-87-03907
**라이브 데모 URL**: https://app.markettwin.ai/sme-strategy

---

## ◇ 개요(요약)

| 항목 | 내용 |
|---|---|
| **선택한 과제** | 중소·소상공인 시장진출 전략 추천 (Task 1: 적합 판로 추천 / Task 2: 마케팅 콘텐츠 제작) |
| **과제 해결방안 (개발계획)** | (1) 판판대로 지원사업 + 수출바우처 + 기업마당 1,385개 공공 데이터를 OpenAI text-embedding-3-small (1,536d)로 벡터화 후 pgvector 코사인 유사도로 Top-K 후보 추출 → Claude Sonnet 4.6 rerank로 적합도·이유 산출. (2) 매칭 결과를 4종 공공데이터 anchor (Hofstede 6-dim · World Bank 거시지표 · KOTRA korCompList · UN Comtrade)로 grounding한 시장분석 리포트 + 5개국어 × 9-필드 상품기술서 (subtitle·features·target_audience·brand_story·SEO 포함) + 풍부 상세페이지 (detail_specs·scenarios·FAQ) + 3-tier × 3-model 영상 (Tier A 단일 / B 스토리보드 / C +TTS, Model: Kling Stable/Dynamic + Seedance 1 Pro) 자동 생성. (3) im-not-ai 룰북 자동 후처리로 한국어 AI 글의 번역체·기계적 구조를 사람 글로 정정. (4) Job + Polling 비동기 아키텍처 + Supabase Storage 영구 저장 + ?hash= permalink로 6-8분 long-running 영상 안정 처리 + 결과 영구 공유. |
| **혁신성** | ① **재현성 100% 수학적 보장** (SHA-256 input_hash + temperature=0 + cache). ② **공공데이터 grounding 4종 anchor** — Hofstede·WB·KOTRA·Comtrade를 LLM에 grounding으로 주입, 한국식 단위 표기 ("8,660억 달러", "1억 100만 명"). ③ **AI 자연도 자동 정정** — im-not-ai v2.0 학술 룰북(김도훈 2009·박옥수 2018 등) 기반 40+ 패턴 탐지·재작성·6항 자가검증. ④ **CSV Batch 평가 모드** — 200건/회 일괄 + 재현성 자동 검증. ⑤ **라이브 시스템 보유** — 95% 구현 완료, 심사위원 즉시 검증. ⑥ **다국어 기술서 9-필드 풍부화** — locale 당 headline·subtitle·tagline·body(400-700자)·bullets·features(5-7)·target_audience·brand_story·SEO·CTA + locale별 톤 가이드(Smartstore/SEO/정중/Shopee/Tmall). ⑦ **상세페이지 차별화** — detail_specs 표(5-8) + usage_scenarios(3-5) + FAQ(3-5) + 배송·환불 boilerplate. ⑧ **홍보영상 3-tier × 3-model** — Tier A 단일 / Tier B 3-scene 스토리보드 / Tier C +TTS Nova. Model: Kling Stable / Kling Dynamic / Seedance 1 Pro. smart motion prompt (Haiku) cinematic 자동. ⑨ **Job + Polling 비동기 + 영구 저장** — 6-8분 long-running 안정, Supabase Storage mirror, ?hash= permalink, 클립별 다운로드. |
| **가치창출 및 시장성** | (가치) 중소·소상공인이 정부 지원사업·수출 바우처를 매칭받는 데 평균 2주 소요되던 작업을 90초로 단축. 마케팅 콘텐츠 외주비 (300만~1000만 원) → 자동 생성 비용 정보형 \$0.37, Tier A 영상 포함 \$0.87, Tier B 풀세트 \$1.87. (시장) 한국 중소기업 380만 + 소상공인 700만 (중기부 2024). 챌린지 종료 후 markettwin.ai 본 서비스(B2B SaaS) 및 KOSME·KOTRA·중기부 산하기관 API 연동으로 확장. |
| **과제 제시 (선택 사항)** | — |

**이미지 1**: `[/sme-strategy 랜딩 페이지 스크린샷]` — 시스템 개요  
**이미지 2**: `[/sme-strategy/content 결과 화면 스크린샷]` — 공공데이터 그라운딩 + 시장분석 리포트 + 5개국어 기술서

---

## 1. 과제 해결방안 (개발계획)

### 1-1. 해당 과제를 풀기위한 전반적인 개발계획

**○ 개발 배경 및 목적**

중소·소상공인은 정부 지원사업 1,385건+, 수출바우처 5.8만 건이 존재하지만 정보 탐색·매칭에 평균 2주가 걸린다. 또한 매칭 후 마케팅 콘텐츠(시장분석·다국어 카피·상세페이지·홍보영상)는 별도 외주로 300만 원에서 1,000만 원의 비용이 발생한다. 본 과제는 두 단계를 **단일 AI 파이프라인**으로 묶어 90초 안에 산출하는 것을 목적으로 한다.

**○ 알고리즘 구조**

```
[기업·제품 입력]
    ↓
Stage 1 (재현성 키 생성)
    · 입력 정규화 → SHA-256 해시 → input_hash
    · 동일 input_hash 캐시 조회 → 있으면 즉시 반환 (재현성 보장)
    ↓
Stage 2 (Task 1: 적합 판로 추천 — 2-stage hybrid)
    · 입력 텍스트 → OpenAI text-embedding-3-small (1,536d)
    · pgvector 코사인 유사도 → 후보 60개 (ch_pp_programs 30 + ch_voucher_programs 30)
    · Claude Sonnet 4.6 rerank (temperature=0) → Top-K + 적합도 + 한국어 이유
    ↓
Stage 3 (Task 2: 공공데이터 grounding — 병렬 호출)
    · Hofstede 6-dim 문화거리 (KR ↔ 타겟국)
    · World Bank GDP/인구/가계소비 거시지표
    · KOTRA korCompList 타겟국 진출 한국기업
    · UN Comtrade HSCode 3년 추세
    → LLM 프롬프트에 grounding block 주입 ("수치 인용 필수, 추정 금지")
    ↓
Stage 4 (Task 2: 마케팅 콘텐츠 생성)
    · 시장분석 리포트 (Claude Sonnet 4.6 + grounding 인용)
    · 다국어 상품기술서 5개국 (KR/EN/JP/TW-zh/CN-zh) — locale 당 9개 필드:
       headline·subtitle·tagline·body(400-700자)·bullets·features(5-7개)
       ·target_audience(2-3 페르소나)·brand_story·SEO keywords·CTA.
       locale 별 톤 가이드 자동 적용 (Smartstore/SEO-driven/정중/Shopee/Tmall)
    · 상세페이지 (e-commerce mockup) — 한국어 풍부 데이터: detail_specs 표
       (소재·사이즈·원산지·인증 등 5-8개) + usage_scenarios (3-5 시나리오)
       + FAQ (3-5) + 배송·환불 boilerplate. ② 기술서와 차별화.
    · 홍보영상 — 3-tier × 3-model selector (사용자 선택):
       Tier A 단일 클립 / Tier B 3-scene 스토리보드 (제품 리빌·시나리오·
       클로즈업) / Tier C +OpenAI TTS Nova 한국어 보이스오버.
       Model: Kling v1.6 Pro Stable / Kling v1.6 Pro Dynamic (cfg 0.5) /
       Seedance 1 Pro (ByteDance, cinematic motion).
       Job + polling 아키텍처로 6-8분 long-running 응답 안정 처리,
       Supabase Storage 영구 저장, 클립별 다운로드/URL 복사 버튼.
    ↓
Stage 5 (Humanize KR 자동 후처리)
    · im-not-ai v2.0 룰북 (40+ AI 패턴) 기반 자체 검증 + 재작성
    · 한국어 리포트·기술서 본문에만 적용 (사실·수치·고유명사 100% 보존)
```

**○ 핵심 기술**

- **재현성 보장 키**: 입력 JSON을 키 정렬·소문자화·trim 후 SHA-256 해시. `ch_recommendations.input_hash` 컬럼에 영구 저장. 평가 시점에 `dataset_split`('train'/'test'/'holdout'/'prod')으로 학습·평가셋 분리.
- **공공데이터 anchor**: 외부 API 4종(Hofstede 데이터 테이블·World Bank Open Data·KOTRA·UN Comtrade)을 standalone 호출. 30초 내 4-anchor fetch 완료. 실패한 anchor는 자동 skip하고 errors 배열에 기록 (best-effort).
- **LLM JSON 출력 강제**: Anthropic provider에 jsonSchema 전달, `recoverJsonFromText`로 마크다운 fence 자동 제거. 다중 LLM 응답 안정성 확보.
- **자가 검증 윤문**: im-not-ai 룰북의 40+ 패턴(A-1 "에 대해" / D-1 "결론적으로" / H-1 "또한·따라서" 등) 자동 탐지 → 학술 인용 기반(김도훈 2009·박옥수 2018·전영철 2007) 재작성 + 6항 자가검증 (사실·register·장르·인공표현·S1잔존·S2잔존).

**○ 서비스 시나리오**

1. **시나리오 A — 단건 입력 (소상공인)**: 화장품 제조사가 "비건 쿠션 파운데이션, 베트남 진출" 입력 → 90초에 적합 사업 Top-3 (서울 동남아 진출 지원사업·ESG 컨설팅·서울어워드) + 베트남 시장 분석 리포트 (Hofstede 29·Comtrade $5.2억 +6.2%) + 5개국어 기술서 + 상세페이지 mockup 일괄 생성.
2. **시나리오 B — CSV Batch (심사기관·정책기관)**: 200개 기업 일괄 평가 → CSV 결과 + input_hash로 재현성 자동 검증 → 2회차 실행 100% 일치 확인.
3. **시나리오 C — 사용자 체험평가 (본선)**: 중소기업·소상공인이 markettwin.ai 본 서비스에서 직접 체험 → 우수 솔루션에 크레딧 배분 (블라인드 비교).

### 1-2. 개발 추진일정

| 단계 | 기간 | 주요 업무 | 산출물 |
|---|---|---|---|
| **신청·접수 (현재)** | 5/11 ~ 6/5 | bizinfo 1,385개 공공 데이터 사전 적재 · 라이브 데모 시스템 95% 완성 · 사업계획서 제출 | 작동 시스템 + 사업계획서 |
| **서류평가** | 6/8 ~ 6/12 | (해당 없음 — 심사기관 평가) | — |
| **개발·실증 1주차** | 6/15 ~ 6/19 | 챌린지 제공 데이터셋(판판대로·수출바우처 실데이터) 수령 → bizinfo 대체 적재 → 임베딩 재생성 | 실데이터 매칭 가동 |
| **개발·실증 2-4주차** | 6/22 ~ 7/10 | 매칭 정확도 검증 · 평가셋(holdout) 분리 · LMArena 방식 자가 벤치마크 (Raw GPT-4/Gemini/Claude vs 자사 grounding+humanize 솔루션) | 정확도 리포트 |
| **개발·실증 5-7주차** | 7/13 ~ 7/31 | 사용자 체험 UX 폴리시 · 모바일 반응형 · 접근성(WCAG AA) · CSP·CSAP 보안 점검 | 본선 체험용 release |
| **개발·실증 8-10주차** | 8/3 ~ 8/21 | 발표자료 제작 · 모의 시연 · 정확도/재현성 수치 최종 측정 · 데이터 거버넌스 문서화 | 발표 PPT + 시연 영상 |
| **본선평가** | 8/24 ~ 8/28 | 사용자 체험평가 + 20분 대면발표 + AI 솔루션 시연 | 최종 평가 |

---

## 2. 혁신성

### 2-1. 사용된 AI 알고리즘 및 AI 파운데이션 모델 추진체계

**○ 멀티 파운데이션 모델 아키텍처**

단일 모델 의존을 피하고 각 단계의 특성에 맞는 모델을 선택:

| 단계 | 모델 | 선택 이유 |
|---|---|---|
| 임베딩 | OpenAI text-embedding-3-small (1,536d) | 한국어/영어 동시 지원, 1M 토큰 \$0.02로 경제적 |
| 추천 rerank | Anthropic Claude Sonnet 4.6 | 한국어 reasoning 품질 최상, temperature=0 안정성 |
| 시장분석 리포트 | Anthropic Claude Sonnet 4.6 | grounding 인용 + JSON 엄수 |
| 다국어 기술서 (9-field) | Anthropic Claude Sonnet 4.6 | KR·EN·JP·TW-zh·CN-zh × 9 필드 / locale 자연스러운 카피 |
| 상세페이지 풍부 데이터 | Anthropic Claude Sonnet 4.6 | detail_specs / scenarios / FAQ 동일 LLM 호출 합산 |
| 윤문 (Humanize KR) | Anthropic Claude Sonnet 4.6 | im-not-ai 룰북 40+ 패턴 탐지·재작성 + 자가검증 |
| 영상 motion prompt (smart) | Anthropic Claude Haiku 4.5 | 제품별 자동 cinematic prompt 생성 (~\$0.003/회) |
| 홍보영상 (3-model 선택) | Kling v1.6 Pro Stable / Dynamic / Seedance 1 Pro | 사용자 비교 후 선택. Stable=안정, Dynamic=cinematic, Seedance=최상위 motion |
| TTS 보이스오버 (Tier C) | OpenAI gpt-4o TTS Nova | 한국어 자연스러움 +다국어 지원 |
| 백업 LLM 풀 | OpenAI GPT-4 / Google Gemini / DeepSeek / xAI | 1개 모델 장애 시 자동 failover (검증 완료) |
| 영구 저장 | Supabase Storage + Postgres | 영상·이미지·생성물 모두 24h Replicate URL 만료 회피 + ?hash= permalink |

**○ 혁신성·차별성 (9가지)**

**① 재현성 100% 수학적 보장**

다른 LLM 솔루션은 "동일 입력 → 매번 다른 출력" 한계로 정량 평가가 불가능하다. 본 시스템은 입력을 정규화한 후 SHA-256 해싱하여 `input_hash` 컬럼에 저장, 동일 input_hash가 있으면 캐시된 결과를 그대로 반환. 평가 시점에 `dataset_split` 컬럼으로 학습·평가셋을 격리하여 데이터 누출(leakage) 방지.

- 검증: 동일 3건 입력 2회 실행 → input_hash 100% 일치 (3/3)
- 검증: Top-3 추천 순위·점수·이유 모두 동일 (similarity 4th decimal place만 ±0.0001 pgvector 부동소수점 잡음)

**② 공공데이터 grounding 4종 anchor (변별력 핵심)**

타 응모자가 raw LLM으로 "동남아 화장품 시장은 성장 중..." 일반론 리포트를 산출할 때, 본 시스템은 30초 내 4개 정부·UN·국제기구 데이터를 fetch하여 LLM 프롬프트에 grounding으로 주입. LLM은 grounding을 직접 인용하도록 시스템 프롬프트에서 강제:

- Hofstede 6-dim 문화거리 (KR ↔ 타겟국 0-100점)
- World Bank GDP per capita PPP + 인구 + 가계소비 PPP
- KOTRA korCompList 타겟국 진출 한국기업 목록
- UN Comtrade KR→타겟국 HSCode 3년 수출 추세 + YoY 성장률

수치는 한국식 단위로 자동 표기 (예: "1억 100만 명", "8,660억 달러", "5억 1천만 달러") — 미국식 "101.0M" 대비 정부 보고서·공공기관 보고에 그대로 활용 가능.

실제 검증 (정관장 홍삼정/중국 진출): "World Bank: 중국 가계소비 15.2조 달러(2024)", "Hofstede 문화거리 KR↔CN 27점", "KOTRA: 중국 진출 한국 식품기업 CJ·오리온", "UN Comtrade: KR→CN 식품(HS19/20/21) 수출 8억 달러(2024), YoY +3.8%" — 4 anchor 모두 LLM 리포트에 정확히 인용 확인.

**③ AI 자연도 자동 정정 (im-not-ai 룰북 통합, MIT)**

오픈소스 im-not-ai v2.0 (epoko77-ai/im-not-ai)의 학술 룰북(김도훈 2009·박옥수 2018·전영철 2007·곽은주·진실로 2011 등)을 system prompt로 이식, 40+ AI 패턴(A-1 "에 대해" 직역 / D-1 "결론적으로" 결산 피벗 / H-1 "또한·따라서" 문두 접속사 등) 자동 탐지·재작성. 6항 자가검증 (사실 보존·register·장르·인공 표현·S1 잔존·S2 잔존)으로 변경률 30% 초과 시 경고, 50% 초과 시 강제 롤백.

실제 검증 (415자 AI 샘플): 변경률 27%, 등급 A, 17건 탐지, 잔존 S1·S2 모두 0.

**④ CSV Batch 평가 모드 (심사 친화)**

심사기관이 사업계획서로 평가하기보다 실 시스템으로 200건 테스트셋을 일괄 처리하는 시나리오를 사전 지원. 동시 LLM 호출 2개(rate limit 고려), 진행률 바, 결과 CSV 다운로드, 재현성 자동 검증 (2회차 실행 + input_hash 비교).

**⑤ 라이브 시스템 보유 (사업계획서 단계 95% 구현 완료)**

대부분 응모자가 사업계획서로만 제출할 때, 본 신청자는 https://app.markettwin.ai/sme-strategy 에서 심사위원이 즉시 클릭하여 검증 가능. 신청·접수 단계에서 데이터셋이 미제공인 점을 고려해 기업마당(bizinfo.go.kr) 공개 API에서 1,385개 정부 지원사업을 자체 수집·임베딩하여 가동.

**⑥ 다국어 상품기술서 9-필드 풍부화 + locale별 톤 가이드**

기존 다국어 카피라이팅 도구는 단순 headline/body만 산출. 본 시스템은 5개 locale × 9개 필드를 한 번의 LLM 호출에 생성:

- **headline** (≤60자) + **subtitle** (≤100자, 신규)
- **tagline** (≤120자) + **body** 400-700자 (이전 200-400자에서 2배 확장)
- **bullets** 3-5개 핵심 spec
- **features** 5-7개 상세 feature (title + 1-2문장 설명, 신규)
- **target_audience** 2-3 페르소나 (persona + pain_point, 신규)
- **brand_story** 50-150자 감성 스토리 (신규)
- **seo_keywords** 5-8개 locale별 실검색 키워드 (신규)
- **CTA** 행동 유도 문구

각 locale 별 톤 가이드 자동 적용: KO Smartstore 친근체 / EN Benefit-driven SEO / JA 정중 안전성 강조 / ZH-TW Shopee 가격·할인 / ZH-CN Tmall 브랜드 신뢰성.

**⑦ 상세페이지를 기술서와 차별화 (e-commerce 풀 페이지)**

이전엔 상세페이지 mockup이 다국어 기술서를 그대로 표시 → 두 산출물 중복. 본 시스템은 상세페이지 전용 풍부 데이터 3종을 한국어로 별도 생성:

- **detail_specs** 5-8개 spec 표 (소재·사이즈·컬러·원산지·인증·구성품 등)
- **usage_scenarios** 3-5개 사용 시나리오 (title + description)
- **FAQ** 3-5개 (사이즈/세탁/배송/교환/A/S 등 실 구매 의사결정 질문)
- **배송·환불 boilerplate** (평일 14시 출고 / 7일 변심 환불 / 30일 하자 무상 등)

이제 ② 기술서 = 짧은 카피 (channel-ready), ③ 상세페이지 = 풀 페이지 스크롤형 명확히 분리.

**⑧ 홍보영상 3-tier × 3-model selector (사용자 선택)**

홍보영상 콘텐츠는 단일 모델 의존이 아닌 3 tier × 3 model 매트릭스로 사용자가 직접 선택:

| Tier | 출력 | 비용 (5초/10초) |
|---|---|---|
| **A** 단일 클립 | smart motion prompt + 단일 영상 | \$0.50 / \$1.00 |
| **B** 3-scene 스토리보드 | 제품 리빌 → 사용 시나리오 → 클로즈업 (sequential) | \$1.50 / \$3.00 |
| **C** + TTS 보이스오버 | Tier B + OpenAI TTS Nova 한국어 음성 | ~\$1.50 / ~\$3.00 |

| Model | 특징 | 추가 비용 |
|---|---|---|
| **Kling v1.6 Pro Stable** | cfg=0.8, 텍스트 보존 우선, 안정적 | 기본 |
| **Kling v1.6 Pro Dynamic** | cfg=0.5 + cinematic prompt, dramatic motion | 동일 |
| **Seedance 1 Pro (ByteDance)** | 최상위 motion handling, premium feel | +30% |

Smart motion prompt는 Claude Haiku 4.5가 제품 카테고리·특성을 인식해 cinematic mode prompt 자동 생성 (Apple/Dyson/Burberry 스타일). 보수적 "rotation only" 출력 회피.

**⑨ Job + Polling 비동기 아키텍처 + 영구 저장 (production-ready)**

6-8분짜리 long-running 영상 생성을 단일 HTTP 요청으로 처리하면 브라우저·edge proxy idle timeout (보통 60-300s) 으로 "Failed to fetch" 발생. 본 시스템은 다음 아키텍처:

1. **POST /api/challenge/video** (~30s) — Replicate prediction 생성만 후 즉시 `job_id` 반환
2. **GET /api/challenge/video/status?job_id=…** (~2s) — 클라이언트가 5초마다 polling
3. **Supabase Storage 영구 저장** — Replicate URL은 24h 후 만료 → 우리 storage로 mirror
4. **각 클립 다운로드/URL 복사 버튼** — 마케팅·SNS·발표 자료로 즉시 활용
5. **history 페이지 + ?hash= permalink** — 새로고침/북마크/공유 URL로 동일 결과 즉시 복원 (LLM 재호출 0)

이로써 challenge demo·심사위원 시연·실 사용자 모두 long-running 작업이 안정적으로 완료·공유 가능.

### 2-2. 최종 완성될 결과물의 성능 목표

| 지표 | 현재 (bizinfo 1,385건 기준) | 개발·실증 종료 시 목표 (챌린지 실데이터 기준) |
|---|---|---|
| **Task 1 매칭 응답 시간** | 12-14초 (Stage 1 RPC + Stage 2 LLM rerank) | < 15초 (Top-K=5, 후보 풀 60+) |
| **Task 1 재현성** | 100% (동일 input_hash 100% 일치) | 100% 유지 |
| **Task 1 매칭 정확도** | 자체 검증 (서울 동남아 화장품 → 쇼피 진출 사업 1위, 적합도 95) | 심사기관 평가셋 기준 **Top-3 적합도 80% 이상** |
| **Task 2 콘텐츠 생성 시간** | 시장분석 30초 + 다국어 60초(9필드 확장) + 윤문 60초 + 상세페이지 동시 = ~2-3분 (영상 별도) | < 3분 (영상 제외) |
| **Task 2 grounding 인용률** | 4종 anchor 모두 정확히 인용 (Hofstede/WB/KOTRA/Comtrade), 한국식 단위 표기 | 100% 유지, 추정·창작 0건 |
| **Task 2 윤문 등급** | A-B (변경률 20-30%, S1 잔존 0). 정관장 fixture 시장분석 A·3건 / 기술서 A·1건 측정 | A 등급 80% 이상 |
| **Task 2 다국어 기술서 필드 수** | locale 당 9 필드 × 5 locale = 45 필드 | 100% 충족 |
| **Task 2 상세페이지 풍부도** | detail_specs 5-8 + scenarios 3-5 + FAQ 3-5 (기술서와 차별화) | 동일 유지 |
| **Task 2 영상 옵션** | 3-tier × 3-model = 9 조합 (Kling Stable/Dynamic + Seedance 1 Pro) | 사용자 비교 후 default 결정 |
| **Task 2 비용 (회당, 영상 제외)** | ~\$0.20 (시장분석 \$0.04 + 다국어 \$0.12 + 윤문 \$0.07) | 최적화 시 ~\$0.15 |
| **Task 2 영상 비용 (5초 기준)** | Tier A \$0.50 / Tier B \$1.50 / Tier C ~\$1.50 (Kling) — Seedance +30% | 동일 |
| **영상 영구 저장률** | 100% (Supabase Storage mirror, Replicate 24h URL 만료 회피) | 100% 유지 |
| **LMArena 자가 벤치마크 승률** | 미측정 (개발·실증 단계 산출) | Raw GPT-4 baseline 대비 **승률 70% 이상** |
| **CSV Batch 처리 용량** | 200건/회 (현재 제한) | 1,000건/회 (개발·실증 시 확장) |

---

## 3. 가치창출 및 시장성

### 3-1. 현안 해결 노력

**○ 현안 1 — 정보 비대칭으로 인한 미매칭**

판판대로 90개 지원사업·수출바우처 5.8만 프로그램이 운영되지만, 중소·소상공인 입장에서 "내 업종·지역·매출 규모에 맞는 사업이 무엇인지" 파악하는 데 평균 2주가 소요된다 (KOSME 2024 설문). 그 결과 신청 자체를 못 한 기업이 60%에 달함.

**해결**: 입력 90초 → Top-K 추천 + 한국어 매칭 이유 + 적합도 점수 + 신청기간/링크 자동 제공. 추천 결과는 영구 저장되어 동일 입력에 대한 재요청 비용이 0.

**○ 현안 2 — 마케팅 콘텐츠 외주비 부담**

수출 진출 시 다국어 상품기술서·시장분석·홍보영상 외주비가 회당 300만~1,000만 원 발생. 중기부 수출바우처(\$5,000-\$10,000)의 30-50%가 콘텐츠 외주에 소진.

**해결**: 회당 \$0.67(약 900원)에 시장분석 리포트 + 5개국어 기술서 + 상세페이지 + 홍보영상 일괄 생성. 외주 대비 비용 99.97% 절감.

**○ 현안 3 — AI 결과물의 신뢰성 부재**

기존 ChatGPT/Claude 라이트 사용으로 "동남아 시장은 빠르게 성장하고 있다" 일반론을 산출. 정부·기관 보고서 작성용으로 활용 불가.

**해결**: 4종 공공데이터 anchor (Hofstede·World Bank·KOTRA·UN Comtrade) grounding으로 모든 수치를 출처 인용. "UN Comtrade: KR→VN 화장품(HS33) 수출 5억 1천만 달러(2024)" 형식으로 검증 가능.

**○ 현안 4 — AI 글 특유의 어색함**

LLM 출력의 번역체("~에 대해", "~를 통해")·결산 피벗("결론적으로", "본질적으로")·기계적 구조가 보고서·제안서로 사용하기 어색하다.

**해결**: im-not-ai 학술 룰북 자동 후처리로 40+ AI 패턴 정정. 사실·수치·고유명사 100% 보존하면서 자연스러운 한국어 산출.

**○ 기대효과 (정량)**

- **시간 절감**: 매칭 2주 → 90초 (1,300배 단축)
- **비용 절감**: 외주 300만 원 → \$0.67 (4,500배 절감)
- **수출 신청율 증대**: 신청 못 한 60% → 추천 받은 기업이 신청 결정까지 30분
- **수출바우처 활용도 증대**: 콘텐츠 외주비 30-50% → 5% (나머지는 인증·통관·물류 등 본 사용처로 환원)

### 3-2. AI 모델의 경제성 및 확장 방향

**○ 운영비용 구조 (단건 기준)**

| 산출물 | 비용 |
|---|---|
| Task 1 매칭 (임베딩 + LLM rerank + 공공데이터 grounding 4종 fetch) | \$0.14 |
| Task 2 시장분석 리포트 (Claude Sonnet 4.6 + grounding 인용) | \$0.04 |
| Task 2 다국어 기술서 9-필드 × 5 locale | \$0.12 |
| Task 2 Humanize KR 자동 후처리 (im-not-ai 룰북, 2회) | \$0.07 |
| Task 2 상세페이지 풍부 데이터 (detail_specs/scenarios/FAQ — 다국어 LLM에 합산) | \$0 (포함) |
| Task 2 영상 — **Tier A 5초** (Kling Stable/Dynamic, smart Haiku 포함) | \$0.50 |
| Task 2 영상 — **Tier A 5초** (Seedance 1 Pro) | \$0.65 |
| Task 2 영상 — **Tier B 5초 × 3** (스토리보드, Kling sequential) | \$1.50 |
| Task 2 영상 — **Tier B 5초 × 3** (Seedance) | \$1.95 |
| Task 2 영상 — **Tier C** Tier B + OpenAI TTS Nova 한국어 | +\$0.005 |
| Task 2 영상 — **10초 옵션** | × 2 (예: Tier B 10초 \$3.00) |
| Supabase Storage (영상·이미지·생성물) | \$0.021/GB·월 |
| **합계 (영상 제외, 정보형 산출물)** | **\$0.37** |
| **합계 (Tier A 5초 영상 Kling Stable 포함)** | **\$0.87** |
| **합계 (Tier B 5초 × 3 영상 Kling 포함, 권장)** | **\$1.87** |
| **합계 (Tier C 5초 × 3 + TTS, 최대)** | **\$1.88** |

(영상 비용은 회당 1회 호출 기준. 동일 입력 재호출 시 Supabase 영구 저장으로 LLM·Replicate 호출 비용 0. ?hash= permalink로 무한 재열람 가능.)

**○ 업무효율·성과창출 효과**

- 외주 비용 대비 4,500배 절감 (300만 원 → \$0.67)
- 매칭 응답 시간 단축으로 신청 결정까지 평균 시간이 14일 → 30분
- 1인 소상공인도 다국어 5개국 + 영상 + 상세페이지 일괄 보유 가능 → 외주 의존 탈피

**○ 서비스 확산·확장 계획 (3단계)**

**1단계: 챌린지 종료 직후 (2026년 9-12월)**
- markettwin.ai 본 서비스로 상용화 (B2B SaaS, 월 ₩29만/69만/149만 3-tier)
- KOSME·KOTRA·중기부 산하기관과 API 제공 협의 (2천만원 개발자금 + GPU 인프라 활용해 enterprise 안정성 확보)

**2단계: 2027년 (확산기)**
- 중소기업 380만 + 소상공인 700만 (중기부 2024) 중 1% 도달 = 11만 기업
- ISMS-P / ISO 27001 / SOC 2 중 1개 취득하여 공공기관 도입 가능 (CSAP 단계적 추진)
- 외국어 확장: 베트남어·인도네시아어·태국어 추가 (총 8개국어)

**3단계: 2028년 이후 (글로벌)**
- 한국 모델 검증 후 일본 중소기업청(中小企業庁) · 대만 중소기업처 · 베트남 SME Promotion Agency 등 해외 정부 데이터 결합
- 동남아 K-product 진출 컨설팅 표준 인프라화

**○ 정책 기여**

- 중소·소상공인 정부 지원사업 신청율 제고 → 정책 효과 가시화
- 수출바우처 콘텐츠 외주비 → 본 사용처(인증·물류) 환원으로 정부 예산 효율성 제고
- KOSME·KOTRA 평가셋(holdout) 분리 기능으로 향후 모델 평가 거버넌스 확립 가능

---

## 4. 팀 구성

### 4-1. 대표자 현황 및 역량

- **성명**: 이현우 (Chris Hyunwoo Lee)
- **직위**: ㈜미스터에이아이 (Mr.AI Inc.) 대표이사
- **연락처**: hwlee197874@gmail.com · +82-10-7379-2455 · LinkedIn: linkedin.com/in/chrisleekorea
- **주소**: 경기도 용인시 수지구 죽전동 1302

**○ 학력**

| 기간 | 학교 / 학위 |
|---|---|
| 1997.03 ~ 1999.09 | 연세대학교 경영학과 |
| 2002.09 ~ 2004.03 | California State University of East Bay (Business Management) |

**○ 주요 경력**

| 기간 | 회사 / 직위 | 본 챌린지 관련 역할 |
|---|---|---|
| 2026.05 ~ 현재 | **㈜미스터에이아이 (Mr.AI Inc.)** — 대표이사 (Founder & CEO) | 본 챌린지 신청기업. Market Twin / Mr.AI 라이브 SaaS 시스템(app.markettwin.ai) 단독 설계·구축·운영. 사업자등록번호 693-87-03907. |
| 2024.10 ~ 2026.05 | **Tashi Network** — Chief Business Officer (CBO) | 전사 사업전략 수립, 클라이언트·투자자·파트너 관계 관리, 시장 동향 분석 및 성장 기회 발굴 |
| 2022.03 ~ 2024.09 | **Huobi (글로벌 가상자산 거래소)** — Senior Listing Business Development Manager | **동남아·유럽·한국·터키·남미·러시아·미국** 등 멀티 지역 자산 프로젝트 발굴·협력 — 본 챌린지의 "다국 시장 진출 지원"과 직접 정합 |
| 2020.05 ~ 2022.02 | **Xeno NFT Hub** — Chief Operating Officer (COO) | CMO·마케팅팀과 단·장기 마케팅 전략 수립, 전략 파트너십 개발 |
| 2020.07 ~ 2022.03 | **Anchor Value Limited** — Strategy & Marketing | 블록체인 프로젝트 전략 기획, 디지털 마케팅·소셜미디어 운영, C-level 사업개발 |
| 2020.05 ~ 2020.11 | **Bithumb Futures Exchange** — Korean Team Leader | 신규 플랫폼 한국 시장 진출(현지화·마케팅), 파생상품 사업개발 |
| 2019.04 ~ 2020.05 | **LATOKEN Exchange** — Director of Asia Pacific | **마케팅 자료·웹사이트·문서 다국어 현지화** — 본 챌린지 다국어 상품기술서 산출물과 직접 정합 |
| 2018.06 ~ 2019.04 | **Cryptomeca Limited** — Director of Business Development | Isle of Man·Singapore 법인 설립 및 라이센스 취득, 지역·산업별 시장 조사 |
| 2010.05 ~ 2012.03 | **Canadean Limited (영국 시장조사 기업)** — Freelance Consultant | **한국 음료·맥주 시장 조사** — 본 챌린지 "중소기업 시장진출 분석"과 직접 정합 |
| 2003.09 ~ 2005.10 | **Orcom USA, Inc.** — Regional Manager | 한국 LCD TV 제조사 미국 진출 — **문서·웹사이트·제품 현지화, 정부기관·법인 고객 (호텔·병원) 조달 영업** — 본 챌린지의 "K-product 글로벌 진출" 본질과 직접 정합 |
| 2001.03 ~ 2003.08 | **Drybay Inc.** (Bay Area, California) — Marketing Associate | 미국 베이 에어리어 최초 온라인 드라이클리닝 서비스 기업 — Oracle·Cisco·KPMG·San Francisco Police Department·OpenWave·Maxtor·Siebel 등 **실리콘밸리 대기업 B2B 계정 마케팅 및 관계 관리**, 신규·기존 고객 마케팅 자료 제작, 매출 증대 전략 수립. 본 챌린지의 "B2B SaaS 사업개발" 모델 정합. |

**○ 본 챌린지 직접 정합 역량 4가지**

1. **다국 시장 진출 25년 실전 경험** — 미국(2001-2005)·한국(2008-)·동남아·유럽·터키·러시아·남미(Huobi 2022-2024) 등 모든 주요 K-product 타겟 시장 실무 경험. 본 챌린지가 요구하는 "중소·소상공인 해외 시장진출 추천"의 도메인 지식 보유.
2. **한국 산업·시장 조사 전문성** — 영국 시장조사 기업 Canadean Limited의 한국 음료·맥주 시장 조사(2010-2012), Cryptomeca Limited의 지역·산업별 시장 조사(2018-2019). KOSME·KOTRA가 다루는 한국 중소기업 데이터 해석 능력.
3. **다국어 마케팅 현지화 실무** — LATOKEN(2019-2020) 마케팅 자료·웹사이트·문서 다국어 현지화 직접 수행, Orcom USA(2003-2005) 한국 제조사 미국 진출 시 문서·웹사이트·제품 현지화 총괄. 본 챌린지 Task 2 다국어 상품기술서(KR/EN/JP/TW-zh/CN-zh) 산출물의 품질 평가 능력.
4. **C-level 다년 운영 경험** — CEO(㈜미스터에이아이 2026~)·COO(Xeno NFT 2020-2022)·CBO(Tashi Network 2024-2026) 직책으로 사업 전략·예산·운영·파트너 관리 전 영역 책임 수행. Cryptomeca Limited Director of BD(2018-2019) 때 Isle of Man·Singapore 법인 설립 및 라이센스 취득 직접 수행. 챌린지 통과 후 ㈜미스터에이아이 운영 안정성·자금 집행 신뢰성 확보.

**○ 언어 능력**
- 한국어 / 영어 / Native bilingual (Singapore International School 1988-1991, California State Univ. 2002-2004 수학)
- 글로벌 컨퍼런스 발표 경험 (Singapore Consensus, Bangkok Beyond Block)

**○ 본 시스템(Market Twin / Mr.AI) 개발 역량**
- 1인 창업자 모델로 Next.js 16 + Supabase + Multi-LLM(Claude/GPT/Gemini) 기반 라이브 SaaS 시스템 직접 설계·구축
- AI 보조 개발 도구(Claude Code) 활용해 비엔지니어 출신 창업자가 풀스택 시스템 구축한 사례
- 25년 비즈니스 전략 + 2년 AI 보조 풀스택 개발 = **본 챌린지의 도메인 전문성(시장진출)과 기술 구현 능력을 동시에 보유한 1인 founder 모델**

### 4-2. 팀원 현황 및 역량

※ 1인 기업으로 신청. 개발·실증 단계에서 다음 직무 인원 보강 예정.

| 순번 | 직급 | 성명 | 주요 담당업무 | 보유역량 (경력 및 학력 등) | 구성 상태 |
|---|---|---|---|---|---|
| 1 | 대표이사 | 이현우 | 전체 아키텍처 · LLM 엔진 · 백엔드 | (※ 학력·경력 사용자 확인 후 기재) | 완료 |
| 2 | (예정) | — | 데이터 엔지니어 (판판대로·수출바우처 ETL) | Postgres·pgvector 경력 3년+, ML embedding 경력 | 예정('26.07) |
| 3 | (예정) | — | 프론트엔드 · UX 디자이너 (체험평가용 UI) | Next.js·React 경력 3년+, 정부 사업 UX 경험 | 예정('26.07) |
| 4 | (예정) | — | 사업 개발 · 정부 협력 (KOSME·KOTRA) | 중소기업 정책·수출지원 경력 5년+ | 예정('26.08) |

(※ 개발·실증 지원금 2천만원으로 추가 인력 단기 계약 또는 외주 협업)

---

## 5. 기타

### 5-1. 수상이력 사항

해당사항 없음.

### 5-2. 유사 대회 참여 또는 개발 이력

해당사항 없음. (본 챌린지가 ㈜미스터에이아이의 첫 정부 공모전 참여이며, 직전 단독 개발한 Market Twin / Mr.AI 라이브 시스템 자체가 본 챌린지 과제와 거의 1:1 매칭되는 도메인이라 자연스러운 정합.)

---

## 부록 — 시스템 검증 증거 (선택 첨부)

심사위원이 신청 시점에 즉시 검증 가능한 증거:

1. **라이브 데모 URL**: https://app.markettwin.ai/sme-strategy
   - Task 1 추천: `/sme-strategy/recommend` (단건 입력 + CSV Batch)
   - Task 2 콘텐츠: `/sme-strategy/content` (4종 산출물 일괄)
   - API 문서: `/sme-strategy/api`
   - 팀·아키텍처: `/sme-strategy/about`

2. **재현성 검증 스크린샷**: CSV Batch 3입력 2회 실행 → input_hash 100% 일치 (3/3 row) 배너 캡처

3. **공공데이터 grounding 결과 스크린샷**: 화장품/베트남 진출 입력 → Hofstede 29 + World Bank 가계소비 8,660억 달러 + KOTRA 16개사 + Comtrade 5억 1천만 달러 + YoY +6.2% 인용

4. **Humanize KR 적용 비교 스크린샷**: 원문 415자 → 윤문 286자 (변경률 27%, 등급 A, 17건 탐지)

5. **GitHub 저장소**: (사용자 결정 — 공개 시 추가 기재)

---

**※ 본 문서 작성 가이드**:
- 파란색 안내 문구는 모두 검정색 본문으로 대체했음 (양식 지시 준수)
- 표 안 행은 추가됨 (양식 지시: 추가 가능)
- 이미지 placeholder는 실제 스크린샷으로 교체 후 hwpx 양식에 삽입
- 4-1 대표자 학력·경력 / 5-1 수상 / 5-2 유사대회 항목은 사용자 확정 정보로 보완 필요

**파일 변환**: 본 마크다운을 한글(hwpx) 양식의 각 섹션에 복사·붙여넣기. 표는 한글 표 도구로 재작성. 굵은 글씨·이탤릭은 한글 서식으로 적용.
