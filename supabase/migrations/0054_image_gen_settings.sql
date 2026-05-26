-- Workspace-level image generation settings.
--
-- Controls how AI-generated images are post-processed: logo composite
-- position/size, prompt strictness, frame count defaults per platform,
-- etc. One row per workspace; auto-created on first GET.

create table if not exists public.mrai_image_gen_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,

  -- Logo composite (sharp post-production overlay)
  logo_position text not null default 'bottom-right'
    check (logo_position in ('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center')),
  logo_size_pct numeric(5,2) not null default 11.00
    check (logo_size_pct between 3 and 40),
  logo_padding_pct numeric(5,2) not null default 3.50
    check (logo_padding_pct between 0 and 15),
  logo_opacity numeric(3,2) not null default 1.00
    check (logo_opacity between 0 and 1),
  logo_with_backdrop boolean not null default true,
  -- Composite logo when a logo asset exists. Off = AI output as-is.
  logo_composite_enabled boolean not null default true,

  -- Prompt strictness: 'creative' = looser scene variety,
  -- 'strict' = more conservative (no text anywhere, basic compositions).
  prompt_strictness text not null default 'strict'
    check (prompt_strictness in ('creative', 'balanced', 'strict')),

  -- Quality tier: 'low' / 'medium' / 'high' for gpt-image-1.
  quality text not null default 'medium'
    check (quality in ('low', 'medium', 'high')),

  -- Default frame counts override per platform (jsonb)
  frame_counts jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mrai_image_gen_settings enable row level security;

create policy "mrai_image_gen_settings_rw_members" on public.mrai_image_gen_settings
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create or replace function public.mrai_image_gen_settings_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end$$;

drop trigger if exists trg_mrai_image_gen_settings_updated_at on public.mrai_image_gen_settings;
create trigger trg_mrai_image_gen_settings_updated_at
  before update on public.mrai_image_gen_settings
  for each row execute function public.mrai_image_gen_settings_touch_updated_at();

comment on table public.mrai_image_gen_settings is
  'Per-workspace image generation defaults — logo composite position/size, prompt strictness, frame counts.';
