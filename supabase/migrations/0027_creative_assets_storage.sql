-- Storage bucket for user-uploaded creative-concept mockups (ad images).
-- Replaces the wizard's URL-only input which assumed users had hosted
-- mockups — most don't pre-launch. Bucket is public-read because the
-- Anthropic Vision API fetches the URL directly to evaluate visuals.
-- Upload + delete remain workspace-scoped via RLS.

insert into storage.buckets (id, name, public)
values ('creative-assets', 'creative-assets', true)
on conflict (id) do update
set public = excluded.public;

-- Path convention: <workspace_id>/<draft_or_project_id>/<uuid>.<ext>
-- The first folder segment is the workspace_id — RLS uses it to scope
-- writes to authenticated members of that workspace.

create policy "creative_assets_insert_member"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'creative-assets'
  and (storage.foldername(name))[1] in (
    select workspace_id::text
    from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "creative_assets_update_member"
on storage.objects for update to authenticated
using (
  bucket_id = 'creative-assets'
  and (storage.foldername(name))[1] in (
    select workspace_id::text
    from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "creative_assets_delete_member"
on storage.objects for delete to authenticated
using (
  bucket_id = 'creative-assets'
  and (storage.foldername(name))[1] in (
    select workspace_id::text
    from public.workspace_members
    where user_id = auth.uid()
  )
);

-- Public read is granted by `public = true` on the bucket; no separate
-- SELECT policy needed (Supabase storage's built-in anon-read kicks in).
