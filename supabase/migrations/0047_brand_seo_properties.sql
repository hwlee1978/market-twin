-- Brand-level SEO properties — workspace's own websites + search-
-- console integrations. Separate from mrai_content_drafts.seo_meta
-- (per-content SEO) because:
--   • content_drafts.seo_* = per-post (Instagram caption hashtags,
--                            X tweet keyword density)
--   • mrai_seo_properties = brand site verification + GSC/GA/Naver
--                            connection state + sitemap/RSS URLs
--
-- v0 stores the linkage metadata only — actual GSC / GA / Naver
-- OAuth flows + API calls come in a later sprint. The schema is
-- here now so the UI for "내 사이트 등록 + verification 상태" can
-- ship immediately and the integrations layer fills in over time.

create table if not exists public.mrai_seo_properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- e.g. https://lemouton.com or https://smartstore.naver.com/lemouton
  property_url text not null,
  -- website / smartstore / blog / etc — disambiguates the SEO checks
  property_type text not null default 'website'
    check (property_type in ('website', 'smartstore', 'blog', 'landing', 'other')),
  -- Friendly label for the UI ("르무통 본사", "스마트스토어")
  label text,

  -- Google Search Console
  gsc_verified boolean not null default false,
  -- Property URL as registered in GSC (may differ from property_url —
  -- some workspaces register sc-domain:lemouton.com vs https://...)
  gsc_property text,
  -- Refresh token / connection ID for the workspace's GSC OAuth
  -- (filled when the GSC integration sprint lands). Storing only
  -- the linkage hint here; secrets persisted via service-role row
  -- in a separate credentials table later.
  gsc_connection_id text,
  gsc_last_synced_at timestamptz,

  -- Google Analytics 4 (GA4)
  ga4_property_id text,         -- e.g. "properties/123456789"
  ga4_measurement_id text,      -- e.g. "G-XXXXXXX"
  ga4_connection_id text,
  ga4_last_synced_at timestamptz,

  -- 네이버 서치어드바이저 (Naver Search Advisor)
  naver_verified boolean not null default false,
  naver_site_url text,          -- 등록한 사이트 URL
  naver_connection_id text,
  naver_last_synced_at timestamptz,

  -- Sitemap + RSS — submitted to search engines for crawl signal
  sitemap_url text,             -- https://lemouton.com/sitemap.xml
  rss_url text,                 -- https://lemouton.com/feed.xml

  -- Meta defaults — fallback SEO when a draft doesn't override
  default_meta_title text,
  default_meta_description text,
  default_og_image_url text,
  default_keywords text[] default '{}'::text[],

  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mrai_seo_properties_ws_idx
  on public.mrai_seo_properties (workspace_id, property_type);

-- One sitemap-style row per workspace can be the "primary" so the
-- briefing knows which property to default-report on. Optional —
-- empty workspace shows the create CTA.
create unique index if not exists mrai_seo_properties_one_primary_idx
  on public.mrai_seo_properties (workspace_id)
  where property_type = 'website';

alter table public.mrai_seo_properties enable row level security;

create policy "mrai_seo_properties_rw_members" on public.mrai_seo_properties
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create or replace function public.touch_mrai_seo_properties()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_mrai_seo_properties on public.mrai_seo_properties;
create trigger trg_touch_mrai_seo_properties
  before update on public.mrai_seo_properties
  for each row execute function public.touch_mrai_seo_properties();
