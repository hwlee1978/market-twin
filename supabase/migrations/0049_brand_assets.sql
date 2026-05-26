-- Workspace-level brand asset library — real product photos / logos /
-- lifestyle shots / packaging that the image generator uses as
-- references via gpt-image-1's image-edit endpoint. Without these,
-- generated marketing imagery is generic and unfit for actual publish.

create table if not exists public.mrai_brand_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- Asset taxonomy — drives how the image generator picks references
  -- (e.g. "product" assets for catalog shots, "lifestyle" for IG carousels).
  asset_type text not null default 'product'
    check (asset_type in ('product', 'lifestyle', 'logo', 'packaging', 'pattern', 'other')),

  label text,                          -- "메이트 화이트 사이드뷰" / "FW26 룩북 #3"
  description text,                    -- optional detail

  -- Storage refs
  image_url text not null,             -- public URL (mrai-content bucket)
  storage_path text not null,          -- bucket path for cleanup
  file_size_bytes integer,
  mime_type text,
  width integer,
  height integer,

  -- Usage tracking — increment whenever a draft uses this as a reference.
  use_count integer not null default 0,
  last_used_at timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mrai_brand_assets_ws_type_idx
  on public.mrai_brand_assets (workspace_id, asset_type, created_at desc);

alter table public.mrai_brand_assets enable row level security;

create policy "mrai_brand_assets_rw_members" on public.mrai_brand_assets
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Updated-at trigger — local helper because there's no shared
-- set_updated_at() in this project; other migrations inline the logic.
create or replace function public.mrai_brand_assets_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_mrai_brand_assets_updated_at on public.mrai_brand_assets;
create trigger trg_mrai_brand_assets_updated_at
  before update on public.mrai_brand_assets
  for each row execute function public.mrai_brand_assets_touch_updated_at();

comment on table public.mrai_brand_assets is
  'Workspace brand asset library — real product photos used as references for gpt-image-1 image-edit calls when generating marketing imagery.';
