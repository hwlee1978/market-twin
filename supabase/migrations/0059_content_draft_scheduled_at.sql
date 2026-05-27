-- Phase 1b — content calendar / scheduling.
--
-- Adds a `scheduled_at` timestamp to mrai_content_drafts so a draft
-- can be queued to a future moment in the channel's marketing calendar.
-- A NULL value means "unscheduled" (current default behaviour preserved).
--
-- The companion cron (deferred to Phase 1b.2) will pick up drafts whose
-- scheduled_at <= now() AND status != 'published' and run the publish
-- step automatically. Until then this column is purely planning state
-- visible in the calendar UI.

ALTER TABLE public.mrai_content_drafts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.mrai_content_drafts.scheduled_at IS
  'When this draft is queued to publish (NULL = not scheduled). '
  'Phase 1b.1 — UI only. Phase 1b.2 will add auto-publish cron.';

-- Index for calendar queries (per-workspace, per-channel scheduled lookups).
CREATE INDEX IF NOT EXISTS idx_mrai_drafts_scheduled
  ON public.mrai_content_drafts (workspace_id, marketing_channel_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;
