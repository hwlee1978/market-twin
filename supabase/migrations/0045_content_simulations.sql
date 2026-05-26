-- Phase 9 — Persona-driven content reaction simulation.
--
-- Three tables work together:
--   1. mrai_content_drafts        — the content (copy + image + CTA) the
--                                    workspace wants to test. Multiple
--                                    variants per campaign for A/B.
--   2. mrai_content_simulations   — one row per simulation run. Aggregated
--                                    metrics across the persona sample.
--   3. mrai_persona_reactions     — per-persona detail row, drilldown.
--   4. mrai_content_publications  — virtual "publish" event + cumulative
--                                    metrics over time (Phase 9.5).

-- ─── content drafts (the asset under test) ──────────────────────────
create table if not exists public.mrai_content_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  marketing_channel_id uuid
    references public.mrai_marketing_channels(id) on delete set null,
  -- Campaign grouping label (e.g. "FW26 캐시미어 런칭")
  campaign_label text,
  -- A / B / C / D variant for A/B testing same campaign
  variant_label text not null default 'A',
  -- When this draft is a variant of another, points back to the
  -- original — lets the UI render variants as a tree.
  parent_draft_id uuid references public.mrai_content_drafts(id) on delete cascade,

  -- Content
  body_text text not null,                 -- main copy
  hashtags text[] default '{}'::text[],    -- ["#KComfort", "#캐시미어"]
  cta_text text,                            -- "지금 구매" / "더 알아보기"
  image_url text,                           -- real image URL when uploaded
  image_prompt text,                        -- AI image-gen prompt (no image yet)

  -- Provenance
  source text not null default 'manual'
    check (source in ('manual', 'ai-drafted', 'pasted')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mrai_content_drafts_ws_campaign_idx
  on public.mrai_content_drafts (workspace_id, campaign_label, variant_label);

create index if not exists mrai_content_drafts_channel_idx
  on public.mrai_content_drafts (marketing_channel_id)
  where marketing_channel_id is not null;

alter table public.mrai_content_drafts enable row level security;

create policy "mrai_content_drafts_rw_members" on public.mrai_content_drafts
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ─── simulations (aggregated results) ────────────────────────────────
create table if not exists public.mrai_content_simulations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_draft_id uuid not null
    references public.mrai_content_drafts(id) on delete cascade,
  marketing_channel_id uuid
    references public.mrai_marketing_channels(id) on delete set null,

  -- Sampling config
  persona_sample_size int not null check (persona_sample_size > 0),
  sample_market text,                    -- 'KR' / 'US' / etc.
  sample_demographics jsonb not null default '{}'::jsonb,
    -- {ageRange?, gender?, income?, segments?}

  -- Aggregated metrics (% of personas, 0-100)
  like_rate numeric(5,2),
  click_rate numeric(5,2),
  share_rate numeric(5,2),
  save_rate numeric(5,2),
  comment_rate numeric(5,2),

  -- Reaction distribution {love: X%, like: Y%, neutral: Z%, dislike: W%, ignore: V%}
  reaction_distribution jsonb not null default '{}'::jsonb,

  -- Qualitative aggregates
  top_positive_quotes jsonb not null default '[]'::jsonb,
  top_objection_quotes jsonb not null default '[]'::jsonb,
  -- {segment_key: {like_rate, click_rate, n}}
  segment_breakdown jsonb not null default '{}'::jsonb,

  -- Cost / debug
  llm_cost_usd numeric(8,4),
  llm_input_tokens int,
  llm_output_tokens int,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mrai_content_simulations_ws_idx
  on public.mrai_content_simulations (workspace_id, created_at desc);

create index if not exists mrai_content_simulations_draft_idx
  on public.mrai_content_simulations (content_draft_id);

alter table public.mrai_content_simulations enable row level security;

create policy "mrai_content_simulations_rw_members" on public.mrai_content_simulations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ─── per-persona reactions (drilldown) ───────────────────────────────
create table if not exists public.mrai_persona_reactions (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null
    references public.mrai_content_simulations(id) on delete cascade,

  -- Reference to persona_pool when sampled from there (nullable when
  -- the simulator synthesized an ad-hoc persona).
  persona_id uuid,
  -- Snapshot of the persona profile at sim time (so we can render
  -- drilldown even if the source row was deleted).
  persona_summary jsonb not null,
    -- {country, ageRange, gender, profession, incomeBand, voice_excerpt}

  -- Reaction primary
  reaction text check (reaction in ('love', 'like', 'neutral', 'dislike', 'ignore')),
  -- Per-action intent 0-1
  like_intent numeric(3,2),
  click_intent numeric(3,2),
  share_intent numeric(3,2),
  save_intent numeric(3,2),
  comment_intent numeric(3,2),
  comment_text text,
  rejection_reason text,
  -- 1st-person quote the persona "left" — drives the qualitative
  -- aggregates above.
  reaction_quote text,

  created_at timestamptz not null default now()
);

create index if not exists mrai_persona_reactions_sim_idx
  on public.mrai_persona_reactions (simulation_id);

alter table public.mrai_persona_reactions enable row level security;

create policy "mrai_persona_reactions_r_members" on public.mrai_persona_reactions
  for select using (
    exists (
      select 1 from public.mrai_content_simulations s
      where s.id = mrai_persona_reactions.simulation_id
        and public.is_workspace_member(s.workspace_id)
    )
  );

create policy "mrai_persona_reactions_w_service" on public.mrai_persona_reactions
  for insert with check (false);  -- service-role only via createServiceClient

-- ─── publications (virtual upload + cumulative metrics) ──────────────
create table if not exists public.mrai_content_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_draft_id uuid not null
    references public.mrai_content_drafts(id) on delete cascade,
  marketing_channel_id uuid not null
    references public.mrai_marketing_channels(id) on delete cascade,

  -- The "publish" event timestamp
  published_at timestamptz not null default now(),

  -- Cumulative metrics over time
  -- [{ts, likes, clicks, shares, saves, comments, impressions}]
  metrics_history jsonb not null default '[]'::jsonb,

  -- Final totals (denormalized for quick aggregation)
  total_likes int not null default 0,
  total_clicks int not null default 0,
  total_shares int not null default 0,
  total_saves int not null default 0,
  total_comments int not null default 0,
  total_impressions int not null default 0,

  status text not null default 'published'
    check (status in ('published', 'archived'))
);

create index if not exists mrai_content_publications_ws_idx
  on public.mrai_content_publications (workspace_id, published_at desc);

create index if not exists mrai_content_publications_channel_idx
  on public.mrai_content_publications (marketing_channel_id, published_at desc);

alter table public.mrai_content_publications enable row level security;

create policy "mrai_content_publications_rw_members" on public.mrai_content_publications
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
