-- Persona reuse pool — workspace-private library of base personas plus
-- per-simulation product reactions. The runner samples the pool first;
-- only generates fresh personas to fill cells the pool can't satisfy.
--
-- Why split base profile from reactions?
--   • Base profile (country / age / profession / income / lifestyle) is
--     product-agnostic — a 30-year-old Tokyo nail artist is the same
--     person regardless of which product she's evaluating.
--   • Reactions (objections / trustFactors / purchaseIntent) ARE product-
--     specific and must be generated per simulation.
--   • Storing them separately means: 1 persona row + N reaction rows over
--     the persona's lifetime, drastically reducing the LLM tokens needed
--     for repeat sims and accumulating a real data asset over time.
--
-- Workspace scoping for now (Phase 1). A future Phase 2 migration may
-- relax workspace_id to nullable for an opt-in platform-wide pool.

-- ─── personas ──────────────────────────────────────────────────
create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- Base profile (product-agnostic, reusable)
  age_range text not null,
  gender text not null,
  country text not null,
  income_band text not null,
  profession text not null,
  /**
   * Slot-matching key: when the runner samples for a (country, profession-pool-archetype)
   * slot, it filters by base_profession. Carries the archetype the persona was
   * originally assigned to (without parentheticals), so a persona created for
   * the "메이크업 아티스트 (프리랜서)" slot is matchable by future sims that
   * also need a 메이크업 아티스트.
   */
  base_profession text not null,
  interests text[] not null default '{}',
  purchase_style text not null,
  price_sensitivity text not null,

  -- Provenance — useful for debugging quality issues to a specific sim
  source_simulation_id uuid references public.simulations(id) on delete set null,
  locale text not null default 'en',

  -- Lifecycle — used for sampling priority + eviction policy
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  use_count int not null default 1
);

-- Pool lookup hot path: workspace + country + base_profession (slot match),
-- ordered by use_count then last_used_at to favour underused personas.
create index if not exists personas_pool_lookup_idx
  on public.personas (workspace_id, country, base_profession, use_count, last_used_at);

comment on table public.personas is
  'Base persona pool for reuse across simulations. Each row is a product-agnostic profile; reactions live in simulation_persona_reactions.';

-- ─── simulation_persona_reactions ───────────────────────────────
create table if not exists public.simulation_persona_reactions (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,

  trust_factors text[] not null default '{}',
  objections text[] not null default '{}',
  purchase_intent int not null check (purchase_intent between 0 and 100),

  created_at timestamptz not null default now(),
  unique(simulation_id, persona_id)
);

create index if not exists spr_simulation_idx
  on public.simulation_persona_reactions (simulation_id);
create index if not exists spr_persona_idx
  on public.simulation_persona_reactions (persona_id);

comment on table public.simulation_persona_reactions is
  'Per-simulation product reactions for personas in the pool. One row per persona-simulation pair.';
