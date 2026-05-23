-- Mr. AI — Feedback layer (Sprint 3 of Trina-inspired upgrade).
--
-- Captures user signals on briefings and chat turns. The aggregator
-- summarizes recent feedback into the next briefing prompt, closing
-- the KPI loop that Trina uses for marketing content auto-tuning.
--
-- One feedback per (user, target) — UNIQUE constraint enables toggle
-- semantics: click 👍 then 👎 just overwrites the row.

create table if not exists public.mrai_feedback (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- What's being rated
  target_type   text not null check (target_type in ('briefing', 'chat_message')),
  target_id     uuid not null,
  -- 👍 useful / 👎 not_useful / ✅ acted / ✕ dismiss
  kind          text not null check (kind in ('useful', 'not_useful', 'acted', 'dismiss')),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One feedback per (user × target). Toggling between kinds replaces.
create unique index if not exists mrai_feedback_user_target_uniq
  on public.mrai_feedback(workspace_id, user_id, target_type, target_id);

create index if not exists mrai_feedback_ws_recent_idx
  on public.mrai_feedback(workspace_id, created_at desc);

alter table public.mrai_feedback enable row level security;

create policy "mrai_feedback_rw_members" on public.mrai_feedback
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
