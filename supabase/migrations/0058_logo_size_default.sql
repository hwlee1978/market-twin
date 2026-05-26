-- Bump default logo size — user feedback: "로고가 선명치 않아, 좀더 크게".
-- 11% width was too small to read against busy backgrounds. 16% gives
-- prominent branding while staying tasteful.
alter table public.mrai_image_gen_settings
  alter column logo_size_pct set default 16;

-- Carry the bump to existing rows that still have the old default 11.
-- Rows the user has explicitly customized (anything ≠ 11) stay as-is.
update public.mrai_image_gen_settings
   set logo_size_pct = 16
 where logo_size_pct = 11;
