-- ============================================================
-- Phase 6: storage policy for group cover photos
--
-- Group covers live in the existing public `avatars` bucket at
-- groups/<group_id>.jpg. The Phase 3 avatar policies only allow a user to
-- write their own <uid>.jpg, so group members need an additional policy to
-- write the groups/<id>.jpg object for groups they belong to. Read is already
-- covered by the public bucket + the avatars_read_all policy.
-- ============================================================

drop policy if exists "avatars_group_cover_insert" on storage.objects;
create policy "avatars_group_cover_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name like 'groups/%.jpg'
    and public.is_group_member(
      (split_part(split_part(name, '/', 2), '.', 1))::uuid
    )
  );

drop policy if exists "avatars_group_cover_update" on storage.objects;
create policy "avatars_group_cover_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name like 'groups/%.jpg'
    and public.is_group_member(
      (split_part(split_part(name, '/', 2), '.', 1))::uuid
    )
  )
  with check (
    bucket_id = 'avatars'
    and name like 'groups/%.jpg'
    and public.is_group_member(
      (split_part(split_part(name, '/', 2), '.', 1))::uuid
    )
  );
