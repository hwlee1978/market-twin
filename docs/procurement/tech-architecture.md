# Market Twin 기술 아키텍처 자료 (나라장터 제출용)

> 작성일 2026-06-18 · 제품: **Market Twin** (한국 제품의 해외 진출을 출시 전에 검증하는 AI 시장 시뮬레이션 SaaS)
> 운영사: 주식회사 미스터에이아이 (Mr.AI Inc.)

---

## 0. 인프라 운영 형태 — 먼저 정확히 (중요)

Market Twin은 **서버리스 PaaS(Platform as a Service)** 기반으로 운영됩니다.

| 구성 | 사용 플랫폼 | 비고 |
|---|---|---|
| 애플리케이션 호스팅 | **Vercel** (Next.js 서버리스) | AWS 인프라 위에서 운영 |
| 데이터베이스·인증·스토리지 | **Supabase** (Managed PostgreSQL) | **AWS `ap-northeast-1`(도쿄) 리전** 위에서 운영 |
| DNS / CDN | Porkbun (Cloudflare 기반) + Vercel Edge | |

> **제출 시 표기 주의**: Market Twin은 EC2·RDS·S3 등 **AWS 원시 서비스를 직접 구축·운용하는 형태가 아니라**, AWS 인프라 위에서 동작하는 관리형 PaaS(Vercel·Supabase)를 활용합니다. 따라서 "AWS 직접 구축"이 아니라 **"AWS 글로벌 인프라 기반 PaaS 활용"**으로 기재하는 것이 사실에 부합합니다. 아래 §A에 AWS 원시 서비스와의 대응(매핑) 표를 함께 제공합니다.

---

## A. 시스템 아키텍처

### A-1. 구성도

```
                         ┌────────────────────────────────────────┐
   [사용자 브라우저]      │  외부 서비스 (HTTPS/TLS)                 │
        │ HTTPS/TLS       │   • LLM: Anthropic·OpenAI·Google·xAI·   │
        ▼                 │          DeepSeek                       │
 ┌───────────────┐        │   • 결제: Stripe(USD)·Toss(KRW)         │
 │ Vercel Edge   │        │   • 메일: Resend                        │
 │ (CDN·정적자산) │        │   • 모니터링: Sentry·PostHog            │
 └──────┬────────┘        │   • 데이터: UN Comtrade·World Bank·     │
        │                 │            KOSIS·KOTRA·Tavily 등        │
        ▼                 └───────────────▲────────────────────────┘
 ┌────────────────────────┐               │
 │ Vercel Serverless Fn   │───────────────┘
 │ (Next.js 16 App)       │   서버 라우트에서만 외부 API 호출
 │  - 프론트엔드(React 19) │
 │  - API(Route Handlers) │
 │  - 미들웨어(인증 가드)  │
 └──────┬─────────────────┘
        │ (RLS 적용 SQL / Auth / Storage)
        ▼
 ┌────────────────────────────────────────┐
 │ Supabase  (AWS ap-northeast-1, 도쿄)    │
 │  • PostgreSQL 15 + Row-Level Security   │
 │  • Auth (이메일 확인·OAuth)             │
 │  • Storage (이미지/리포트)              │
 │  • pgvector (의미 검색)                 │
 └────────────────────────────────────────┘
```

### A-2. 계층 구조

| 계층 | 기술 | 역할 |
|---|---|---|
| 프레젠테이션 | Next.js 16 / React 19 / TypeScript / Tailwind | UI, 다국어(ko/en) |
| 애플리케이션 | Vercel Serverless Functions (Next.js Route Handlers, Node.js) | API, 시뮬레이션 오케스트레이션, 인증 가드 |
| 데이터 | Supabase PostgreSQL 15 + RLS | 멀티테넌시 데이터, 트랜잭션 |
| 스토리지 | Supabase Storage | 업로드 이미지·생성 리포트 |
| 외부 연동 | LLM·결제·메일·통계 API | AI 추론, 과금, 알림, 시장 데이터 |

### A-3. AWS 원시 서비스 대응(참고 매핑)

순수 AWS 아키텍처로 재구성할 경우의 대응 관계입니다(현재는 PaaS로 추상화되어 운영).

| 현재(PaaS) | 동등 AWS 원시 서비스 | 기능 |
|---|---|---|
| Vercel Serverless Functions | AWS Lambda + API Gateway | 서버리스 API 실행 |
| Vercel Edge / CDN | Amazon CloudFront | 정적 자산·엣지 캐싱 |
| Supabase PostgreSQL | Amazon RDS / Aurora (PostgreSQL) | 관계형 DB |
| Supabase Auth | Amazon Cognito | 사용자 인증 |
| Supabase Storage | Amazon S3 | 객체 스토리지 |
| Vercel Cron | Amazon EventBridge (Scheduler) | 예약 작업 |

---

## B. 데이터베이스 ERD

### B-1. 핵심 엔티티 (시뮬레이션 엔진)

```
auth.users (Supabase Auth)
      │
      ▼
 workspaces ──1:N── workspace_members ──N:1── auth.users
      │  1:1
      ├──────────── subscriptions (결제/플랜 상태)
      │  1:N
      ▼
   projects ──1:N── ensembles ──1:N── simulations ──1:1── simulation_results
                       │                   │  1:1── simulation_quality
                       │                   └  1:N── simulation_persona_reactions ──N:1── personas
                       │
                       ├──1:N── beta_result_feedback (만족도 설문)
                       └──1:N── outcome_feedback (출시 결과 보정)
```

| 테이블 | 핵심 컬럼 | FK |
|---|---|---|
| **workspaces** | id(PK), name, company_name, status(active/suspended/archived), plan | — |
| **workspace_members** | (workspace_id, user_id)(PK), role(owner/admin/analyst/viewer) | → workspaces, auth.users |
| **projects** | id(PK), product_name, category, base_price_cents, candidate_countries[], originating_country | → workspaces, auth.users |
| **ensembles** | id(PK), tier(hypothesis~deep_pro), parallel_sims, per_sim_personas, llm_providers[], status, aggregate_result(jsonb), share_token | → projects, workspaces |
| **simulations** | id(PK), status, persona_count, model_provider, success_score, best_country, total_cost_cents | → projects, workspaces, ensembles |
| **simulation_results** | simulation_id(PK), countries·personas·pricing·risks·recommendations(jsonb) | → simulations |
| **simulation_quality** | simulation_id(PK), confidence_score(0-100), quarantined, warnings(jsonb) | → simulations, workspaces |
| **personas** | id(PK), age_range, gender, country, income_band, profession (워크스페이스 재사용 풀) | → workspaces |
| **subscriptions** | id(PK), plan, status, trial_sims_used/limit, payment_provider(stripe/toss), 빌링키 | → workspaces (1:1) |
| **beta_result_feedback** | id(PK), rating(1-5), comment | → workspaces, ensembles |
| **outcome_feedback** | id(PK), launch_status, launch_country, matched_recommendation | → workspaces, projects, ensembles |

### B-2. 참조·감사·로깅 테이블

- **참조 데이터(읽기전용, ETL 적재)**: `country_stats`, `country_profession_income`, `country_consumer_norms`, `category_regulations`, `category_competitors` — 정부·국제기구 통계 기반 시뮬레이션 grounding.
- **감사/로깅**: `audit_logs`(행위 감사), `llm_usage_log`(토큰·비용 추적), `subscription_events`(결제 이벤트 이력), `signup_attempts`(가입 남용 방어).
- **관리/설정**: `admin_users`(관리자 권한), `app_settings`(런타임 토글).

### B-3. 부가 모듈 (Mr.AI 마케팅 자동화 — 베타 비공개)

`mrai_*` 계열 30여 개 테이블(콘텐츠 초안·채널·SEO·지식그래프·메모리 등). **현재 베타에는 비공개**(`NEXT_PUBLIC_MRAI_ENABLED=false`)이며, 본 조달 대상 시뮬레이션 기능과 별도 모듈입니다.

> 전체 스키마는 `supabase/migrations/0001~0074.sql` (74개 버전관리 마이그레이션)로 정의·관리됩니다.

---

## C. 보안 구조

### C-1. 인증·접근통제
- **인증**: Supabase Auth — 이메일/비밀번호(**이메일 확인 필수**) 및 Google OAuth. 비밀번호는 Supabase가 bcrypt 계열로 해시 저장(평문 미보관).
- **세션**: 서버 미들웨어(`src/proxy.ts`)가 모든 요청을 가드. 공개 경로 화이트리스트(`PUBLIC_PATHS`) 외 비인증 접근은 로그인으로 차단.
- **권한(멀티테넌시)**: PostgreSQL **Row-Level Security(RLS)** 전면 적용. `is_workspace_member(workspace_id)` 함수로 "사용자는 자신이 속한 워크스페이스의 행만 접근" 강제. 결과·페르소나 등은 FK 경유 정책으로 간접 보호.
- **권한 분리**: 민감 테이블(`audit_logs`, `llm_usage_log`, `app_settings`)은 공개 RLS 정책 없이 **service-role 전용** 접근.

### C-2. 통신·전송 보안
- 전 구간 **HTTPS/TLS**(Vercel·Supabase 기본). 쿠키는 `httpOnly`·`secure`·`SameSite=lax`.

### C-3. 외부 연동 보안
- **결제 Webhook 검증**: Toss·Stripe 웹훅을 **HMAC-SHA256 서명 검증** + **timing-safe 비교**(`timingSafeEqual`)로 위변조·타이밍 공격 방어. 검증 실패 시 fail-close.
- **결제 정보 토큰화**: 카드정보 미보관. Stripe `customer_id`·Toss `billing_key`(빌링키) 등 **토큰만 저장**, 실제 카드번호는 PG사가 보관.
- **OAuth State 서명**: 외부 계정 연동(Google·HubSpot·LinkedIn·X) 시 state 파라미터를 HMAC 서명해 CSRF 방지.
- **Cron 인증**: 예약 작업 엔드포인트는 `CRON_SECRET` 기반 인증 게이트.

### C-4. 데이터 보호·컴플라이언스
- **국외이전 동의**: 시뮬레이션 추론을 위해 입력 데이터가 해외 LLM 제공자로 전송되며, **가입 시 국외이전 명시 동의**를 필수 수집(감사 메타데이터로 시점·버전 기록).
- **남용 방어**: 가입 시 도메인·IP 기반 trial 남용 탐지(`signup_attempts`), 시뮬레이션 비용 상한(서킷브레이커).
- **감사 추적**: `audit_logs`(행위자·IP·자원), `subscription_events`(결제 이력) 보존.

### C-5. 모니터링·운영
- **오류 추적**: Sentry. **사용 분석**: PostHog(쿠키 동의 후 수집). 운영 토글은 `app_settings`로 런타임 제어.

---

## D. 기술 스택 (실제)

| 구분 | 기술 |
|---|---|
| 언어 | TypeScript |
| 프론트엔드 | Next.js 16, React 19, Tailwind CSS, next-intl(다국어) |
| 백엔드 | Vercel Serverless Functions (Node.js), Next.js Route Handlers |
| 데이터베이스 | Supabase PostgreSQL 15 (Row-Level Security, pgvector) |
| 인증 | Supabase Auth (이메일 확인, Google OAuth) |
| 스토리지 | Supabase Storage |
| AI / LLM | Anthropic Claude, OpenAI GPT, Google Gemini, xAI Grok, DeepSeek (멀티 LLM 앙상블) |
| 결제 | Stripe (USD), Toss Payments (KRW) |
| 이메일 | Resend (SMTP, 도메인 인증) |
| 모니터링 | Sentry (오류), PostHog (제품 분석) |
| 리포트 | @react-pdf/renderer (PDF), pptxgenjs (PPT) |
| 외부 데이터 | UN Comtrade, World Bank, KOSIS, 관세청, KOTRA, Tavily |
| 검증 | Zod (스키마 검증) |
| 인프라 | Vercel (호스팅·CDN·Cron), Porkbun/Cloudflare (DNS) |
| 형상관리 | Git / GitHub, Supabase 버전 마이그레이션(0001~0074) |

---

## E. 운영 정책 (SLA · 백업 · 유지보수)

### E-1. SLA (서비스 수준)

| 항목 | 목표/기준 |
|---|---|
| 서비스 가용성 | **99.5%** (월간 기준) |
| 장애 접수 | **24시간** 접수 (`contact@markettwin.ai`) |
| 중대장애 대응 | **4시간 이내** 대응 착수 |

> 근거: 관리형 PaaS 인프라 기반. Supabase(데이터/인증)와 Vercel(애플리케이션·글로벌 엣지)이 다중화된 클라우드 위에서 운영되며, 99.5% 목표는 보수적으로 설정한 값(월 약 3.6시간 이내 다운 허용)입니다. 오류는 Sentry로 실시간 감지합니다.

### E-2. 백업 정책

| 항목 | 내용 |
|---|---|
| 백업 주기 | **일일 자동 백업** (Supabase 관리형) |
| 보관 기간 | **30일** |
| RPO (복구 목표 시점) | **24시간** (일일 백업 기준 최대 손실 구간) |
| RTO (복구 목표 시간) | **8시간** 이내 |

> 근거: 데이터베이스는 Supabase의 **자동 일일 백업** 및 **Point-in-Time Recovery(PITR)** 로 보호됩니다. 애플리케이션 코드는 Git/GitHub로 전체 형상관리되고, DB 스키마는 **버전 마이그레이션(0001~0074)** 으로 언제든 재현 가능하므로 코드/스키마 차원의 복구 손실은 없습니다. 사용자 업로드 자산은 Supabase Storage에 보관됩니다.

### E-3. 유지보수 정책

| 항목 | 내용 |
|---|---|
| 정기 점검 | **월 1회** |
| 긴급 패치 | **수시** (서버리스 무중단 배포) |

> 근거: Vercel 서버리스의 **무중단 롤링 배포(zero-downtime deploy)** 로 긴급 패치 시에도 서비스 중단이 발생하지 않습니다. 모든 배포는 Git 커밋 단위로 추적·롤백 가능합니다.

---

## 부록 — 제출 시 권고

- "**AWS 기반 PaaS(Vercel·Supabase) 활용**, Supabase는 AWS 도쿄(ap-northeast-1) 리전에서 운영"으로 정확히 기재.
- 데이터 주권이 중요한 공공조달 요건이라면, **Supabase 자체 호스팅(self-hosted) 또는 AWS 서울 리전 이전**이 가능함을 별도 검토 항목으로 명시 가능(§A-3 매핑 참조).
- 본 문서의 수치·구조는 코드베이스(`supabase/migrations/*`, `package.json`, `src/`) 기준이며 사실에 부합합니다.
- SLA·백업 수치(가용성 99.5%, 30일 보관, RPO 24시간/RTO 8시간)는 **실제 Supabase 백업 설정(보관 기간·PITR 활성 여부)과 일치하는지 한 번 확인** 후 확정하시길 권장합니다. 현재 Supabase Pro 기본 백업은 일일·7일 보관이며, 30일 보관·분 단위 PITR은 플랜/설정으로 상향해야 합니다.
