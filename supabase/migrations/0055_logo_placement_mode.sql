-- Logo placement mode — whether to use vision-detected product-surface
-- placement (looks like a real product photo) or the corner watermark
-- (reliable but obvious).
alter table public.mrai_image_gen_settings
  add column if not exists logo_placement_mode text not null default 'product_surface'
    check (logo_placement_mode in ('product_surface', 'corner_watermark'));

comment on column public.mrai_image_gen_settings.logo_placement_mode is
  'product_surface = Claude Vision detects shoe tongue/side/heel and sharp composites logo there (looks like real product photo, costs ~$0.005/frame). corner_watermark = fixed bottom-right badge (cheap, reliable).';
