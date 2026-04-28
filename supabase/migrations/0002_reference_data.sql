-- AI Market Twin — country reference data tables (Phase A.1)
-- Grounds simulation in government-published statistics per country.
-- Refreshed annually via ETL scripts in /scripts/. Read-only for app users;
-- writes happen via service role from ETL or admin tools.

-- ──────────────────────────────────────────────────────────────────────────
-- country_stats: per-country metadata + source attribution + headline aggregates.
-- One row per (country, data_year). Letting multiple years coexist keeps
-- historical comparisons and fallback-on-update easy.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.country_stats (
  country_code            text not null,
  data_year               integer not null,
  country_name_en         text not null,
  country_name_local      text,
  currency                text not null,
  population              bigint,
  median_household_income numeric,        -- in `currency`, annual
  gdp_per_capita_usd      numeric,
  source                  text not null,  -- e.g. "KOSIS 2024 가계금융복지조사"
  source_url              text,
  fetched_at              timestamptz not null default now(),
  raw_data                jsonb,          -- full structured payload from source
  primary key (country_code, data_year)
);

-- "Latest year per country" view — what the app reads by default.
create or replace view public.country_stats_latest as
select distinct on (country_code) *
from public.country_stats
order by country_code, data_year desc;

-- ──────────────────────────────────────────────────────────────────────────
-- country_profession_income: income distribution by profession × age group.
-- Lets the persona prompt sample a realistic incomeBand instead of guessing.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.country_profession_income (
  id                      uuid primary key default uuid_generate_v4(),
  country_code            text not null,
  data_year               integer not null,
  -- Canonical machine key for the profession (lowercase, en, snake_case).
  -- Examples: "elementary_teacher", "office_worker", "senior_engineer", "college_student".
  profession_canonical    text not null,
  -- Localized display names: { "ko": "초등학교 교사", "en": "Elementary School Teacher", "ja": "小学校教師" }
  profession_localized    jsonb not null,
  -- Life stage / employment type — lets us flag students, homemakers, retirees as non-salary cases.
  -- Values: "employed" | "student" | "homemaker" | "retiree" | "self_employed" | "unemployed"
  life_stage              text not null default 'employed',
  age_group               text not null,             -- "20-29", "30-39", "40-49", "50-59", "60+"
  -- Income range, in the row's `currency`. Annual unless `income_period` says otherwise.
  income_p25              numeric,
  income_median           numeric,
  income_p75              numeric,
  income_period           text not null default 'annual',  -- "annual" | "monthly"
  currency                text not null,
  -- Optional pre-formatted display string for the prompt, in the LOCALE language.
  -- e.g. {"ko": "연 ₩45M-₩55M (~$34-42k USD)", "en": "₩45M-₩55M annually (~$34-42k USD)"}
  display_band            jsonb,
  source                  text not null,
  unique (country_code, profession_canonical, age_group, data_year, life_stage)
);

create index if not exists cpi_country_year_idx
  on public.country_profession_income(country_code, data_year);
create index if not exists cpi_lifestage_idx
  on public.country_profession_income(country_code, life_stage);

-- ──────────────────────────────────────────────────────────────────────────
-- country_consumer_norms: cultural/behavioral reference per (country, category).
-- Anchors trustFactors / objections / channels in real cultural patterns
-- instead of LLM defaults (which skew US).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.country_consumer_norms (
  country_code            text not null,
  data_year               integer not null,
  -- Maps to project category enum: beauty | fashion | food | health | electronics | home | saas | other
  category                text not null,
  -- All localized: { "ko": [...], "en": [...] }
  trust_factors           jsonb,            -- e.g. ko: ["식약처 인증", "맘카페 후기"]
  common_objections       jsonb,            -- e.g. ko: ["가격 부담", "과대광고 의심"]
  preferred_channels      jsonb,            -- e.g. ko: ["쿠팡", "네이버 스마트스토어", "오프라인 대형마트"]
  cultural_notes          text,             -- free-form, written in source language
  source                  text not null,
  primary key (country_code, category, data_year)
);

-- ──────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- Reference data is read-only for any authenticated user (across workspaces).
-- Writes go through service role from ETL scripts.
-- ──────────────────────────────────────────────────────────────────────────
alter table public.country_stats              enable row level security;
alter table public.country_profession_income  enable row level security;
alter table public.country_consumer_norms     enable row level security;

create policy "country_stats_read_authenticated"
  on public.country_stats
  for select
  to authenticated
  using (true);

create policy "country_profession_income_read_authenticated"
  on public.country_profession_income
  for select
  to authenticated
  using (true);

create policy "country_consumer_norms_read_authenticated"
  on public.country_consumer_norms
  for select
  to authenticated
  using (true);
-- service_role bypasses RLS for inserts/updates from ETL.
