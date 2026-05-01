-- Add the originating_country (home market) field to projects.
--
-- Why: the K-product positioning needs the simulator to know which country
-- is the company's home market, so candidate countries can be treated as
-- export targets rather than equal-weight launch options. Synthesis uses
-- this to keep action plans overseas-focused.
--
-- Default 'KR' covers every existing row — the product is positioned as a
-- Korean export-validation tool, so KR is the safe assumption for any
-- legacy project. The wizard exposes this as a dropdown defaulting to KR
-- but lets users change it (the long-term play is "JP→Global" /
-- "TW→Global" expansions where each market gets its own origin default).

alter table public.projects
  add column if not exists originating_country text not null default 'KR';

comment on column public.projects.originating_country is
  'ISO-3166-1 alpha-2 of the company''s home market. The simulator treats candidate_countries as export targets relative to this origin — synthesis prompts and best-country recommendations exclude / contextualize this market.';
