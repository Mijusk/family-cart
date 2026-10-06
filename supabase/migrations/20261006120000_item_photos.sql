-- Optional photo per list line.
--
-- The image lives in the private `item-photos` bucket under `<group_id>/<uuid>.jpg`; the
-- item only stores that path. The app shrinks photos to ~1024px JPEG before uploading, so
-- the 2 MB cap is just a safety net. Files are never overwritten: a new photo gets a new
-- path, and the app removes the old file once the change can no longer be undone.

alter table public.items
  add column photo_path text
  check (photo_path is null or photo_path like group_id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 2097152, array['image/jpeg']);

-- The first folder of the object name is the group id. Compared as text so a malformed
-- name is simply denied instead of failing a uuid cast.
create function public.can_use_group_folder(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_identities
     where group_id::text = (storage.foldername(object_name))[1] and user_id = (select auth.uid())
  )
$$;

revoke execute on function public.can_use_group_folder(text) from public, anon;
grant execute on function public.can_use_group_folder(text) to authenticated;

create policy "members see their group's photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos' and public.can_use_group_folder(name));
create policy "members upload photos to their group" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos' and public.can_use_group_folder(name));
create policy "members delete their group's photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and public.can_use_group_folder(name));
