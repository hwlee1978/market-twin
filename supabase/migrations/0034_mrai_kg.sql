-- Mr. AI — Knowledge Graph (Sprint 2 of Trina-inspired upgrade).
--
-- Layers entity-relation graph ON TOP of existing flat memories (kept
-- as raw source text). Memories don't go away — they remain the source
-- of truth + the LLM-readable narrative. KG is the structured index:
-- "what entities exist in this workspace + how are they connected".
--
-- Workflow:
--   1. User chats / Mr. AI extracts memory rows (existing behavior)
--   2. NEW: same extraction pass also outputs entities + relations
--   3. Insert dedupes against existing entities by case-insensitive name
--   4. Analyst layer (L2) detects entity references in user message →
--      fetches subgraph as additional evidence
--
-- Why graph instead of just better tags: a tag is "Market Twin: SaaS"
-- (label only); a graph edge is "Market Twin --serves--> K-product
-- 수출 기업" (a triple the LLM can traverse to answer "who do we sell
-- to"). That's the Trina/Palantir-style KG value over flat metadata.

create table if not exists public.mrai_entities (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  -- Canonical display name. Lookup case-insensitively (citext would be
  -- nicer but pulling that extension in is overkill for this size).
  name            text not null,
  -- Coarse category for filtering + UI grouping.
  kind            text not null check (kind in (
    'person', 'company', 'product', 'customer_segment',
    'technology', 'market', 'decision', 'metric',
    'competitor', 'other'
  )),
  summary         text,
  -- Mentions counter so we know which entities are central
  mention_count   integer not null default 1,
  -- Future: embedding for semantic entity matching beyond exact name.
  -- Skipped for v0 to keep migration simple.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Case-insensitive unique per workspace so dedup is deterministic.
create unique index if not exists mrai_entities_ws_name_uniq
  on public.mrai_entities(workspace_id, lower(name));
create index if not exists mrai_entities_ws_kind_idx
  on public.mrai_entities(workspace_id, kind);

create table if not exists public.mrai_relations (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  src_entity_id     uuid not null references public.mrai_entities(id) on delete cascade,
  dst_entity_id     uuid not null references public.mrai_entities(id) on delete cascade,
  relation_type     text not null check (relation_type in (
    'targets', 'uses', 'competes_with', 'located_in',
    'depends_on', 'works_at', 'mentioned_with', 'other'
  )),
  -- Free-text qualifier when the relation type alone isn't expressive enough.
  -- e.g. relation_type='targets', detail='primary ICP' / 'expansion market'.
  detail            text,
  -- Weight grows with repeated extractions; lets us decay or rank.
  weight            integer not null default 1,
  source_memory_id  uuid references public.mrai_memories(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Dedupe relations by (workspace, src, dst, type) — repeated extractions
-- bump weight instead of inserting duplicates.
create unique index if not exists mrai_relations_triple_uniq
  on public.mrai_relations(workspace_id, src_entity_id, dst_entity_id, relation_type);
create index if not exists mrai_relations_ws_src_idx
  on public.mrai_relations(workspace_id, src_entity_id);
create index if not exists mrai_relations_ws_dst_idx
  on public.mrai_relations(workspace_id, dst_entity_id);

alter table public.mrai_entities  enable row level security;
alter table public.mrai_relations enable row level security;

create policy "mrai_entity_rw_members" on public.mrai_entities
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "mrai_relation_rw_members" on public.mrai_relations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
