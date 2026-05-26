-- Storage bucket for AI-generated content images. Public-read so the
-- draft card can render the URLs directly; insert/update restricted to
-- service-role via the API.
insert into storage.buckets (id, name, public)
values ('mrai-content', 'mrai-content', true)
on conflict (id) do nothing;

-- Drop legacy permissive policies if any prior migration left them.
drop policy if exists "mrai_content_public_read" on storage.objects;
drop policy if exists "mrai_content_service_write" on storage.objects;

create policy "mrai_content_public_read"
  on storage.objects for select
  using (bucket_id = 'mrai-content');

-- service_role bypasses RLS anyway; this policy just makes intent
-- explicit if anon clients ever try to write (they will be rejected).
create policy "mrai_content_service_write"
  on storage.objects for insert
  with check (bucket_id = 'mrai-content' and auth.role() = 'service_role');

-- Per-draft gallery: cover lives in mrai_content_drafts.image_url (the
-- existing column), additional carousel/detail images live in
-- image_urls so the UI can render multi-image previews and the
-- simulator can consider visual variety.
alter table public.mrai_content_drafts
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

comment on column public.mrai_content_drafts.image_urls is
  'Additional detail images for carousels (Instagram) or multi-frame YouTube/Naver posts. Cover image lives in image_url.';
