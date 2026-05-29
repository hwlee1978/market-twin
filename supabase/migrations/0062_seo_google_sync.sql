-- Google SEO sync — GSC (Search Console) + GA4 (Analytics) live data.
--
-- Until now BrandSEOPanel only stored manual self-attestation (the user
-- typed in GSC property URL + GA4 IDs). Sync layer was deferred. This
-- migration unlocks the real-data flow: OAuth tokens per workspace +
-- daily metrics tables that the sync cron + UI dashboard read.
--
-- Tables added:
--   mrai_google_oauth   : refresh token + scopes per workspace (1:1)
--   mrai_gsc_daily      : daily GSC rollup (per property + query + page)
--   mrai_ga4_daily      : daily GA4 rollup (per property + source/medium)
--
-- OAuth: one workspace ↔ one Google account (the brand owner's). Multi-
-- account flow can be added later via a join table without breaking this.

-- ─── OAuth credential store ─────────────────────────────────────────
create table if not exists public.mrai_google_oauth (
  workspace_id   uuid primary key references public.workspaces(id) on delete cascade,
  google_email   text not null,
  refresh_token  text not null,   -- encrypted at rest? out of scope for v0.1 — RLS gates it.
  access_token   text,            -- short-lived; refreshed on demand
  expires_at     timestamptz,
  scopes         text[] not null default '{}'::text[],
  connected_at   timestamptz not null default now(),
  last_used_at   timestamptz,
  -- Sync run bookkeeping
  last_gsc_sync  timestamptz,
  last_ga4_sync  timestamptz,
  last_error     text,
  last_error_at  timestamptz
);

alter table public.mrai_google_oauth enable row level security;

create policy "mrai_google_oauth_rw_members"
  on public.mrai_google_oauth
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ─── GSC daily metrics ──────────────────────────────────────────────
-- One row per (seo_property_id, date, dimension combo). Dimensions:
-- query × page give the deepest signal for SEO ops. Aggregate rollups
-- (just property × date) are computed at read time.
create table if not exists public.mrai_gsc_daily (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  seo_property_id    uuid not null references public.mrai_seo_properties(id) on delete cascade,
  date               date not null,
  query              text not null default '',  -- empty = unknown / anonymous
  page               text not null default '',
  country            text,                       -- ISO-2; null when not split
  device             text,                       -- desktop/mobile/tablet
  clicks             integer not null default 0,
  impressions        integer not null default 0,
  ctr                double precision not null default 0,    -- 0..1
  avg_position       double precision not null default 0,    -- 1.0 = top
  inserted_at        timestamptz not null default now(),
  unique (seo_property_id, date, query, page, country, device)
);

create index if not exists mrai_gsc_daily_ws_date_idx
  on public.mrai_gsc_daily (workspace_id, date desc);
create index if not exists mrai_gsc_daily_prop_date_idx
  on public.mrai_gsc_daily (seo_property_id, date desc);

alter table public.mrai_gsc_daily enable row level security;

create policy "mrai_gsc_daily_rw_members"
  on public.mrai_gsc_daily
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ─── GA4 daily metrics ──────────────────────────────────────────────
-- One row per (seo_property_id, date, source/medium). For v0.1 we keep
-- a single dimension cardinality (source/medium); per-page or per-event
-- splits can be added in later migrations without breaking reads.
create table if not exists public.mrai_ga4_daily (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  seo_property_id     uuid not null references public.mrai_seo_properties(id) on delete cascade,
  date                date not null,
  source              text not null default '',   -- google / naver / direct / ...
  medium              text not null default '',   -- organic / cpc / referral / ...
  sessions            integer not null default 0,
  users               integer not null default 0,
  engaged_sessions    integer not null default 0,
  conversions         integer not null default 0,
  bounce_rate         double precision not null default 0,    -- 0..1
  avg_session_seconds double precision not null default 0,
  inserted_at         timestamptz not null default now(),
  unique (seo_property_id, date, source, medium)
);

create index if not exists mrai_ga4_daily_ws_date_idx
  on public.mrai_ga4_daily (workspace_id, date desc);
create index if not exists mrai_ga4_daily_prop_date_idx
  on public.mrai_ga4_daily (seo_property_id, date desc);

alter table public.mrai_ga4_daily enable row level security;

create policy "mrai_ga4_daily_rw_members"
  on public.mrai_ga4_daily
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

comment on table public.mrai_google_oauth is
  'Per-workspace Google OAuth refresh token. Powers GSC + GA4 daily sync.';
comment on table public.mrai_gsc_daily is
  'Google Search Console rollup — clicks/impressions/CTR/avg position per (property, date, query, page).';
comment on table public.mrai_ga4_daily is
  'Google Analytics 4 rollup — sessions/users/conversions per (property, date, source, medium).';
