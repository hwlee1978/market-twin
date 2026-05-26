-- Engagement growth tracking for virtual publications.
--
-- mrai_marketing_channels gains follower fields so the IG preview's
-- follower count is real-state, not just persona-pool size × 5.
-- mrai_content_publications already has metrics_history jsonb from
-- migration 0045 — we just standardize the per-tick entry shape here.

alter table public.mrai_marketing_channels
  add column if not exists follower_count integer not null default 0,
  add column if not exists follower_history jsonb not null default '[]'::jsonb;

-- Index for "find publications needing today's growth tick".
create index if not exists mrai_content_publications_status_published_idx
  on public.mrai_content_publications (status, published_at)
  where status = 'published';

comment on column public.mrai_marketing_channels.follower_count is
  'Cumulative follower count. Grows when publications drive new follows.';

comment on column public.mrai_marketing_channels.follower_history is
  'Daily snapshots: [{ ts: iso, count: int, delta: int }]. One entry per engagement tick.';

comment on column public.mrai_content_publications.metrics_history is
  'Per-tick metrics: [{ ts, day_n, new_views, new_likes, new_comments, new_shares, new_saves, new_follows, total_views, ... }]. Append-only.';
