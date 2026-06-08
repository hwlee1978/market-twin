-- Mr.AI external publish — soft-delete support (2026-06-08).
--
-- Adds a 'deleted' status to mrai_publish_posts so that when a user
-- removes a tweet/LinkedIn post we delete it on the platform AND keep
-- the audit row (status='deleted', deleted_at set) instead of dropping
-- the history. Append-only history is preserved; deletes are tracked.

alter table public.mrai_publish_posts
  drop constraint if exists mrai_publish_posts_status_check;
alter table public.mrai_publish_posts
  add constraint mrai_publish_posts_status_check
  check (status in ('pending', 'sent', 'failed', 'deleted'));

alter table public.mrai_publish_posts
  add column if not exists deleted_at timestamptz;

comment on column public.mrai_publish_posts.deleted_at is
  'When the post was removed from the platform (status=deleted). Null otherwise.';
