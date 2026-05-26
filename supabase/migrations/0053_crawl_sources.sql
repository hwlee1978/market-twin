-- Crawl sources — registered URLs that Mr.AI fetches periodically to
-- keep workspace memory fresh against the real world.
--
-- Three source_type kinds in this migration (social listening is deferred):
--   • self_website     — workspace's own brand site / blog / product pages
--   • news_rss         — RSS feed (Google News / Naver News) monitored for brand mentions
--   • competitor       — competitor product/pricing page
--
-- Cron 02:30 KST walks every enabled source, fetches, diffs against the
-- last snapshot, and (when changed) emits a new mrai_memories row with
-- source_type='crawl'.

create table if not exists public.mrai_crawl_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  source_type text not null check (source_type in (
    'self_website',
    'news_rss',
    'competitor'
  )),

  url text not null,
  label text,                          -- "르무통 공식" / "Allbirds 신상" / "Google News: 르무통"
  brand_filter text,                    -- for RSS — only keep items containing this string (case-insensitive)

  enabled boolean not null default true,
  fetch_interval_hours integer not null default 24
    check (fetch_interval_hours between 1 and 720),

  -- Snapshot of last successful fetch — used for diffing
  last_fetched_at timestamptz,
  last_snapshot_hash text,             -- sha1 of normalized content
  last_snapshot jsonb,                  -- { text, title, ts, [items for RSS] }
  last_error text,                      -- last error message if fetch failed
  fail_count integer not null default 0,

  -- Stats — how many memories has this source produced over time
  memories_emitted integer not null default 0,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, url)
);

create index if not exists mrai_crawl_sources_ws_enabled_idx
  on public.mrai_crawl_sources (workspace_id, enabled);

create index if not exists mrai_crawl_sources_sweep_idx
  on public.mrai_crawl_sources (enabled, last_fetched_at)
  where enabled = true;

alter table public.mrai_crawl_sources enable row level security;

create policy "mrai_crawl_sources_rw_members" on public.mrai_crawl_sources
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create or replace function public.mrai_crawl_sources_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_mrai_crawl_sources_updated_at on public.mrai_crawl_sources;
create trigger trg_mrai_crawl_sources_updated_at
  before update on public.mrai_crawl_sources
  for each row execute function public.mrai_crawl_sources_touch_updated_at();

-- Allow mrai_memories to track provenance — was this memory derived
-- from a crawl source? Used by audit + the briefing to weight fresh
-- crawled facts higher.
alter table public.mrai_memories
  add column if not exists crawl_source_id uuid
    references public.mrai_crawl_sources(id) on delete set null;

create index if not exists mrai_memories_crawl_source_idx
  on public.mrai_memories (crawl_source_id)
  where crawl_source_id is not null;

comment on table public.mrai_crawl_sources is
  'Crawl targets the workspace registered for Mr.AI auto-refresh. Daily cron walks each source, diffs, and emits new memories tagged with crawl_source_id.';
