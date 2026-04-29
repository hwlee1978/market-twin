-- Curated competitor catalog per category × country.
--
-- The country-scoring prompt needs concrete brand context to make a
-- credible "competition score" — saying "Apple, Samsung, Xiaomi
-- dominate Korean smartphones" is far more useful than "competition
-- is high". Until now this lived in country_consumer_norms.cultural_notes
-- as free text, which the LLM had to extract every time. This table
-- gives the runner structured access.
--
-- Used by runner/prompts.ts: when scoring a country for a product, the
-- system prompt now includes the top 4-5 competitors for that
-- (category, country) cell so the LLM can ground its competition
-- analysis in real brands.

create table if not exists public.category_competitors (
  id              uuid primary key default uuid_generate_v4(),
  -- Wizard product category: beauty / fashion / food / health /
  -- electronics / home / saas. Same labels the wizard offers.
  category        text not null,
  country_code    text not null,
  brand_name      text not null,
  -- Strategic role in the market: leader, challenger, value, premium,
  -- niche, local-hero. Helps the LLM frame the competitive landscape.
  brand_role      text not null default 'leader',
  -- Price tier: mass / premium / luxury. Optional.
  segment         text,
  -- One-line context — why they matter, channel strength, key
  -- differentiator. Becomes part of the prompt context.
  notes           text not null default '',
  source          text not null default '',
  fetched_at      timestamptz not null default now(),
  unique (category, country_code, brand_name)
);

create index if not exists category_competitors_lookup_idx
  on public.category_competitors (category, country_code);

alter table public.category_competitors enable row level security;

create policy "comp_read_authenticated" on public.category_competitors
  for select using (auth.role() = 'authenticated');

comment on table public.category_competitors is
  'Major brands per (category, country). Injected into the country-scoring prompt so the LLM grounds its competition analysis in real names instead of generic phrases.';
