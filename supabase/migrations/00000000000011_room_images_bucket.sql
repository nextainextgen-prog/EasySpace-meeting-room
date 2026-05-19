-- Public storage bucket for room thumbnails / gallery uploads.
-- Idempotent so it can be re-run safely.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-images',
  'room-images',
  true,
  10485760,                                                  -- 10 MB cap
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read so <img> / next/image can fetch directly.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'room-images public read'
  ) then
    create policy "room-images public read"
      on storage.objects for select
      using (bucket_id = 'room-images');
  end if;
end $$;

-- Authenticated users may upload / replace / delete files in this bucket.
-- (Service-role bypasses RLS regardless; this is for direct-from-browser
-- uploads if we ever switch to them later.)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'room-images authenticated write'
  ) then
    create policy "room-images authenticated write"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'room-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'room-images authenticated update'
  ) then
    create policy "room-images authenticated update"
      on storage.objects for update
      to authenticated
      using (bucket_id = 'room-images')
      with check (bucket_id = 'room-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'room-images authenticated delete'
  ) then
    create policy "room-images authenticated delete"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'room-images');
  end if;
end $$;
