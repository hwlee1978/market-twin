-- Mr.AI publish channels (C10 Phase 1, 2026-06-05).
--
-- Extends 0032_mrai_integrations to allow LinkedIn + X (Twitter) as
-- providers, plus a new mrai_publish_posts table to track every
-- actual post we send to those platforms. The 0032 table already
-- supported 'linkedin' but only HubSpot was wired; this migration
-- adds 'x' and the publish history table.
--
-- Design notes:
--   - One mrai_integrations row per (workspace, provider) — connect
--     LinkedIn = one row, connect X = another row.
--   - mrai_publish_posts is append-only history. Failed publishes
--     also persist (status='failed') so the UI can surface "retry"
--     options without losing the original payload.
--   - Platform-side post ID stored once the publish call returns
--     (LinkedIn URN, X tweet ID). Drives "View on platform" links.

-- Add 'x' to the provider whitelist. Postgres CHECK constraints
-- can't be ALTERed in place; drop + recreate.
alter table public.mrai_integrations
  drop constraint if exists mrai_integrations_provider_check;
alter table public.mrai_integrations
  add constraint mrai_integrations_provider_check
  check (provider in ('hubspot', 'linkedin', 'x'));

create table if not exists public.mrai_publish_posts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  provider        text not null check (provider in ('linkedin', 'x')),
  -- The content that was published. Truncate at 8000 chars for sanity
  -- (LinkedIn allows 3000, X Premium up to 25K; 8000 covers our needs).
  content         text not null check (char_length(content) <= 8000),
  -- Optional: source content draft if it came from Mr.AI content drafter.
  content_draft_id uuid,
  status          text not null check (status in ('pending', 'sent', 'failed')),
  -- Platform-returned identifier (LinkedIn URN urn:li:share:... or X tweet ID).
  platform_post_id text,
  platform_url    text,
  error_message   text,
  -- Who triggered the publish.
  triggered_by    uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index if not exists mrai_publish_posts_ws_provider_idx
  on public.mrai_publish_posts(workspace_id, provider, created_at desc);

alter table public.mrai_publish_posts enable row level security;

create policy "mrai_publish_rw_members" on public.mrai_publish_posts
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

comment on table public.mrai_publish_posts is
  'Every publish attempt to LinkedIn/X. Append-only history; failed posts kept for retry UX.';
comment on column public.mrai_publish_posts.platform_post_id is
  'LinkedIn URN (urn:li:share:...) or X tweet ID — used to build platform_url.';
