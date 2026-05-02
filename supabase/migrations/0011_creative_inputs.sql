-- Add creative-input columns to projects so the simulator can score
-- user-supplied creative concepts and (optionally) actual visual assets.
--
-- Why: the wizard and runner already produce a `creative` array on results,
-- but until now there was no input pipeline — the synthesis stage saw an
-- empty list and emitted an empty array. The new columns let users describe
-- creative concepts (asset_descriptions) and optionally provide hosted
-- image URLs (asset_urls) which feed Anthropic vision for actual visual
-- analysis.
--
-- Default empty arrays cover existing rows — legacy projects continue to
-- get an empty creative array (unchanged behavior).

alter table public.projects
  add column if not exists asset_descriptions text[] not null default '{}',
  add column if not exists asset_urls text[] not null default '{}';

comment on column public.projects.asset_descriptions is
  'User-described creative concepts, one per entry (e.g. "Hero video — kitchen morning routine"). Always passed to synthesis as text.';
comment on column public.projects.asset_urls is
  'Optional hosted image URLs evaluated via Anthropic vision when present. URL must be publicly fetchable (no auth, no CORS gating).';
