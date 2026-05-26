-- Engagement-engine emits "new_views" per tick which we accumulate as
-- total_views on the publication row. The original 0045 migration only
-- created total_impressions (Instagram's "times shown" metric). Real
-- social platforms treat views ≠ impressions:
--   • views        = unique users who paused on the post
--   • impressions  = total times the post was shown (including repeat views)
-- For the simulator they're similar but distinct.

alter table public.mrai_content_publications
  add column if not exists total_views integer not null default 0;

comment on column public.mrai_content_publications.total_views is
  'Cumulative unique viewers. Distinct from total_impressions which counts repeated views.';
