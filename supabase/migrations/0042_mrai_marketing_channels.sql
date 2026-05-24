-- Mr. AI marketing channel recommendations + content presets (Phase 1+2)
--
-- Two tables backing the "after the simulation says US, tell me where
-- to actually market it" workflow:
--
--   mrai_channel_recommendations  · LLM-curated list of platforms +
--     specific subreddit/handle/blog targets per target country, per
--     ensemble. User selects which ones to activate; selected channels
--     feed the future content-draft pipeline.
--
--   mrai_content_presets  · per-workspace voice/tone/length/hashtag
--     profile so generated drafts stay consistent and on-brand.
--     Multiple presets per workspace (one per channel-type or persona)
--     with one marked default.
--
-- RLS reuses public.is_workspace_member().

create table if not exists public.mrai_channel_recommendations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  -- Optional source ensemble — recommendations carry the context of
  -- which simulation produced them so we can show "from your X→US sim".
  -- Nullable so future ad-hoc recommendations (chat without a sim
  -- attachment) don't break.
  ensemble_id   uuid references public.ensembles(id) on delete set null,
  country_code  text not null,        -- 'US', 'JP', 'KR', etc.
  -- Catalog-style channel type — e.g. 'reddit', 'instagram', 'tiktok',
  -- 'twitter', 'youtube', 'linkedin', 'naver_blog', 'note', 'wirecutter',
  -- 'press_release'. Free-form so new platforms ship without migrations.
  channel_type  text not null,
  -- Specific handle/sub/topic — e.g. 'r/Sneakers', '@hokaoneone',
  -- 'Wirecutter Tech', 'Note: 育児ブログ'. What the user actually
  -- targets, not just the platform name.
  channel_name  text not null,
  -- Why this channel was recommended (1-3 sentence rationale grounded
  -- in the target persona / product / market).
  rationale     text,
  -- 0-100; higher = more important. Drives card sort order.
  priority      integer not null default 50,
  -- Channel-specific metadata: { url, follower_count, posting_frequency,
  -- content_format_hint, audience_age_range, … }. Open jsonb.
  metadata      jsonb,
  -- User flips this to true to activate the channel for future content
  -- drafts (Phase 3). Defaults false so recommendation list stays a
  -- review-first surface.
  selected      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists mrai_channel_rec_ws_idx
  on public.mrai_channel_recommendations(workspace_id, created_at desc);
create index if not exists mrai_channel_rec_ensemble_idx
  on public.mrai_channel_recommendations(ensemble_id);
create index if not exists mrai_channel_rec_selected_idx
  on public.mrai_channel_recommendations(workspace_id, selected)
  where selected = true;

alter table public.mrai_channel_recommendations enable row level security;
create policy "channel_rec_rw_members" on public.mrai_channel_recommendations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ──────────────────────────────────────────────────────────────────────
-- Content presets
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.mrai_content_presets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,                       -- "임원 톤", "친근한 영어"
  is_default    boolean not null default false,
  tone          text,    -- 'professional' | 'conversational' | 'data_driven' | 'witty' | 'inspirational'
  voice         text,    -- "대표 인터뷰", "제품 리뷰" 등 자유 텍스트
  -- Channel-aware length hint. We accept named buckets so the draft
  -- generator can map to platform limits.
  target_length text,    -- 'twitter_280' | 'instagram_2200' | 'reddit_long' | 'blog_800' | 'short' | 'medium' | 'long'
  language      text not null default 'ko',          -- 'ko' | 'en' | 'ja' | 'zh'
  hashtag_strategy text, -- 'minimal' | 'topical' | 'aggressive'
  do_not_use    text,    -- 금지어/표현 free text
  reference_examples jsonb, -- few-shot examples: [{ snippet, why_good }]
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists mrai_content_presets_ws_idx
  on public.mrai_content_presets(workspace_id, updated_at desc);

-- Exactly one default preset per workspace. Partial unique index lets
-- workspaces have many presets but at most one flagged default.
create unique index if not exists mrai_content_presets_default_uniq
  on public.mrai_content_presets(workspace_id)
  where is_default = true;

alter table public.mrai_content_presets enable row level security;
create policy "content_presets_rw_members" on public.mrai_content_presets
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
