-- Per-workspace user settings.
--
-- v0.1: every workspace has exactly one member (the owner), so workspace-level
-- preferences double as user preferences without a separate user_settings table.
-- When v0.2 introduces multi-member workspaces, individual preferences will
-- migrate to a workspace_members.settings JSONB column without breaking this
-- column's semantics.

alter table public.workspaces
  add column if not exists email_notifications boolean not null default true;

comment on column public.workspaces.email_notifications is
  'Whether to send simulation completion / failure emails to workspace members. Defaults true; can be flipped from /settings.';
