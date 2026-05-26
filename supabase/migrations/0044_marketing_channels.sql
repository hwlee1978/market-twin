-- Marketing channels — virtual brand accounts on X/Instagram/TikTok/Naver/etc.
-- where the workspace plans to publish content. Separate from
-- mrai_channels (notification webhooks for Briefings) because:
--   • mrai_channels = inbound (Briefings/chat → Slack/Email push to user)
--   • mrai_marketing_channels = outbound (workspace → audience on a platform)
-- Different semantics → different table keeps schema clean.
--
-- v0 is simulation-only: no real OAuth/posting to X or Instagram. We
-- store the platform + handle + targeting metadata so the content
-- reaction simulator (Phase 9.4) can sample appropriate personas for
-- each platform/market.

create table if not exists public.mrai_marketing_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null check (platform in (
    'x_twitter', 'instagram', 'tiktok', 'youtube', 'threads',
    'naver_blog', 'naver_smartstore', 'kakao_channel',
    'facebook', 'linkedin', 'reddit', 'other'
  )),
  -- @handle on the platform (without @). e.g. "lemouton_official"
  handle text not null,
  -- Display name shown in feeds. e.g. "르무통 공식"
  display_name text,
  -- Target market for persona sampling. ISO-2 country code.
  market_country text,
  -- Audience targeting hints for persona sampling.
  -- e.g. ["25-34", "여성", "프리미엄 가격대 수용", "K-패션 관심"]
  target_segments jsonb not null default '[]'::jsonb,
  -- "Tone of voice" / posting style for the AI content drafter.
  -- e.g. "K-comfort 스토리텔링 중심, 제품 베네핏 + 일상 신 위주"
  posting_style text,
  -- Account bio text (used by the simulator as social proof signal).
  bio_text text,
  -- Brand colors / asset URLs for image prompt generation
  brand_assets jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mrai_marketing_channels_ws_idx
  on public.mrai_marketing_channels (workspace_id, platform);

create index if not exists mrai_marketing_channels_market_idx
  on public.mrai_marketing_channels (market_country)
  where market_country is not null;

alter table public.mrai_marketing_channels enable row level security;

create policy "mrai_marketing_channels_rw_members" on public.mrai_marketing_channels
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- updated_at autotouch — mirrors the pattern from mrai_channels.
create or replace function public.touch_mrai_marketing_channels()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_mrai_marketing_channels on public.mrai_marketing_channels;
create trigger trg_touch_mrai_marketing_channels
  before update on public.mrai_marketing_channels
  for each row execute function public.touch_mrai_marketing_channels();
