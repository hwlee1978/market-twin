-- Curated category × country regulatory rules.
--
-- Until now the regulatory pre-check was 100% LLM-driven, which
-- occasionally missed real bans (the Singapore e-cigarette example
-- the user raised early on). This table holds the authoritative
-- bans / restrictions; the LLM still classifies which subcategory
-- the product belongs to, but the DB is the source of truth for
-- what's banned where.
--
-- regulated_category is intentionally narrower than the wizard's
-- product category — 'electronics' (wizard) covers both phones
-- (unregulated) and vapes (heavily regulated), so we use specific
-- sub-labels: vaping, alcohol, cannabis_cbd, tobacco, gambling,
-- crypto_finance, firearms, dietary_supplement, adult_content,
-- pharmaceutical.

create type regulation_status as enum ('banned', 'restricted', 'allowed');

create table if not exists public.category_regulations (
  id              uuid primary key default uuid_generate_v4(),
  regulated_category text not null,
  country_code    text not null,
  status          regulation_status not null,
  reason          text not null,
  source          text not null,
  source_url      text,
  effective_year  integer,
  fetched_at      timestamptz not null default now(),
  unique (regulated_category, country_code)
);

create index if not exists category_regulations_category_idx
  on public.category_regulations (regulated_category);
create index if not exists category_regulations_country_idx
  on public.category_regulations (country_code);

alter table public.category_regulations enable row level security;

-- Read-only for any authenticated user; writes happen via service-role
-- in the seed scripts and the (future) annual refresh job.
create policy "regs_read_authenticated" on public.category_regulations
  for select using (auth.role() = 'authenticated');

comment on table public.category_regulations is
  'Authoritative banned/restricted lookup keyed by (regulated_category, country_code). The simulation runner consults this before generating personas — DB rows override LLM classification.';
comment on column public.category_regulations.regulated_category is
  'Narrow sub-label like vaping / alcohol / cannabis_cbd / gambling. Distinct from the wizard product category to avoid false positives (e.g. all electronics flagged because vapes are electronics).';
