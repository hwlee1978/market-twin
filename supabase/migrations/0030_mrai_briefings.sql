-- Mr. AI — Daily Briefing module (W3 sprint).
-- One row per generated briefing. Generated on demand (button) for now,
-- cron-driven W4. Stored as markdown so we can render with any client
-- without a structured schema lock-in, but with metadata for filtering.
--
-- We don't aggregate across briefings — each is a snapshot, the user
-- reads the latest one and history shows scrolling-back capability.

create table if not exists public.mrai_briefings (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  generated_by             uuid references auth.users(id) on delete set null,
  -- Markdown body the UI renders. Stored as-generated in the source language
  -- (Korean or English) so re-reads are stable even when the user switches
  -- their UI locale after the fact.
  content_md               text not null,
  locale                   text not null check (locale in ('ko', 'en')),
  -- Provenance: which memories + conversations seeded this briefing.
  -- jsonb (not arrays) so we can attach additional shape later (excerpt,
  -- timestamp) without schema migration.
  source_memory_ids        jsonb not null default '[]'::jsonb,
  source_conversation_ids  jsonb not null default '[]'::jsonb,
  -- Cost / debug
  input_tokens             integer,
  output_tokens            integer,
  generated_at             timestamptz not null default now()
);

create index if not exists mrai_briefings_ws_idx
  on public.mrai_briefings(workspace_id, generated_at desc);

alter table public.mrai_briefings enable row level security;

create policy "mrai_brief_rw_members" on public.mrai_briefings
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
