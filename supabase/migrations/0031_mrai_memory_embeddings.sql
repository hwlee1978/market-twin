-- Mr. AI — pgvector semantic retrieval for memories (W3.5 sprint).
--
-- Adds an embedding column + IVFFlat index + match_mrai_memories rpc.
-- Once a workspace has many memories (50+), injecting all of them into
-- every system prompt wastes tokens AND dilutes relevance. With this
-- migration, the chat orchestrator embeds the user's question and
-- retrieves the top-K most semantically similar memories instead.
--
-- The Daily Briefing still loads all memories (briefing is workspace-wide
-- context, not query-driven).
--
-- Provider: OpenAI text-embedding-3-small (1536-dim, ~$0.02/1M tokens).
-- Cosine similarity (1 - <=>) is the typical pick for OpenAI embeddings.
--
-- If `create extension vector` fails (older Supabase project that hasn't
-- enabled pgvector), enable via Supabase Dashboard → Database → Extensions
-- → vector, then re-run this migration.

create extension if not exists vector;

alter table public.mrai_memories
  add column if not exists embedding vector(1536);

-- IVFFlat index for fast approximate cosine search. lists=100 is a
-- reasonable default for up to ~10K rows; revisit when individual
-- workspaces approach that scale.
create index if not exists mrai_memories_embedding_idx
  on public.mrai_memories
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Workspace-scoped semantic match. SQL function so we can call from
-- supabase-js via .rpc() without leaking the raw <=> operator into TS.
create or replace function public.match_mrai_memories(
  query_embedding vector(1536),
  ws_id uuid,
  match_count integer default 20
)
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  source_message_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    m.id,
    m.kind,
    m.title,
    m.body,
    m.source_message_id,
    m.created_at,
    m.updated_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.mrai_memories m
  where m.workspace_id = ws_id
    and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
