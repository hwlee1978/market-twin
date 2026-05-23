-- Mr. AI — Channel Auto-Publish (Sprint 4 of Trina-inspired upgrade).
--
-- mrai_channels: per-workspace destinations a briefing/insight can be
--   pushed to. Three adapter types for v0: slack_webhook, email,
--   generic_webhook. Config is jsonb so adapters can hold their own
--   shape (webhook URL, recipient list, secret header, etc).
--
-- mrai_dispatches: per-send log. Lets us show "last sent at" + status
--   in the UI, retry failed sends, and audit what went where.
--
-- The trigger to send is in app code (briefing.ts after generate, plus
-- a manual /send route). We don't put dispatch in a DB trigger because
-- adapter calls reach out to third-party HTTP endpoints — better kept
-- at the application layer where retries + observability live.

create table if not exists public.mrai_channels (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  channel_type    text not null check (channel_type in ('slack_webhook', 'email', 'generic_webhook')),
  name            text not null,
  -- Adapter-specific config (e.g. {"webhookUrl":"https://hooks.slack.com/..."},
  -- {"emailTo":"ceo@example.com"}, {"url":"...","headers":{...}}). Stored
  -- plaintext for v0 internal dogfood; production = Supabase Vault.
  config          jsonb not null default '{}'::jsonb,
  enabled         boolean not null default true,
  -- Which automatic events should push to this channel
  send_briefing   boolean not null default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists mrai_channels_ws_idx
  on public.mrai_channels(workspace_id, channel_type);

create table if not exists public.mrai_dispatches (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  channel_id      uuid references public.mrai_channels(id) on delete cascade,
  source_type     text not null check (source_type in ('briefing', 'chat_message', 'manual', 'test')),
  source_id       uuid,
  status          text not null check (status in ('pending', 'sent', 'failed')),
  error           text,
  dispatched_at   timestamptz not null default now()
);

create index if not exists mrai_dispatches_ws_idx
  on public.mrai_dispatches(workspace_id, dispatched_at desc);
create index if not exists mrai_dispatches_channel_idx
  on public.mrai_dispatches(channel_id, dispatched_at desc);

alter table public.mrai_channels    enable row level security;
alter table public.mrai_dispatches  enable row level security;

create policy "mrai_channels_rw_members" on public.mrai_channels
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "mrai_dispatches_rw_members" on public.mrai_dispatches
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
