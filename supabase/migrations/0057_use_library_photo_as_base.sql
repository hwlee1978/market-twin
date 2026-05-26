-- Touchup mode — instead of generating product from scratch (drifts),
-- use a real library photo as base and gpt-image-1.edit + mask
-- regenerates only the surrounding scene. Product stays pixel-accurate.
alter table public.mrai_image_gen_settings
  add column if not exists use_library_photo_as_base boolean not null default true;

comment on column public.mrai_image_gen_settings.use_library_photo_as_base is
  'When true and ≥1 product photo exists, image-gen uses one of the library photos as base and only edits the background via mask. Result: 100% accurate product. When false, falls back to text-to-image generation (model invents the product, often drifting from references).';
