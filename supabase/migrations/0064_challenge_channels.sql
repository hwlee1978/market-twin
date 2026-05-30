-- KOSME + KOMA 챌린지 데이터 통합 — 판판대로 (내수) + 수출바우처 (수출).
--
-- 출처: 중소벤처기업진흥공단 (KOSME) + 한국중소벤처기업유통원 (KOMA)
--       시장진출 전략 추천 챌린지 (과제번호 20457281, 2026-05).
-- 데이터 규모: 판판대로 (90 지원사업 + 7만 선정기업 + 7만 제품) +
--             수출바우처 (5.8만 프로그램 + 1.1만 수출성과).
-- 제공 형식: CSV / Excel — `scripts/ingest-challenge-data.ts`로 적재.
--
-- 거버넌스 (challenge-2026-opendata 메모리):
--   - 챌린지 운영기관 가이드라인 따라 비식별화 후 활용
--   - workspace_id 격리 — 챌린지 데이터는 system workspace에 적재되어
--     모든 워크스페이스가 read-only로 참조하는 reference DB
--   - 프로젝트 종료 시 약관 따라 환원 또는 폐기
--
-- Naming: ch_* prefix로 챌린지 데이터임을 표시 (mrai_ / public 일반
-- 테이블과 격리). 매칭/추천 모델 결과는 ch_recommendations에 저장.

-- ─── 판판대로 — 내수 지원사업 ──────────────────────────────────────
create table if not exists public.ch_pp_programs (
  id                   uuid primary key default gen_random_uuid(),
  -- 원본 데이터의 사업명 (사업 식별 키 역할 — 챌린지 측 PK 없음)
  source_id            text,
  program_name         text not null,
  program_purpose      text,
  eligibility          text,                  -- 지원대상 (raw text)
  support_content      text,                  -- 지원내용 (raw text)
  organization         text,                  -- 운영 기관
  application_period   text,                  -- 신청 기간 (raw, parse 후 timestamptz 컬럼 추가 예정)
  -- 카테고리 정규화 (LLM으로 추출 후 채움)
  category_normalized  text,
  region               text,
  -- 임베딩 (Phase B에서 추가 — pgvector 활성화 필요)
  embedding            vector(1536),
  ingested_at          timestamptz not null default now(),
  source_year          integer,               -- 최근 3개년 구분 (2023/2024/2025)
  raw                  jsonb                  -- 원본 row 보존 (스키마 진화 대비)
);
create index if not exists ch_pp_programs_year_idx on public.ch_pp_programs (source_year);
create index if not exists ch_pp_programs_category_idx on public.ch_pp_programs (category_normalized);

-- ─── 판판대로 — 선정 기업 ──────────────────────────────────────────
create table if not exists public.ch_pp_companies (
  id                  uuid primary key default gen_random_uuid(),
  business_no         text,                   -- 사업자등록번호 (비식별화 후엔 해시값)
  business_no_hash    text,                   -- SHA-256 해시 (조인 키)
  company_name        text not null,
  industry            text,                   -- 업종 코드 또는 명칭
  region              text,
  revenue_band        text,                   -- 매출액 (구간 — 정확한 원본 보존은 raw에)
  employee_band       text,
  founded_year        integer,
  selected_program    text,                   -- 선정 받은 지원사업명 (program_name과 매칭)
  selected_year       integer,
  ingested_at         timestamptz not null default now(),
  raw                 jsonb
);
create index if not exists ch_pp_companies_industry_idx on public.ch_pp_companies (industry);
create index if not exists ch_pp_companies_hash_idx on public.ch_pp_companies (business_no_hash);

-- ─── 판판대로 — 선정 기업 제품 ─────────────────────────────────────
create table if not exists public.ch_pp_products (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references public.ch_pp_companies(id) on delete cascade,
  product_name        text not null,
  category            text,
  description         text,
  detail_page_url     text,
  price_krw           bigint,
  -- 제품 임베딩 — Phase B 추천 매칭의 핵심
  embedding           vector(1536),
  ingested_at         timestamptz not null default now(),
  raw                 jsonb
);
create index if not exists ch_pp_products_company_idx on public.ch_pp_products (company_id);
create index if not exists ch_pp_products_category_idx on public.ch_pp_products (category);

-- ─── 수출바우처 — 프로그램 ─────────────────────────────────────────
create table if not exists public.ch_voucher_programs (
  id                  uuid primary key default gen_random_uuid(),
  source_id           text,
  program_name        text not null,
  eligibility         text,
  support_content     text,
  selection_criteria  text,
  organization        text,
  application_period  text,
  category_normalized text,
  embedding           vector(1536),
  source_year         integer,
  ingested_at         timestamptz not null default now(),
  raw                 jsonb
);
create index if not exists ch_voucher_programs_year_idx on public.ch_voucher_programs (source_year);

-- ─── 수출바우처 — 수출 성과 ────────────────────────────────────────
create table if not exists public.ch_voucher_exports (
  id                  uuid primary key default gen_random_uuid(),
  business_no_hash    text,                   -- 판판대로 companies와 조인 가능
  company_name        text,
  industry            text,
  -- 수출 데이터
  destination_country text,                   -- ISO-2 (KR→US 같은 단방향만 저장)
  export_amount_usd   numeric(18,2),
  export_year         integer,
  voucher_program     text,                   -- 사용한 바우처 프로그램명
  ingested_at         timestamptz not null default now(),
  raw                 jsonb
);
create index if not exists ch_voucher_exports_hash_idx on public.ch_voucher_exports (business_no_hash);
create index if not exists ch_voucher_exports_country_idx on public.ch_voucher_exports (destination_country);
create index if not exists ch_voucher_exports_year_idx on public.ch_voucher_exports (export_year);

-- ─── 추천 결과 (Phase B 산출물) ────────────────────────────────────
-- 사용자 워크스페이스 입력 → 적합 판로 추천 결과 저장.
-- 학습/테스트 분리 + 재현성 검증을 위해 매 실행의 input + output 보존.
create table if not exists public.ch_recommendations (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid references public.workspaces(id) on delete cascade,
  -- Input snapshot (재현성 키)
  input_company       jsonb not null,         -- {industry, products[], region, revenue_band, ...}
  input_hash          text not null,          -- SHA-256 of normalized input (재현성 검증)
  -- Output: top-N program recommendations
  recommendations     jsonb not null,         -- [{program_id, type, score, reason}]
  -- Provenance
  model_version       text not null,          -- "v1.0" 등 — 재훈련 시 증분
  dataset_split       text,                   -- "train" / "test" / "holdout" / "prod"
  generated_at        timestamptz not null default now(),
  generation_ms       integer,
  cost_usd            numeric(8,4)
);
create index if not exists ch_recommendations_ws_idx on public.ch_recommendations (workspace_id);
create index if not exists ch_recommendations_input_hash_idx on public.ch_recommendations (input_hash);

-- ─── A/B 테스트 결과 (Phase E) ─────────────────────────────────────
-- LMArena 방식 블라인드 비교. 사용자 또는 평가단이 두 콘텐츠 중 선택.
create table if not exists public.ch_ab_battles (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid references public.workspaces(id) on delete cascade,
  prompt              text not null,
  -- 두 응답 (model + content). model_a/b는 평가 시점에 사용자에게 숨김.
  model_a             text not null,
  output_a            jsonb not null,
  model_b             text not null,
  output_b            jsonb not null,
  -- 평가 결과
  winner              text,                   -- 'A' / 'B' / 'tie' / null (미평가)
  evaluator_user_id   uuid references auth.users(id) on delete set null,
  evaluated_at        timestamptz,
  -- 콘텐츠 타입 분류 (시장분석 / 다국어 기술서 / 홍보영상 / 상세페이지)
  content_type        text,
  created_at          timestamptz not null default now()
);
create index if not exists ch_ab_battles_type_idx on public.ch_ab_battles (content_type);
create index if not exists ch_ab_battles_winner_idx on public.ch_ab_battles (winner);

-- ─── RLS ──────────────────────────────────────────────────────────
-- 챌린지 reference 데이터 (ch_pp_*, ch_voucher_*): RLS 비활성. 모든
-- 사용자가 읽을 수 있는 공용 reference. 쓰기는 service role만.
alter table public.ch_pp_programs disable row level security;
alter table public.ch_pp_companies disable row level security;
alter table public.ch_pp_products disable row level security;
alter table public.ch_voucher_programs disable row level security;
alter table public.ch_voucher_exports disable row level security;

-- 사용자별 결과 (ch_recommendations, ch_ab_battles): workspace 격리.
alter table public.ch_recommendations enable row level security;
alter table public.ch_ab_battles enable row level security;

create policy "ch_recommendations_rw_members"
  on public.ch_recommendations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "ch_ab_battles_rw_members"
  on public.ch_ab_battles
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

comment on table public.ch_pp_programs is
  '판판대로 내수 지원사업 정보 (~90개). KOSME 챌린지 제공 데이터.';
comment on table public.ch_pp_companies is
  '판판대로 선정 기업 (~7만社). 사업자번호 SHA-256 해시로 비식별화.';
comment on table public.ch_pp_products is
  '판판대로 선정 기업 제품 (~7만). 매칭 모델의 product embedding 소스.';
comment on table public.ch_voucher_programs is
  '수출바우처 프로그램 정보 (~5.8만). KOMA 챌린지 제공 데이터.';
comment on table public.ch_voucher_exports is
  '수출바우처 수출성과 (~1.1만). business_no_hash로 ch_pp_companies와 조인.';
comment on table public.ch_recommendations is
  'Phase B 추천 모델 실행 결과. input_hash로 재현성 검증.';
comment on table public.ch_ab_battles is
  'Phase E LMArena 방식 블라인드 A/B 비교 결과.';
