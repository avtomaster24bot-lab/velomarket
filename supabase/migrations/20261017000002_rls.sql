-- VeloMarket: Row Level Security — включено на ВСЕХ таблицах

alter table public.profiles             enable row level security;
alter table public.known_brands         enable row level security;
alter table public.currency_rates       enable row level security;
alter table public.listings             enable row level security;
alter table public.listing_photos       enable row level security;
alter table public.listing_verification enable row level security;
alter table public.favorites            enable row level security;
alter table public.reports              enable row level security;
alter table public.ads                  enable row level security;
alter table public.rate_limits          enable row level security;  -- политик нет: доступ только service_role

-- ---------- profiles ----------
-- Чужие профили напрямую не читаются (данные продавца — через get_seller / get_seller_phone)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
-- Создание профилей — только Edge Function (service_role). Пользователь может менять лишь телефон.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (phone) on public.profiles to authenticated;

-- ---------- known_brands / currency_rates: читают все, пишет админ ----------
drop policy if exists brands_read on public.known_brands;
create policy brands_read on public.known_brands for select using (true);
drop policy if exists brands_admin on public.known_brands;
create policy brands_admin on public.known_brands for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists rates_read on public.currency_rates;
create policy rates_read on public.currency_rates for select using (true);
drop policy if exists rates_admin on public.currency_rates;
create policy rates_admin on public.currency_rates for all using (public.is_admin()) with check (public.is_admin());

-- ---------- listings ----------
-- Публично видны только одобренные (и проданные); владелец видит свои; админ — всё
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select
  using (status in ('approved','sold') or user_id = auth.uid() or public.is_admin());
drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned());
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists listings_delete on public.listings;
create policy listings_delete on public.listings for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.listings from anon;

-- ---------- listing_photos ----------
-- (отдельная функция, чтобы политика не ссылалась сама на себя)
create or replace function public.listing_photo_count(p_listing_id bigint)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.listing_photos where listing_id = p_listing_id $$;

drop policy if exists photos_select on public.listing_photos;
create policy photos_select on public.listing_photos for select
  using (exists (select 1 from public.listings l where l.id = listing_id));  -- RLS listings применяется внутри
drop policy if exists photos_insert on public.listing_photos;
create policy photos_insert on public.listing_photos for insert to authenticated
  with check (
    exists (select 1 from public.listings l where l.id = listing_id
             and l.user_id = auth.uid() and l.status in ('draft','pending','rejected','approved'))
    and split_part(path, '/', 1) = auth.uid()::text
    and split_part(path, '/', 2) = listing_id::text
    and public.listing_photo_count(listing_id) < 20);
drop policy if exists photos_update on public.listing_photos;
create policy photos_update on public.listing_photos for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and (l.user_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and (l.user_id = auth.uid() or public.is_admin())));
drop policy if exists photos_delete on public.listing_photos;
create policy photos_delete on public.listing_photos for delete to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and (l.user_id = auth.uid() or public.is_admin())));
revoke insert, update, delete on public.listing_photos from anon;

-- ---------- listing_verification: серийник — только владелец и админ ----------
drop policy if exists verif_select on public.listing_verification;
create policy verif_select on public.listing_verification for select to authenticated
  using (public.is_admin() or exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid()));
drop policy if exists verif_insert on public.listing_verification;
create policy verif_insert on public.listing_verification for insert to authenticated
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid())
              and split_part(serial_photo_path, '/', 1) = auth.uid()::text);
drop policy if exists verif_update on public.listing_verification;
create policy verif_update on public.listing_verification for update to authenticated
  using (public.is_admin() or exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid()))
  with check (public.is_admin() or (exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid())
              and split_part(serial_photo_path, '/', 1) = auth.uid()::text));
drop policy if exists verif_delete on public.listing_verification;
create policy verif_delete on public.listing_verification for delete to authenticated
  using (public.is_admin() or exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid()));
revoke all on public.listing_verification from anon;

-- ---------- favorites ----------
drop policy if exists fav_own on public.favorites;
create policy fav_own on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.favorites from anon;

-- ---------- reports ----------
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists reports_admin_delete on public.reports;
create policy reports_admin_delete on public.reports for delete to authenticated
  using (public.is_admin());
revoke all on public.reports from anon;

-- ---------- ads ----------
drop policy if exists ads_public on public.ads;
create policy ads_public on public.ads for select
  using ((active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or public.is_admin());
drop policy if exists ads_admin on public.ads;
create policy ads_admin on public.ads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- функции: кто может вызывать ----------
revoke all on function public.submit_listing(bigint) from public, anon;
grant execute on function public.submit_listing(bigint) to authenticated;
grant execute on function public.increment_view(bigint) to anon, authenticated;
grant execute on function public.get_seller(bigint) to anon, authenticated;
grant execute on function public.get_seller_phone(bigint) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
