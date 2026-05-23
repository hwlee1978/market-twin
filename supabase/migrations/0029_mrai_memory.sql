-- Mr. AI — Persistent Memory layer (W1-2 Foundation).
-- 3 tables backing the "기억하는 AI CEO OS" core differentiator:
--   mrai_conversations · per-user threads
--   mrai_messages      · user/assistant turns inside a thread
--   mrai_memories      · workspace-scoped facts injected into EVERY thread
--
-- Memories are the layer that makes Mr. AI feel like a persistent assistant
-- rather than a stateless chatbot. They are extracted by a separate LLM
-- pass after each assistant reply (see src/lib/mrai/memory.ts) and then
-- prefixed to the system prompt on the next turn. v0 injects ALL memories;
-- when count > ~50 we switch to pgvector semantic retrieval (W3 work).
--
-- RLS reuses the existing public.is_workspace_member() helper so policies
-- stay consistent with projects / simulations / etc.

create table if not exists public.mrai_conversations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists mrai_conversations_ws_idx
  on public.mrai_conversations(workspace_id, updated_at desc);
create index if not exists mrai_conversations_user_idx
  on public.mrai_conversations(user_id, updated_at desc);

create table if not exists public.mrai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.mrai_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  -- usage tracking so cost dashboards can attribute spend per conversation
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz not null default now()
);

create index if not exists mrai_messages_conv_idx
  on public.mrai_messages(conversation_id, created_at);

-- Memories: workspace-scoped because the org's facts should survive
-- user turnover. A memory written by user A should still inform user B's
-- conversation if they're in the same workspace.
create table if not exists public.mrai_memories (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  kind              text not null check (kind in ('fact', 'preference', 'context', 'decision')),
  title             text not null,
  body              text not null,
  source_message_id uuid references public.mrai_messages(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  -- Future: pgvector embedding for semantic retrieval. Nullable for now
  -- so W1-2 can ship without setting up the embeddings pipeline.
  -- embedding   vector(1536),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists mrai_memories_ws_idx
  on public.mrai_memories(workspace_id, updated_at desc);
create index if not exists mrai_memories_ws_kind_idx
  on public.mrai_memories(workspace_id, kind);

alter table public.mrai_conversations enable row level security;
alter table public.mrai_messages      enable row level security;
alter table public.mrai_memories      enable row level security;

create policy "mrai_conv_rw_members" on public.mrai_conversations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "mrai_msg_rw_via_conv" on public.mrai_messages
  for all using (
    exists (
      select 1 from public.mrai_conversations c
      where c.id = conversation_id and public.is_workspace_member(c.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.mrai_conversations c
      where c.id = conversation_id and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "mrai_mem_rw_members" on public.mrai_memories
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
