-- Vision-extracted product profile per workspace.
--
-- Until now image-gen prompts hardcoded shoe-specific language ("shoe
-- tongue", "side panel", "heel patch"), which broke for any non-footwear
-- workspace (cosmetics, apparel, electronics, food, SaaS, etc.). The
-- profile here is built by running Claude Vision over the workspace's
-- uploaded product photos and produces a category-agnostic structured
-- description of the actual product, which all downstream LLM calls
-- (drafter, image-gen prompt, vision logo-placement) consume.

create table if not exists public.mrai_workspace_product_profile (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,

  -- Coarse category — drives platform-shape conventions + logo placement.
  category text not null default 'other'
    check (category in (
      'footwear',
      'apparel',
      'cosmetics',
      'skincare',
      'fragrance',
      'accessories',
      'jewelry',
      'electronics',
      'home_goods',
      'food_beverage',
      'health_supplements',
      'saas_digital',
      'ip_media',
      'other'
    )),

  -- Free-text description (50-300 chars) — injected into image-gen
  -- and drafter prompts as authoritative product spec.
  description text,

  -- Structured visual signature — used by image-gen to remind the model
  -- of the product's defining features.
  visual_features jsonb not null default '{}'::jsonb,
    -- {
    --   silhouette: "low-top slip-on sneaker with velcro strap",
    --   materials: ["felted cream wool upper", "rubber cream sole"],
    --   colors: ["cream/off-white", "cream sole"],
    --   distinguishing: ["small embroidered Le Mouton label on side"],
    --   typical_angles: ["3/4 side", "top-down", "lifestyle worn"]
    -- }

  -- Where the brand logo naturally sits on this product type — used by
  -- the vision detector as a category-specific prompt hint.
  -- For footwear: "tongue / side panel / heel patch"
  -- For apparel:  "left chest / sleeve / hem tag"
  -- For cosmetics bottles: "front label / cap"
  logo_placement_hints text[] not null default '{}'::text[],

  -- Which assets were used to build this profile (for staleness check)
  built_from_asset_ids uuid[] not null default '{}'::uuid[],

  -- Stats
  built_at timestamptz,
  build_cost_usd numeric(8,4),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mrai_workspace_product_profile enable row level security;

create policy "mrai_workspace_product_profile_rw_members"
  on public.mrai_workspace_product_profile
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create or replace function public.mrai_workspace_product_profile_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end$$;

drop trigger if exists trg_mrai_workspace_product_profile_updated_at
  on public.mrai_workspace_product_profile;
create trigger trg_mrai_workspace_product_profile_updated_at
  before update on public.mrai_workspace_product_profile
  for each row execute function public.mrai_workspace_product_profile_touch_updated_at();

comment on table public.mrai_workspace_product_profile is
  'Vision-extracted structured product card. Built by Claude Vision over uploaded product photos. Drives all downstream LLM prompts (drafter / image-gen / logo placement) so they work for ANY product category — not just shoes.';
