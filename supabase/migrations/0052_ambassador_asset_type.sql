-- Add 'ambassador' asset type for celebrity / contracted-model photos.
--
-- User insight: most uploaded "model wearing the product" photos belong
-- to advertising contracts with named celebrities. Image generation has
-- much higher marketing impact when those celebrities appear in the
-- generated marketing imagery — so we tag them explicitly and force
-- the image generator to preserve their face/identity (vs treating them
-- as generic lifestyle photos that could be re-rendered with random models).

alter table public.mrai_brand_assets
  drop constraint if exists mrai_brand_assets_asset_type_check;

alter table public.mrai_brand_assets
  add constraint mrai_brand_assets_asset_type_check
  check (asset_type in (
    'product',
    'lifestyle',
    'logo',
    'packaging',
    'pattern',
    'ambassador',
    'other'
  ));

comment on column public.mrai_brand_assets.asset_type is
  'Asset taxonomy: product (real product shot), lifestyle (scene/situation), logo (brand mark), packaging, pattern (texture/background), ambassador (contracted celebrity/model — preserve face), other.';
