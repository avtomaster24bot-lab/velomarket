-- VeloMarket: хранилище фото (Supabase Storage)
-- listing-photos — публичные фото объявлений
-- verification   — ПРИВАТНЫЕ фото серийного номера (видят владелец и модератор)
-- ads            — баннеры (загружает только админ)
-- Лимиты: до 5 МБ (баннеры 2 МБ), только JPEG / PNG / WebP (баннеры ещё GIF).
-- Путь файла: <user_id>/<listing_id>/<имя>.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('listing-photos', 'listing-photos', true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('verification',   'verification',   false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('ads',            'ads',            true,  2097152, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- listing-photos: загружать можно только в свою папку
drop policy if exists "lp insert own" on storage.objects;
create policy "lp insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text
              and not public.is_banned());
drop policy if exists "lp select own" on storage.objects;
create policy "lp select own" on storage.objects for select to authenticated
  using (bucket_id = 'listing-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "lp update own" on storage.objects;
create policy "lp update own" on storage.objects for update to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "lp delete own" on storage.objects;
create policy "lp delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- verification: приватно — владелец и админ
drop policy if exists "verif insert own" on storage.objects;
create policy "verif insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "verif select own or admin" on storage.objects;
create policy "verif select own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'verification' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "verif update own" on storage.objects;
create policy "verif update own" on storage.objects for update to authenticated
  using (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "verif delete own or admin" on storage.objects;
create policy "verif delete own or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'verification' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ads: только админ
drop policy if exists "ads admin write" on storage.objects;
create policy "ads admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'ads' and public.is_admin());
drop policy if exists "ads admin select" on storage.objects;
create policy "ads admin select" on storage.objects for select to authenticated
  using (bucket_id = 'ads' and public.is_admin());
drop policy if exists "ads admin update" on storage.objects;
create policy "ads admin update" on storage.objects for update to authenticated
  using (bucket_id = 'ads' and public.is_admin());
drop policy if exists "ads admin delete" on storage.objects;
create policy "ads admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ads' and public.is_admin());
