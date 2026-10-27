-- VeloMarket: ВСЕ миграции одним файлом (для SQL Editor в Supabase). Сгенерировано из supabase/migrations/.

-- ===================== 20261017000001_schema.sql =====================
-- VeloMarket: схема базы данных (таблицы, функции, триггеры)
-- Применяется в Supabase: SQL Editor → вставить → Run (или `supabase db push`).

-- ============================================================
-- Профили пользователей (создаются Edge Function telegram-auth)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tg_id       bigint not null unique,
  username    text,
  first_name  text,
  is_admin    boolean not null default false,
  is_banned   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- Справочник брендов (только реальные производители)
-- ============================================================
create table if not exists public.known_brands (
  id          serial primary key,
  name        text not null unique,
  country     text not null,
  kind        text not null default 'bike' check (kind in ('bike','parts','both')),
  is_popular  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Курсы валют (примерные, админ обновляет) — для сортировки по цене
-- ============================================================
create table if not exists public.currency_rates (
  code         text primary key check (code ~ '^[A-Z]{3}$'),
  rate_to_kzt  numeric(14,4) not null check (rate_to_kzt > 0),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- Объявления
-- ============================================================
create table if not exists public.listings (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  category         text not null check (category in ('bike','part','accessory')),
  brand_id         int references public.known_brands(id),
  brand_other      text check (brand_other is null or char_length(brand_other) between 2 and 60),
  title            text not null default '',
  model            text not null check (char_length(model) between 1 and 120),
  year             int check (year is null or year between 1950 and 2100),
  bike_type        text check (bike_type is null or bike_type in
                     ('горный','шоссейный','гравийный','городской','электро','BMX','детский','фэтбайк')),
  frame_size       text check (frame_size is null or char_length(frame_size) <= 20),
  wheel_size       text check (wheel_size is null or char_length(wheel_size) <= 20),
  condition        text not null check (condition in ('new','used')),
  price            numeric(14,2) not null check (price >= 0 and price < 1000000000000),
  currency         text not null default 'KZT' references public.currency_rates(code),
  price_kzt        numeric(18,2),
  country          text not null check (char_length(country) between 2 and 60),
  city             text not null check (char_length(city) between 1 and 80),
  description      text not null default '' check (char_length(description) <= 5000),
  cover_path       text,
  status           text not null default 'draft'
                     check (status in ('draft','pending','approved','rejected','sold')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  verified         boolean not null default false,
  featured         boolean not null default false,
  -- бренд не из справочника → усиленная проверка модератором
  needs_close_review boolean generated always as (brand_id is null) stored,
  views            int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  published_at     timestamptz,
  sold_at          timestamptz,
  constraint listings_brand_present check (brand_id is not null or brand_other is not null)
);

create index if not exists listings_status_published_idx on public.listings (status, published_at desc);
create index if not exists listings_user_idx      on public.listings (user_id);
create index if not exists listings_brand_idx     on public.listings (brand_id);
create index if not exists listings_category_idx  on public.listings (category, bike_type);
create index if not exists listings_geo_idx       on public.listings (country, city);
create index if not exists listings_price_idx     on public.listings (price_kzt);
create index if not exists listings_featured_idx  on public.listings (featured) where featured;

-- Публичные фото объявления (общие + фото логотипа/бренда)
create table if not exists public.listing_photos (
  id          bigint generated always as identity primary key,
  listing_id  bigint not null references public.listings(id) on delete cascade,
  path        text not null unique,
  kind        text not null default 'general' check (kind in ('general','brand')),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists listing_photos_listing_idx on public.listing_photos (listing_id, position);

-- Серийный номер рамы и его фото — видит ТОЛЬКО владелец и модератор
create table if not exists public.listing_verification (
  listing_id         bigint primary key references public.listings(id) on delete cascade,
  serial_number      text not null check (char_length(serial_number) between 3 and 64),
  serial_photo_path  text not null,
  moderator_note     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Избранное
create table if not exists public.favorites (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  listing_id  bigint not null references public.listings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- Жалобы
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  listing_id  bigint not null references public.listings(id) on delete cascade,
  user_id     uuid default auth.uid() references public.profiles(id) on delete set null,
  reason      text not null check (reason in ('replica','fraud','wrong_info','sold','spam','other')),
  comment     text check (comment is null or char_length(comment) <= 1000),
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now(),
  unique (listing_id, user_id)
);

-- Реклама
create table if not exists public.ads (
  id          bigint generated always as identity primary key,
  slot        text not null check (slot in ('home_top','list_inline','listing_side')),
  title       text not null default '' check (char_length(title) <= 120),
  image_url   text not null,
  url         text not null check (url ~ '^https?://'),
  active      boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

-- Счётчики для ограничения частоты запросов (только service_role)
create table if not exists public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          int not null default 0,
  primary key (key, window_start)
);

-- ============================================================
-- Функции
-- ============================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_banned from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists verification_touch on public.listing_verification;
create trigger verification_touch before update on public.listing_verification
  for each row execute function public.touch_updated_at();

-- Защита объявлений: владелец не может сам одобрить, поставить «Проверено»,
-- «Продвижение» или накрутить просмотры. Правка одобренного → повторная модерация.
create or replace function public.listings_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  bypass boolean := coalesce(current_setting('velomarket.bypass', true), '') = 'on';
  admin  boolean := public.is_admin() or current_user in ('postgres','service_role','supabase_admin');
  bname  text;
begin
  select b.name into bname from public.known_brands b where b.id = new.brand_id;
  new.title := btrim(coalesce(bname, new.brand_other, '') || ' ' || coalesce(new.model, ''));
  new.price_kzt := round(new.price * coalesce(
    (select r.rate_to_kzt from public.currency_rates r where r.code = new.currency), 1), 2);
  if new.brand_id is not null then new.brand_other := null; end if;
  if new.category <> 'bike' then new.bike_type := null; end if;

  if tg_op = 'INSERT' then
    if not admin and not bypass then
      new.user_id := auth.uid();
      new.status := 'draft';
      new.verified := false;
      new.featured := false;
      new.views := 0;
      new.rejection_reason := null;
      new.cover_path := null;
      new.published_at := null;
      new.sold_at := null;
      new.created_at := now();
    end if;
    return new;
  end if;

  new.updated_at := now();
  if admin or bypass then
    if new.status = 'approved' and old.status is distinct from 'approved' and new.published_at is null then
      new.published_at := now();
    end if;
    if new.status = 'sold' and old.status is distinct from 'sold' then new.sold_at := now(); end if;
    return new;
  end if;

  -- обычный пользователь (владелец)
  new.user_id := old.user_id;
  new.verified := old.verified;
  new.featured := old.featured;
  new.views := old.views;
  new.rejection_reason := old.rejection_reason;
  new.cover_path := old.cover_path;
  new.published_at := old.published_at;
  new.created_at := old.created_at;

  if new.status is distinct from old.status then
    if old.status = 'approved' and new.status = 'sold' then
      new.sold_at := now();
    elsif new.status = 'draft' and old.status in ('pending','rejected') then
      null; -- можно отозвать с модерации в черновик
    else
      raise exception 'Недопустимая смена статуса: % → %', old.status, new.status using errcode = '42501';
    end if;
  end if;

  if (new.category, new.brand_id, new.brand_other, new.model, new.year, new.bike_type, new.frame_size,
      new.wheel_size, new.condition, new.price, new.currency, new.country, new.city, new.description)
     is distinct from
     (old.category, old.brand_id, old.brand_other, old.model, old.year, old.bike_type, old.frame_size,
      old.wheel_size, old.condition, old.price, old.currency, old.country, old.city, old.description) then
    if old.status = 'approved' and new.status = 'approved' then
      new.status := 'pending';      -- изменили одобренное → снова на модерацию
      new.verified := false;
    elsif old.status = 'rejected' and new.status = 'rejected' then
      new.status := 'draft';        -- исправляют отклонённое → черновик, затем «Отправить»
    elsif old.status = 'sold' then
      raise exception 'Проданное объявление нельзя редактировать' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists listings_guard on public.listings;
create trigger listings_guard before insert or update on public.listings
  for each row execute function public.listings_guard();

-- Отправка на модерацию: проверяет обязательные фото и серийный номер
create or replace function public.submit_listing(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.listings;
  n_general int; n_brand int; has_serial boolean; cover text;
begin
  select * into l from public.listings where id = p_id;
  if l.id is null or l.user_id is distinct from auth.uid() then
    raise exception 'Объявление не найдено' using errcode = '42501';
  end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован' using errcode = '42501'; end if;
  -- связь с продавцом только через Telegram → нужен username
  if coalesce(btrim((select p.username from public.profiles p where p.id = auth.uid())), '') = '' then
    raise exception 'Укажите username в настройках Telegram, чтобы покупатели могли вам написать. Затем выйдите и войдите на сайт снова.'
      using errcode = 'P0001';
  end if;
  if l.status not in ('draft','rejected','pending','approved') then
    raise exception 'Это объявление нельзя отправить на модерацию (статус %)', l.status;
  end if;
  select count(*) filter (where kind = 'general'), count(*) filter (where kind = 'brand')
    into n_general, n_brand from public.listing_photos where listing_id = p_id;
  select exists(select 1 from public.listing_verification v where v.listing_id = p_id) into has_serial;
  if n_general < 3 then raise exception 'Нужно минимум 3 общих фото (сейчас %)', n_general; end if;
  if n_brand < 1 then raise exception 'Нужно фото логотипа / надписи бренда'; end if;
  if not has_serial then raise exception 'Нужны серийный номер рамы и его фото'; end if;
  select path into cover from public.listing_photos
    where listing_id = p_id and kind = 'general' order by position, id limit 1;

  perform set_config('velomarket.bypass', 'on', true);
  update public.listings
     set status = 'pending', rejection_reason = null, cover_path = cover,
         verified = case when l.status = 'approved' then false else verified end
   where id = p_id;
  perform set_config('velomarket.bypass', 'off', true);
end $$;

-- Счётчик просмотров (только опубликованные)
create or replace function public.increment_view(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('velomarket.bypass', 'on', true);
  update public.listings set views = views + 1 where id = p_id and status in ('approved','sold');
  perform set_config('velomarket.bypass', 'off', true);
end $$;

-- Публичная карточка продавца: только имя и username Telegram (телефон не храним вообще)
drop function if exists public.get_seller_phone(bigint);
drop function if exists public.get_seller(bigint);
create function public.get_seller(p_listing_id bigint)
returns table (username text, first_name text, member_since timestamptz, active_listings bigint)
language sql stable security definer set search_path = public as $$
  select p.username, p.first_name, p.created_at,
         (select count(*) from public.listings x where x.user_id = p.id and x.status = 'approved')
    from public.listings l join public.profiles p on p.id = l.user_id
   where l.id = p_listing_id
     and (l.status in ('approved','sold') or l.user_id = auth.uid() or public.is_admin());
$$;

-- Ограничение частоты (вызывает только Edge Function с service_role)
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare w timestamptz; n int;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, w, 1)
    on conflict (key, window_start) do update set hits = r.hits + 1
    returning hits into n;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return n <= p_limit;
end $$;

revoke all on function public.rate_limit_hit(text, int, int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.rate_limit_hit(text,int,int) from anon, authenticated';
    execute 'grant execute on function public.rate_limit_hit(text,int,int) to service_role';
  end if;
end $$;

-- При смене курса пересчитываем цену в тенге у объявлений в этой валюте
create or replace function public.currency_rates_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('velomarket.bypass', 'on', true);
  update public.listings set price_kzt = round(price * new.rate_to_kzt, 2) where currency = new.code;
  perform set_config('velomarket.bypass', 'off', true);
  return new;
end $$;
drop trigger if exists currency_rates_recalc on public.currency_rates;
create trigger currency_rates_recalc after update of rate_to_kzt on public.currency_rates
  for each row execute function public.currency_rates_recalc();

-- ===================== 20261017000002_rls.sql =====================
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
-- Чужие профили напрямую не читаются (имя и username продавца — через get_seller)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
-- Создание и обновление профилей — только Edge Function (service_role) при входе.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

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
grant execute on function public.is_admin() to anon, authenticated;

-- ===================== 20261017000003_storage.sql =====================
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

-- ===================== 20261017000004_seed_brands.sql =====================
-- VeloMarket: справочник реальных брендов (202 шт.) и примерные курсы валют.
-- Только настоящие производители. «Другой бренд» в форме допускается, но идёт на усиленную проверку.

insert into public.known_brands (name, country, kind, is_popular) values
  ('Trek', 'США', 'bike', true),
  ('Specialized', 'США', 'bike', true),
  ('Cannondale', 'США', 'bike', true),
  ('Santa Cruz', 'США', 'bike', true),
  ('GT', 'США', 'bike', true),
  ('Marin', 'США', 'bike', false),
  ('Felt', 'США', 'bike', false),
  ('Lynskey', 'США', 'bike', false),
  ('Surly', 'США', 'bike', false),
  ('Salsa', 'США', 'bike', false),
  ('All-City', 'США', 'bike', false),
  ('Electra', 'США', 'bike', false),
  ('Schwinn', 'США', 'bike', false),
  ('Pivot', 'США', 'bike', false),
  ('Yeti', 'США', 'bike', false),
  ('Ibis', 'США', 'bike', false),
  ('Transition', 'США', 'bike', false),
  ('Evil', 'США', 'bike', false),
  ('Niner', 'США', 'bike', false),
  ('Diamondback', 'США', 'bike', false),
  ('Mongoose', 'США', 'bike', false),
  ('Haro', 'США', 'bike', false),
  ('Sunday', 'США', 'bike', false),
  ('Kink', 'США', 'bike', false),
  ('Fit Bike Co', 'США', 'bike', false),
  ('Rad Power Bikes', 'США', 'bike', false),
  ('Dahon', 'США', 'bike', false),
  ('Strider', 'США', 'bike', false),
  ('Huffy', 'США', 'bike', false),
  ('Kona', 'Канада', 'bike', false),
  ('Cervélo', 'Канада', 'bike', true),
  ('Rocky Mountain', 'Канада', 'bike', false),
  ('Norco', 'Канада', 'bike', false),
  ('Devinci', 'Канада', 'bike', false),
  ('Argon 18', 'Канада', 'bike', false),
  ('Giant', 'Тайвань', 'bike', true),
  ('Merida', 'Тайвань', 'bike', true),
  ('Liv', 'Тайвань', 'bike', false),
  ('Tern', 'Тайвань', 'bike', false),
  ('Cube', 'Германия', 'bike', true),
  ('Canyon', 'Германия', 'bike', true),
  ('Focus', 'Германия', 'bike', false),
  ('Ghost', 'Германия', 'bike', false),
  ('Haibike', 'Германия', 'bike', false),
  ('YT Industries', 'Германия', 'bike', false),
  ('Riese & Müller', 'Германия', 'bike', false),
  ('Kalkhoff', 'Германия', 'bike', false),
  ('Stevens', 'Германия', 'bike', false),
  ('Rose', 'Германия', 'bike', false),
  ('Radon', 'Германия', 'bike', false),
  ('Bulls', 'Германия', 'bike', false),
  ('Corratec', 'Германия', 'bike', false),
  ('Centurion', 'Германия', 'bike', false),
  ('Bergamont', 'Германия', 'bike', false),
  ('Conway', 'Германия', 'bike', false),
  ('Puky', 'Германия', 'bike', false),
  ('WeThePeople', 'Германия', 'bike', false),
  ('Scott', 'Швейцария', 'bike', true),
  ('BMC', 'Швейцария', 'bike', false),
  ('Stromer', 'Швейцария', 'bike', false),
  ('Flyer', 'Швейцария', 'bike', false),
  ('Simplon', 'Австрия', 'bike', false),
  ('KTM', 'Австрия', 'bike', false),
  ('Woom', 'Австрия', 'bike', false),
  ('Bianchi', 'Италия', 'bike', true),
  ('Pinarello', 'Италия', 'bike', true),
  ('Colnago', 'Италия', 'bike', false),
  ('Wilier Triestina', 'Италия', 'bike', false),
  ('De Rosa', 'Италия', 'bike', false),
  ('Cipollini', 'Италия', 'bike', false),
  ('Basso', 'Италия', 'bike', false),
  ('Cinelli', 'Италия', 'bike', false),
  ('Bottecchia', 'Италия', 'bike', false),
  ('3T', 'Италия', 'bike', false),
  ('Lapierre', 'Франция', 'bike', false),
  ('Look', 'Франция', 'both', false),
  ('Time', 'Франция', 'both', false),
  ('Sunn', 'Франция', 'bike', false),
  ('Moustache', 'Франция', 'bike', false),
  ('Rockrider (Decathlon)', 'Франция', 'bike', false),
  ('Triban (Decathlon)', 'Франция', 'bike', false),
  ('B''Twin (Decathlon)', 'Франция', 'bike', false),
  ('Van Rysel (Decathlon)', 'Франция', 'bike', false),
  ('Orbea', 'Испания', 'bike', true),
  ('Mondraker', 'Испания', 'bike', false),
  ('Commencal', 'Андорра', 'bike', false),
  ('Ridley', 'Бельгия', 'bike', false),
  ('Eddy Merckx', 'Бельгия', 'bike', false),
  ('Cowboy', 'Бельгия', 'bike', false),
  ('Batavus', 'Нидерланды', 'bike', false),
  ('Gazelle', 'Нидерланды', 'bike', false),
  ('VanMoof', 'Нидерланды', 'bike', false),
  ('Brompton', 'Великобритания', 'bike', true),
  ('Nukeproof', 'Великобритания', 'bike', false),
  ('Whyte', 'Великобритания', 'bike', false),
  ('Factor', 'Великобритания', 'bike', false),
  ('Raleigh', 'Великобритания', 'bike', false),
  ('Orange', 'Великобритания', 'bike', false),
  ('Boardman', 'Великобритания', 'bike', false),
  ('Pashley', 'Великобритания', 'bike', false),
  ('Ragley', 'Великобритания', 'bike', false),
  ('Vitus', 'Великобритания', 'bike', false),
  ('Genesis', 'Великобритания', 'bike', false),
  ('Mafiabikes', 'Великобритания', 'bike', false),
  ('Author', 'Чехия', 'bike', false),
  ('Superior', 'Чехия', 'bike', false),
  ('Kellys', 'Словакия', 'bike', false),
  ('Accent', 'Польша', 'both', false),
  ('Kross', 'Польша', 'bike', false),
  ('Romet', 'Польша', 'bike', false),
  ('Format', 'Россия', 'bike', true),
  ('Stels', 'Россия', 'bike', true),
  ('Stark', 'Россия', 'bike', true),
  ('Forward', 'Россия', 'bike', true),
  ('Stinger', 'Россия', 'bike', false),
  ('Novatrack', 'Россия', 'bike', false),
  ('Altair', 'Россия', 'bike', false),
  ('Welt', 'Россия', 'bike', false),
  ('Panasonic', 'Япония', 'bike', true),
  ('Bridgestone', 'Япония', 'bike', true),
  ('Yamaha', 'Япония', 'both', true),
  ('Miyata', 'Япония', 'bike', false),
  ('Fuji', 'Япония', 'bike', false),
  ('Maruishi', 'Япония', 'bike', false),
  ('Tokyobike', 'Япония', 'bike', false),
  ('Polygon', 'Индонезия', 'bike', false),
  ('Silverback', 'ЮАР', 'bike', false),
  ('Trinx', 'Китай', 'bike', false),
  ('Shimano', 'Япония', 'parts', true),
  ('SRAM', 'США', 'parts', true),
  ('Campagnolo', 'Италия', 'parts', false),
  ('Fox', 'США', 'parts', true),
  ('RockShox', 'США', 'parts', true),
  ('DT Swiss', 'Швейцария', 'parts', false),
  ('Mavic', 'Франция', 'parts', false),
  ('Continental', 'Германия', 'parts', false),
  ('Schwalbe', 'Германия', 'parts', true),
  ('Maxxis', 'Тайвань', 'parts', true),
  ('Michelin', 'Франция', 'parts', false),
  ('Pirelli', 'Италия', 'parts', false),
  ('Vittoria', 'Италия', 'parts', false),
  ('WTB', 'США', 'parts', false),
  ('Panaracer', 'Япония', 'parts', false),
  ('IRC', 'Япония', 'parts', false),
  ('Kenda', 'Тайвань', 'parts', false),
  ('CST', 'Тайвань', 'parts', false),
  ('Magura', 'Германия', 'parts', false),
  ('Hope', 'Великобритания', 'parts', false),
  ('Hayes', 'США', 'parts', false),
  ('Tektro', 'Тайвань', 'parts', false),
  ('Formula', 'Италия', 'parts', false),
  ('Marzocchi', 'Италия', 'parts', false),
  ('Manitou', 'США', 'parts', false),
  ('SR Suntour', 'Тайвань', 'parts', false),
  ('Bosch eBike Systems', 'Германия', 'parts', false),
  ('Brose', 'Германия', 'parts', false),
  ('Bafang', 'Китай', 'parts', false),
  ('Race Face', 'Канада', 'parts', false),
  ('Renthal', 'Великобритания', 'parts', false),
  ('Thomson', 'США', 'parts', false),
  ('Chris King', 'США', 'parts', false),
  ('Industry Nine', 'США', 'parts', false),
  ('Zipp', 'США', 'parts', false),
  ('ENVE', 'США', 'parts', false),
  ('Reynolds', 'США', 'parts', false),
  ('Fulcrum', 'Италия', 'parts', false),
  ('Easton', 'США', 'parts', false),
  ('Ritchey', 'США', 'parts', false),
  ('Deda Elementi', 'Италия', 'parts', false),
  ('FSA', 'США', 'parts', false),
  ('Truvativ', 'США', 'parts', false),
  ('KMC', 'Тайвань', 'parts', false),
  ('Wahoo', 'США', 'parts', false),
  ('Garmin', 'США', 'parts', false),
  ('Topeak', 'Тайвань', 'parts', false),
  ('Lezyne', 'США', 'parts', false),
  ('Crankbrothers', 'США', 'parts', false),
  ('Fizik', 'Италия', 'parts', false),
  ('Selle Italia', 'Италия', 'parts', false),
  ('Selle Royal', 'Италия', 'parts', false),
  ('Brooks England', 'Великобритания', 'parts', false),
  ('Ergon', 'Германия', 'parts', false),
  ('ODI', 'США', 'parts', false),
  ('Giro', 'США', 'parts', false),
  ('POC', 'Швеция', 'parts', false),
  ('Bell', 'США', 'parts', false),
  ('Kask', 'Италия', 'parts', false),
  ('Abus', 'Германия', 'parts', false),
  ('Kryptonite', 'США', 'parts', false),
  ('Knog', 'Австралия', 'parts', false),
  ('CatEye', 'Япония', 'parts', false),
  ('Sigma Sport', 'Германия', 'parts', false),
  ('Lupine', 'Германия', 'parts', false),
  ('Thule', 'Швеция', 'parts', false),
  ('Ortlieb', 'Германия', 'parts', false),
  ('Elite', 'Италия', 'parts', false),
  ('Tacx', 'Нидерланды', 'parts', false),
  ('Park Tool', 'США', 'parts', false),
  ('Muc-Off', 'Великобритания', 'parts', false),
  ('Finish Line', 'США', 'parts', false),
  ('Rotor', 'Испания', 'parts', false),
  ('Hunt', 'Великобритания', 'parts', false)
on conflict (name) do update set country = excluded.country, kind = excluded.kind, is_popular = excluded.is_popular;

-- Примерные курсы к тенге (используются только для сортировки и фильтра по цене).
-- Обновляйте в admin.html → «Курсы валют».
insert into public.currency_rates (code, rate_to_kzt) values
  ('KZT', 1), ('RUB', 6), ('USD', 520), ('EUR', 600), ('UZS', 0.042),
  ('KGS', 6), ('BYN', 160), ('CNY', 72), ('GBP', 690), ('JPY', 3.5)
on conflict (code) do nothing;

-- ===================== 20261017000005_seed_ads.sql =====================
-- VeloMarket: несколько стартовых рекламных баннеров (можно удалить в admin.html → «Реклама»).
-- Картинки лежат на сайте в assets/ads/. Замените SITE на адрес своего сайта, если он другой.
insert into public.ads (slot, title, image_url, url, position)
select * from (values
  ('home_top',     'Velopark.kz — японский электровелосипед Panasonic',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/velopark-wide.svg',
     'https://avtomaster24bot-lab.github.io/velopark-panasonic/', 1),
  ('home_top',     'Ваша реклама здесь',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/your-ad-wide.svg',
     'https://t.me/GrifRift555', 2),
  ('list_inline',  'Чек-лист покупки б/у велосипеда',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/checklist-inline.svg',
     'https://avtomaster24bot-lab.github.io/bike-checklist/', 1),
  ('listing_side', 'Ваша реклама здесь',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/your-ad-side.svg',
     'https://t.me/GrifRift555', 1)
) as v(slot, title, image_url, url, position)
where not exists (select 1 from public.ads);

-- ===================== 20261017000006_drop_phone_minimize.sql =====================
-- VeloMarket: убираем телефон и лишние персональные данные (минимизация).
-- Храним только: id, tg_id, username, first_name, is_admin, is_banned, created_at, updated_at.
-- Связь с продавцом — только кнопка «Написать в Telegram», поэтому для подачи объявления нужен username.
-- Безопасно запускать повторно.

-- 1. Функция телефона больше не нужна
drop function if exists public.get_seller_phone(bigint);

-- 2. Удаляем колонки с лишними данными
alter table public.profiles drop column if exists phone;
alter table public.profiles drop column if exists photo_url;
alter table public.profiles drop column if exists last_name;

-- 3. Профиль меняет только функция входа (service_role); пользователю нечего редактировать
revoke insert, update, delete on public.profiles from anon, authenticated;

-- 4. Карточка продавца без фото и телефона
drop function if exists public.get_seller(bigint);
create function public.get_seller(p_listing_id bigint)
returns table (username text, first_name text, member_since timestamptz, active_listings bigint)
language sql stable security definer set search_path = public as $$
  select p.username, p.first_name, p.created_at,
         (select count(*) from public.listings x where x.user_id = p.id and x.status = 'approved')
    from public.listings l join public.profiles p on p.id = l.user_id
   where l.id = p_listing_id
     and (l.status in ('approved','sold') or l.user_id = auth.uid() or public.is_admin());
$$;
grant execute on function public.get_seller(bigint) to anon, authenticated;

-- 5. Отправка на модерацию: без username в Telegram — нельзя
create or replace function public.submit_listing(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.listings;
  n_general int; n_brand int; has_serial boolean; cover text;
begin
  select * into l from public.listings where id = p_id;
  if l.id is null or l.user_id is distinct from auth.uid() then
    raise exception 'Объявление не найдено' using errcode = '42501';
  end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован' using errcode = '42501'; end if;
  -- связь с продавцом только через Telegram → нужен username
  if coalesce(btrim((select p.username from public.profiles p where p.id = auth.uid())), '') = '' then
    raise exception 'Укажите username в настройках Telegram, чтобы покупатели могли вам написать. Затем выйдите и войдите на сайт снова.'
      using errcode = 'P0001';
  end if;
  if l.status not in ('draft','rejected','pending','approved') then
    raise exception 'Это объявление нельзя отправить на модерацию (статус %)', l.status;
  end if;
  select count(*) filter (where kind = 'general'), count(*) filter (where kind = 'brand')
    into n_general, n_brand from public.listing_photos where listing_id = p_id;
  select exists(select 1 from public.listing_verification v where v.listing_id = p_id) into has_serial;
  if n_general < 3 then raise exception 'Нужно минимум 3 общих фото (сейчас %)', n_general; end if;
  if n_brand < 1 then raise exception 'Нужно фото логотипа / надписи бренда'; end if;
  if not has_serial then raise exception 'Нужны серийный номер рамы и его фото'; end if;
  select path into cover from public.listing_photos
    where listing_id = p_id and kind = 'general' order by position, id limit 1;

  perform set_config('velomarket.bypass', 'on', true);
  update public.listings
     set status = 'pending', rejection_reason = null, cover_path = cover,
         verified = case when l.status = 'approved' then false else verified end
   where id = p_id;
  perform set_config('velomarket.bypass', 'off', true);
end $$;
revoke all on function public.submit_listing(bigint) from public, anon;
grant execute on function public.submit_listing(bigint) to authenticated;

-- 6. Чистим лишнее из метаданных пользователей Supabase Auth (если кто-то уже входил)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'raw_user_meta_data') then
    begin
      execute $q$update auth.users set raw_user_meta_data = raw_user_meta_data - 'photo_url' - 'last_name' - 'phone'
                where raw_user_meta_data ?| array['photo_url','last_name','phone']$q$;
    exception when others then
      raise notice 'auth.users не изменён (%), это не критично', sqlerrm;
    end;
  end if;
end $$;

-- ===================== 20261018000007_monetization.sql =====================
-- VeloMarket: срок жизни объявлений, платные услуги, заказы, «Магазин», слайд рекламы в галерее, очистка.
-- Безопасно запускать повторно. Оплата — вручную (Kaspi-перевод), услугу включает админ кнопкой в admin.html.

-- ============================================================
-- 1. Новые колонки
-- ============================================================
alter table public.listings add column if not exists expires_at       timestamptz;  -- до какого момента объявление в каталоге
alter table public.listings add column if not exists renewed_at       timestamptz;  -- последнее бесплатное продление
alter table public.listings add column if not exists bumped_at        timestamptz;  -- дата для сортировки («поднятие»)
alter table public.listings add column if not exists featured_until   timestamptz;  -- «Топ»
alter table public.listings add column if not exists highlight_until  timestamptz;  -- «Выделить цветом»
alter table public.listings add column if not exists urgent_until     timestamptz;  -- «Срочно»
alter table public.listings add column if not exists auto_renew_until timestamptz;  -- «Автопродление»
alter table public.listings add column if not exists paid_slot_until  timestamptz;  -- оплаченное место сверх лимита
alter table public.listings add column if not exists shop_until       timestamptz;  -- копия из профиля для значка «Магазин»

alter table public.profiles add column if not exists shop_name  text check (shop_name is null or char_length(shop_name) between 2 and 60);
alter table public.profiles add column if not exists shop_until timestamptz;

-- статус «expired» (срок истёк)
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('draft','pending','approved','rejected','sold','expired'));

-- новый рекламный слот: последний слайд галереи фото
alter table public.ads drop constraint if exists ads_slot_check;
alter table public.ads add constraint ads_slot_check
  check (slot in ('home_top','list_inline','listing_side','gallery_end'));

create index if not exists listings_catalog_idx on public.listings (status, featured desc, bumped_at desc);
create index if not exists listings_expires_idx on public.listings (expires_at) where status = 'approved';

-- ============================================================
-- 2. Настройки и цены (меняет админ в admin.html → «Услуги и цены»)
-- ============================================================
create table if not exists public.app_settings (
  id                  int primary key default 1 check (id = 1),
  listing_days        int not null default 30 check (listing_days between 1 and 365),
  renew_window_days   int not null default 3  check (renew_window_days between 0 and 365),  -- продлить можно за N дней до конца или после
  auto_bump_days      int not null default 3  check (auto_bump_days between 1 and 30),
  cleanup_after_days  int not null default 30 check (cleanup_after_days between 1 and 365),
  free_listing_limit  int check (free_listing_limit is null or free_listing_limit between 1 and 1000),  -- null = без лимита (выключено)
  shop_listing_limit  int check (shop_listing_limit is null or shop_listing_limit between 1 and 10000), -- null = без лимита для магазинов
  last_tick           timestamptz
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.services (
  code          text primary key check (code ~ '^[a-z_]{2,32}$'),
  kind          text not null check (kind in ('listing','account','ad')),
  title         text not null check (char_length(title) between 2 and 60),
  description   text not null default '' check (char_length(description) <= 300),
  price_kzt     int  not null check (price_kzt >= 0),
  duration_days int  not null default 0 check (duration_days between 0 and 365),
  active        boolean not null default true,
  sort          int not null default 0
);
insert into public.services (code, kind, title, description, price_kzt, duration_days, sort) values
  ('top',           'listing', 'Топ',             'Вверху каталога и на главной со значком «Топ»',                   1500,  7, 10),
  ('auto_renew',    'listing', 'Автопродление',   'Не снимается по сроку и само поднимается в начало каждые 3 дня',  2000, 30, 20),
  ('bump',          'listing', 'Поднять',         'Разово поднять объявление в начало списка',                         300,  0, 30),
  ('highlight',     'listing', 'Выделить цветом', 'Карточка выделена цветом в каталоге',                               700,  7, 40),
  ('urgent',        'listing', 'Срочно',          'Значок «Срочно» на карточке и в объявлении',                        500,  7, 50),
  ('extra_listing', 'listing', 'Доп. объявление', 'Место сверх бесплатного лимита (если лимит включён)',              1000, 30, 60),
  ('shop',          'account', 'Магазин',         'Название магазина, значок «Магазин», своя страница со всеми объявлениями, больше объявлений', 5000, 30, 70),
  ('ad_home_top',     'ad', 'Баннер на главной',             '1200×240, вверху главной страницы, ротация',      15000, 30, 80),
  ('ad_list_inline',  'ad', 'Баннер в каталоге',             '1200×240, между объявлениями в списке',           10000, 30, 81),
  ('ad_listing_side', 'ad', 'Баннер на странице объявления', '360×600, сбоку от описания (на телефоне — ниже)',  8000, 30, 82),
  ('ad_gallery_end',  'ad', 'Слайд в галерее фото',          '1200×900 (4:3), последний слайд при листании фото', 10000, 30, 83)
on conflict (code) do nothing;

-- ============================================================
-- 3. Заказы услуг
-- ============================================================
create table if not exists public.service_orders (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  listing_id    bigint references public.listings(id) on delete set null,
  service       text not null references public.services(code),
  price_kzt     int  not null,
  days          int  not null default 0,
  note          text check (note is null or char_length(note) <= 300),
  status        text not null default 'requested' check (status in ('requested','paid','active','cancelled')),
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  activated_at  timestamptz,
  admin_note    text check (admin_note is null or char_length(admin_note) <= 300)
);
create index if not exists service_orders_status_idx on public.service_orders (status, created_at desc);
create index if not exists service_orders_user_idx   on public.service_orders (user_id, created_at desc);

-- ============================================================
-- 4. Защита объявлений (новая версия): платные поля и сроки меняет только админ
-- ============================================================
create or replace function public.listings_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  bypass boolean := coalesce(current_setting('velomarket.bypass', true), '') = 'on';
  admin  boolean := public.is_admin() or current_user in ('postgres','service_role','supabase_admin');
  bname  text;
  ldays  int := coalesce((select s.listing_days from public.app_settings s where s.id = 1), 30);
begin
  select b.name into bname from public.known_brands b where b.id = new.brand_id;
  new.title := btrim(coalesce(bname, new.brand_other, '') || ' ' || coalesce(new.model, ''));
  new.price_kzt := round(new.price * coalesce(
    (select r.rate_to_kzt from public.currency_rates r where r.code = new.currency), 1), 2);
  if new.brand_id is not null then new.brand_other := null; end if;
  if new.category <> 'bike' then new.bike_type := null; end if;

  if tg_op = 'INSERT' then
    if not admin and not bypass then
      new.user_id := auth.uid();
      new.status := 'draft';
      new.verified := false;
      new.featured := false;
      new.views := 0;
      new.rejection_reason := null;
      new.cover_path := null;
      new.published_at := null;
      new.sold_at := null;
      new.created_at := now();
      new.expires_at := null; new.renewed_at := null; new.bumped_at := null;
      new.featured_until := null; new.highlight_until := null; new.urgent_until := null;
      new.auto_renew_until := null; new.paid_slot_until := null;
      new.shop_until := (select p.shop_until from public.profiles p where p.id = auth.uid());
    end if;
    return new;
  end if;

  new.updated_at := now();
  if admin or bypass then
    -- старый переключатель «Топ» (featured) превращаем в срок featured_until
    if new.featured is distinct from old.featured and new.featured_until is not distinct from old.featured_until then
      new.featured_until := case when new.featured then now() + interval '7 days' else null end;
    elsif new.featured and new.featured_until is null then
      new.featured_until := now() + interval '7 days';   -- старые «Топ» без срока → 7 дней
    end if;
    new.featured := coalesce(new.featured_until > now(), false);
    if new.status = 'approved' and old.status is distinct from 'approved' then
      if new.published_at is null then new.published_at := now(); end if;
      new.bumped_at := coalesce(new.bumped_at, new.published_at, now());
      new.expires_at := greatest(coalesce(new.expires_at, now()), now() + make_interval(days => ldays),
                                 coalesce(new.auto_renew_until, now()));
    end if;
    if new.status = 'sold' and old.status is distinct from 'sold' then new.sold_at := now(); end if;
    return new;
  end if;

  -- обычный пользователь (владелец)
  new.user_id := old.user_id;
  new.verified := old.verified;
  new.featured := old.featured;
  new.views := old.views;
  new.rejection_reason := old.rejection_reason;
  new.cover_path := old.cover_path;
  new.published_at := old.published_at;
  new.created_at := old.created_at;
  new.expires_at := old.expires_at; new.renewed_at := old.renewed_at; new.bumped_at := old.bumped_at;
  new.featured_until := old.featured_until; new.highlight_until := old.highlight_until;
  new.urgent_until := old.urgent_until; new.auto_renew_until := old.auto_renew_until;
  new.paid_slot_until := old.paid_slot_until; new.shop_until := old.shop_until;

  if new.status is distinct from old.status then
    if old.status in ('approved','expired') and new.status = 'sold' then
      new.sold_at := now();
    elsif new.status = 'draft' and old.status in ('pending','rejected') then
      null; -- можно отозвать с модерации в черновик
    else
      raise exception 'Недопустимая смена статуса: % → %', old.status, new.status using errcode = '42501';
    end if;
  end if;

  if (new.category, new.brand_id, new.brand_other, new.model, new.year, new.bike_type, new.frame_size,
      new.wheel_size, new.condition, new.price, new.currency, new.country, new.city, new.description)
     is distinct from
     (old.category, old.brand_id, old.brand_other, old.model, old.year, old.bike_type, old.frame_size,
      old.wheel_size, old.condition, old.price, old.currency, old.country, old.city, old.description) then
    if old.status in ('approved','expired') and new.status = old.status then
      new.status := 'pending';      -- изменили одобренное/истёкшее → снова на модерацию
      new.verified := false;
    elsif old.status = 'rejected' and new.status = 'rejected' then
      new.status := 'draft';
    elsif old.status = 'sold' then
      raise exception 'Проданное объявление нельзя редактировать' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists listings_guard on public.listings;
create trigger listings_guard before insert or update on public.listings
  for each row execute function public.listings_guard();

-- ============================================================
-- 5. Подача на модерацию (+ лимит бесплатных объявлений, по умолчанию выключен)
-- ============================================================
create or replace function public.submit_listing(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.listings; st public.app_settings;
  n_general int; n_brand int; has_serial boolean; cover text; lim int; n_active int; is_shop boolean;
begin
  select * into l from public.listings where id = p_id;
  if l.id is null or l.user_id is distinct from auth.uid() then
    raise exception 'Объявление не найдено' using errcode = '42501';
  end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован' using errcode = '42501'; end if;
  if coalesce(btrim((select p.username from public.profiles p where p.id = auth.uid())), '') = '' then
    raise exception 'Укажите username в настройках Telegram, чтобы покупатели могли вам написать. Затем выйдите и войдите на сайт снова.'
      using errcode = 'P0001';
  end if;
  if l.status not in ('draft','rejected','pending','approved','expired') then
    raise exception 'Это объявление нельзя отправить на модерацию (статус %)', l.status;
  end if;
  select count(*) filter (where kind = 'general'), count(*) filter (where kind = 'brand')
    into n_general, n_brand from public.listing_photos where listing_id = p_id;
  select exists(select 1 from public.listing_verification v where v.listing_id = p_id) into has_serial;
  if n_general < 3 then raise exception 'Нужно минимум 3 общих фото (сейчас %)', n_general; end if;
  if n_brand < 1 then raise exception 'Нужно фото логотипа / надписи бренда'; end if;
  if not has_serial then raise exception 'Нужны серийный номер рамы и его фото'; end if;

  -- лимит активных объявлений (если админ включил)
  select * into st from public.app_settings where id = 1;
  if st.free_listing_limit is not null and l.status not in ('approved','pending')
     and not coalesce(l.paid_slot_until > now(), false) then
    select coalesce(p.shop_until > now(), false) into is_shop from public.profiles p where p.id = auth.uid();
    lim := case when is_shop then st.shop_listing_limit else st.free_listing_limit end;
    if lim is not null then
      select count(*) into n_active from public.listings x
       where x.user_id = auth.uid() and x.id <> p_id
         and (x.status = 'pending' or (x.status = 'approved' and coalesce(x.expires_at > now(), true)))
         and not coalesce(x.paid_slot_until > now(), false);
      if n_active >= lim then
        raise exception 'Лимит: % активных объявлений. Снимите старое, подключите «Магазин» или закажите «Доп. объявление» в «Мои объявления».', lim
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  select path into cover from public.listing_photos
    where listing_id = p_id and kind = 'general' order by position, id limit 1;
  perform set_config('velomarket.bypass', 'on', true);
  update public.listings
     set status = 'pending', rejection_reason = null, cover_path = cover,
         verified = case when l.status = 'approved' then false else verified end
   where id = p_id;
  perform set_config('velomarket.bypass', 'off', true);
end $$;

-- ============================================================
-- 6. Бесплатное продление (+30 дней), не чаще чем за renew_window_days до конца срока
-- ============================================================
create or replace function public.renew_listing(p_id bigint)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare l public.listings; st public.app_settings; until timestamptz;
begin
  select * into l from public.listings where id = p_id;
  if l.id is null or l.user_id is distinct from auth.uid() then
    raise exception 'Объявление не найдено' using errcode = '42501';
  end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован' using errcode = '42501'; end if;
  if l.status not in ('approved','expired') then
    raise exception 'Продлить можно только опубликованное объявление';
  end if;
  select * into st from public.app_settings where id = 1;
  if l.expires_at is not null and l.expires_at > now() + make_interval(days => st.renew_window_days) then
    raise exception 'Продлить можно за % дн. до окончания срока (до %)', st.renew_window_days,
      to_char(l.expires_at at time zone 'Asia/Almaty', 'DD.MM.YYYY');
  end if;
  until := now() + make_interval(days => st.listing_days);
  perform set_config('velomarket.bypass', 'on', true);
  update public.listings set status = 'approved', expires_at = until, renewed_at = now() where id = p_id;
  perform set_config('velomarket.bypass', 'off', true);
  return until;
end $$;

-- ============================================================
-- 7. Обслуживание: истечение сроков, автопродление, снятие «Топ».
--    Запускается pg_cron каждые 15 мин (если доступен) И «лениво» при заходе посетителей
--    (не чаще раза в 5 минут) — работает даже без pg_cron.
-- ============================================================
create or replace function public.maintenance_tick(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.app_settings; n_exp int; n_top int; n_bump int;
begin
  -- форсировать (без троттлинга) может только админ, pg_cron или SQL Editor; не гость/пользователь сайта
  if p_force and not public.is_admin() and coalesce(current_setting('role', true), 'none') in ('anon','authenticated') then
    p_force := false;
  end if;
  select * into st from public.app_settings where id = 1 for update skip locked;
  if not found then return jsonb_build_object('skipped', true); end if;
  if not p_force and st.last_tick is not null and st.last_tick > now() - interval '5 minutes' then
    return jsonb_build_object('skipped', true);
  end if;
  update public.app_settings set last_tick = now() where id = 1;
  perform set_config('velomarket.bypass', 'on', true);
  -- автопродление: срок не кончается, каждые N дней — наверх
  update public.listings set expires_at = auto_renew_until
   where status = 'approved' and auto_renew_until > now() and coalesce(expires_at, now()) < auto_renew_until;
  update public.listings set bumped_at = now()
   where status = 'approved' and auto_renew_until > now()
     and coalesce(bumped_at, published_at, created_at) < now() - make_interval(days => st.auto_bump_days);
  get diagnostics n_bump = row_count;
  -- срок истёк
  update public.listings set status = 'expired' where status = 'approved' and expires_at <= now();
  get diagnostics n_exp = row_count;
  -- кончился «Топ»
  update public.listings set featured = false where featured and (featured_until is null or featured_until <= now());
  get diagnostics n_top = row_count;
  -- кончился «Магазин»
  update public.listings set shop_until = null where shop_until is not null and shop_until <= now();
  perform set_config('velomarket.bypass', 'off', true);
  return jsonb_build_object('expired', n_exp, 'top_off', n_top, 'auto_bumped', n_bump);
end $$;

-- ============================================================
-- 8. Заказ услуги пользователем (оплата вручную), включение админом
-- ============================================================
create or replace function public.create_order(p_service text, p_listing_id bigint default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare s public.services; l public.listings; oid bigint; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception 'Войдите через Telegram' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован' using errcode = '42501'; end if;
  select * into s from public.services where code = p_service and active;
  if s.code is null then raise exception 'Услуга недоступна'; end if;
  if s.kind = 'listing' then
    select * into l from public.listings where id = p_listing_id;
    if l.id is null or l.user_id is distinct from auth.uid() then raise exception 'Объявление не найдено' using errcode = '42501'; end if;
    if l.status in ('sold','rejected') then raise exception 'Для этого объявления услуга недоступна (статус %)', l.status; end if;
  else
    p_listing_id := null;
  end if;
  if s.code = 'shop' and (v_note is null or char_length(v_note) not between 2 and 60) then
    raise exception 'Укажите название магазина (2–60 символов)';
  end if;
  if v_note is not null then v_note := left(v_note, 300); end if;
  -- та же заявка уже ждёт оплаты → возвращаем её номер
  select o.id into oid from public.service_orders o
   where o.user_id = auth.uid() and o.service = s.code and o.listing_id is not distinct from p_listing_id
     and o.status = 'requested' and o.created_at > now() - interval '3 days' limit 1;
  if oid is not null then
    update public.service_orders o2 set note = coalesce(v_note, o2.note) where o2.id = oid;
    return oid;
  end if;
  if (select count(*) from public.service_orders o where o.user_id = auth.uid() and o.created_at > now() - interval '1 day') >= 15 then
    raise exception 'Слишком много заявок за сутки — напишите администратору в Telegram';
  end if;
  insert into public.service_orders (user_id, listing_id, service, price_kzt, days, note)
  values (auth.uid(), p_listing_id, s.code, s.price_kzt, s.duration_days, v_note)
  returning id into oid;
  return oid;
end $$;

create or replace function public.admin_activate_order(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.service_orders; d interval; ldays int; until timestamptz;
begin
  if not public.is_admin() then raise exception 'Только для администратора' using errcode = '42501'; end if;
  select * into o from public.service_orders where id = p_id for update;
  if o.id is null then raise exception 'Заказ не найден'; end if;
  if o.status not in ('requested','paid') then raise exception 'Заказ уже %', o.status; end if;
  d := make_interval(days => greatest(o.days, 0));
  ldays := coalesce((select listing_days from public.app_settings where id = 1), 30);
  perform set_config('velomarket.bypass', 'on', true);
  if o.service in ('top','highlight','urgent','auto_renew','bump','extra_listing') then
    if o.listing_id is null then raise exception 'Объявление удалено — услугу применить нельзя'; end if;
    update public.listings set
      featured_until   = case when o.service = 'top'        then greatest(coalesce(featured_until, now()), now()) + d else featured_until end,
      highlight_until  = case when o.service = 'highlight'  then greatest(coalesce(highlight_until, now()), now()) + d else highlight_until end,
      urgent_until     = case when o.service = 'urgent'     then greatest(coalesce(urgent_until, now()), now()) + d else urgent_until end,
      paid_slot_until  = case when o.service = 'extra_listing' then greatest(coalesce(paid_slot_until, now()), now()) + d else paid_slot_until end,
      auto_renew_until = case when o.service = 'auto_renew' then greatest(coalesce(auto_renew_until, now()), now()) + d else auto_renew_until end,
      bumped_at        = case when o.service in ('bump','auto_renew') and status in ('approved','expired') then now() else bumped_at end,
      expires_at       = case
                           when o.service = 'auto_renew' then greatest(coalesce(expires_at, now()), greatest(coalesce(auto_renew_until, now()), now()) + d)
                           when o.service = 'bump' and status = 'expired' then now() + make_interval(days => ldays)
                           else expires_at end,
      status           = case when o.service in ('bump','auto_renew') and status = 'expired' then 'approved' else status end
    where id = o.listing_id;
  elsif o.service = 'shop' then
    update public.profiles set shop_until = greatest(coalesce(shop_until, now()), now()) + d,
                               shop_name = coalesce(nullif(left(btrim(o.note), 60), ''), shop_name)
     where id = o.user_id returning shop_until into until;
    update public.listings set shop_until = until where user_id = o.user_id;
  end if;  -- ad_*: баннер админ добавляет во вкладке «Реклама»
  perform set_config('velomarket.bypass', 'off', true);
  update public.service_orders set status = 'active', paid_at = coalesce(paid_at, now()), activated_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'service', o.service, 'listing_id', o.listing_id);
end $$;

create or replace function public.admin_cancel_order(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора' using errcode = '42501'; end if;
  update public.service_orders set status = 'cancelled' where id = p_id and status in ('requested','paid');
end $$;

-- ============================================================
-- 9. Продавец и «Магазин»
-- ============================================================
drop function if exists public.get_seller(bigint);
create function public.get_seller(p_listing_id bigint)
returns table (username text, first_name text, member_since timestamptz, active_listings bigint, shop_name text, is_shop boolean)
language sql stable security definer set search_path = public as $$
  select p.username, p.first_name, p.created_at,
         (select count(*) from public.listings x where x.user_id = p.id and x.status = 'approved'
             and coalesce(x.expires_at > now(), true)),
         case when p.shop_until > now() then p.shop_name end,
         coalesce(p.shop_until > now(), false)
    from public.listings l join public.profiles p on p.id = l.user_id
   where l.id = p_listing_id
     and (l.status in ('approved','sold') or l.user_id = auth.uid() or public.is_admin());
$$;

create or replace function public.get_shop(p_username text)
returns table (user_id uuid, username text, first_name text, shop_name text, is_shop boolean, member_since timestamptz, active_listings bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.first_name, case when p.shop_until > now() then p.shop_name end,
         coalesce(p.shop_until > now(), false), p.created_at,
         (select count(*) from public.listings x where x.user_id = p.id and x.status = 'approved' and coalesce(x.expires_at > now(), true))
    from public.profiles p
   where lower(p.username) = lower(btrim(p_username)) and not p.is_banned
     and (p.shop_until > now() or exists (select 1 from public.listings x where x.user_id = p.id and x.status = 'approved'))
   limit 1;
$$;

-- ============================================================
-- 10. Очистка старых объявлений и фото (кнопка в admin.html)
--     Файлы удаляет браузер админа через Storage API (storage.remove),
--     затем эта функция удаляет строки. Прямое удаление из storage.objects
--     файлы не стирает, поэтому так не делаем.
-- ============================================================
create or replace function public.admin_cleanup_candidates(p_limit int default 100)
returns table (listing_id bigint, status text, since timestamptz, photo_paths text[], serial_path text)
language plpgsql stable security definer set search_path = public as $$
declare v_days int := coalesce((select a.cleanup_after_days from public.app_settings a where a.id = 1), 30);
begin
  if not public.is_admin() then raise exception 'Только для администратора' using errcode = '42501'; end if;
  return query
  select l.id, l.status, x.since,
         coalesce((select array_agg(ph.path) from public.listing_photos ph where ph.listing_id = l.id), '{}'),
         (select v.serial_photo_path from public.listing_verification v where v.listing_id = l.id)
    from public.listings l
    cross join lateral (select case l.status when 'sold' then coalesce(l.sold_at, l.updated_at)
                                            when 'rejected' then l.updated_at
                                            else l.expires_at end as since) x
   where (l.status in ('sold','rejected','expired') or (l.status = 'approved' and l.expires_at <= now()))
     and not coalesce(l.auto_renew_until > now(), false)
     and x.since < now() - make_interval(days => v_days)
   order by x.since
   limit greatest(1, least(p_limit, 500));
end $$;

create or replace function public.admin_purge_listings(p_ids bigint[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Только для администратора' using errcode = '42501'; end if;
  delete from public.listings l
   where l.id = any(p_ids)
     and l.id in (select c.listing_id from public.admin_cleanup_candidates(500) c);
  get diagnostics n = row_count;
  return n;
end $$;

-- ============================================================
-- 11. RLS и права
-- ============================================================
alter table public.app_settings   enable row level security;
alter table public.services       enable row level security;
alter table public.service_orders enable row level security;

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select using (true);
drop policy if exists settings_admin on public.app_settings;
create policy settings_admin on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.app_settings from anon, authenticated;
revoke update on public.app_settings from anon;

drop policy if exists services_read on public.services;
create policy services_read on public.services for select using (true);
drop policy if exists services_admin on public.services;
create policy services_admin on public.services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.services from anon;

drop policy if exists orders_select on public.service_orders;
create policy orders_select on public.service_orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists orders_admin on public.service_orders;
create policy orders_admin on public.service_orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists orders_admin_delete on public.service_orders;
create policy orders_admin_delete on public.service_orders for delete to authenticated
  using (public.is_admin());
-- создаёт заказ только функция create_order (цена берётся из таблицы services, не от клиента)
revoke insert on public.service_orders from anon, authenticated;
revoke all on public.service_orders from anon;

-- истёкшие объявления не видны в каталоге и по ссылке (владелец и админ видят)
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select
  using (status = 'sold'
         or (status = 'approved' and (expires_at is null or expires_at > now()))
         or user_id = auth.uid() or public.is_admin());

create or replace function public.increment_view(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('velomarket.bypass', 'on', true);
  update public.listings set views = views + 1
   where id = p_id and (status = 'sold' or (status = 'approved' and coalesce(expires_at > now(), true)));
  perform set_config('velomarket.bypass', 'off', true);
end $$;

revoke all on function public.submit_listing(bigint) from public, anon;
grant execute on function public.submit_listing(bigint) to authenticated;
revoke all on function public.renew_listing(bigint) from public, anon;
grant execute on function public.renew_listing(bigint) to authenticated;
revoke all on function public.create_order(text, bigint, text) from public, anon;
grant execute on function public.create_order(text, bigint, text) to authenticated;
revoke all on function public.admin_activate_order(bigint) from public, anon;
grant execute on function public.admin_activate_order(bigint) to authenticated;
revoke all on function public.admin_cancel_order(bigint) from public, anon;
grant execute on function public.admin_cancel_order(bigint) to authenticated;
revoke all on function public.admin_cleanup_candidates(int) from public, anon;
grant execute on function public.admin_cleanup_candidates(int) to authenticated;
revoke all on function public.admin_purge_listings(bigint[]) from public, anon;
grant execute on function public.admin_purge_listings(bigint[]) to authenticated;
grant execute on function public.maintenance_tick(boolean) to anon, authenticated;
grant execute on function public.get_seller(bigint) to anon, authenticated;
grant execute on function public.get_shop(text) to anon, authenticated;
grant execute on function public.increment_view(bigint) to anon, authenticated;

-- ============================================================
-- 12. Перенос существующих объявлений: срок 30 дней с сегодняшнего дня, дата поднятия, «Топ» на 7 дней
-- ============================================================
update public.listings set featured_until = now() + interval '7 days' where featured and featured_until is null;
update public.listings set bumped_at = coalesce(published_at, created_at) where bumped_at is null;
update public.listings set expires_at = now() + interval '30 days'
 where expires_at is null and status in ('approved','pending');

-- ============================================================
-- 13. Рекламный слайд в галерее (стартовые баннеры)
-- ============================================================
insert into public.ads (slot, title, image_url, url, position)
select * from (values
  ('gallery_end', 'Velopark.kz — японские электровелосипеды Panasonic',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/velopark-gallery.svg',
     'https://avtomaster24bot-lab.github.io/velopark-panasonic/', 1),
  ('gallery_end', 'Здесь может быть ваша реклама',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/your-ad-gallery.svg',
     'https://t.me/GrifRift555', 2)
) as v(slot, title, image_url, url, position)
where not exists (select 1 from public.ads a where a.slot = 'gallery_end');

-- ============================================================
-- 14. pg_cron (есть и на бесплатном плане). Если включить не получилось —
--     ничего страшного: сроки всё равно скрываются сразу (RLS), а статусы
--     обновляются при заходах посетителей.
-- ============================================================
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron не включён (%). Сайт работает и без него.', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('velomarket-maintenance', '*/15 * * * *', 'select public.maintenance_tick(true)');
    exception when others then
      raise notice 'Не удалось создать задачу pg_cron (%).', sqlerrm;
    end;
  end if;
end $$;

select public.maintenance_tick(true);

-- ===================== 20261027000008_edit_listings.sql =====================
-- VeloMarket 08: правка объявлений админом и продавцом.
-- Безопасно запускать повторно (Supabase → SQL Editor → вставить → Run). Нужна применённая миграция 07.
--
-- • Админ (profiles.is_admin) может менять цену, модель, описание и другие поля любого объявления —
--   статус при этом НЕ меняется.
-- • Продавец может менять свои объявления. Если он изменил содержимое одобренного (или истёкшего)
--   объявления — оно снова уходит на модерацию (status = 'pending', «Проверено» снимается) и скрыто
--   из каталога до повторного одобрения. Отклонённое после правки становится черновиком
--   (его нужно отправить на модерацию заново — с проверкой фото и серийника).
-- • Продавец не может сам себе поставить «Опубликовано», «Проверено», «Топ», сроки и платные услуги,
--   сменить владельца или просмотры (это было и раньше, здесь сохранено).
-- • Новое: prev_values — как было до правки продавцом (модератор видит, что изменилось),
--   owner_edited_at — когда продавец правил. Очищаются при одобрении / отклонении.
-- • Заблокированный пользователь не может править объявления.

alter table public.listings add column if not exists prev_values     jsonb;
alter table public.listings add column if not exists owner_edited_at timestamptz;

create or replace function public.listings_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  bypass boolean := coalesce(current_setting('velomarket.bypass', true), '') = 'on';
  admin  boolean := public.is_admin() or current_user in ('postgres','service_role','supabase_admin');
  bname  text;
  ldays  int := coalesce((select s.listing_days from public.app_settings s where s.id = 1), 30);
  changed boolean;
begin
  select b.name into bname from public.known_brands b where b.id = new.brand_id;
  new.title := btrim(coalesce(bname, new.brand_other, '') || ' ' || coalesce(new.model, ''));
  new.price_kzt := round(new.price * coalesce(
    (select r.rate_to_kzt from public.currency_rates r where r.code = new.currency), 1), 2);
  if new.brand_id is not null then new.brand_other := null; end if;
  if new.category <> 'bike' then new.bike_type := null; end if;

  if tg_op = 'INSERT' then
    if not admin and not bypass then
      new.user_id := auth.uid();
      new.status := 'draft';
      new.verified := false;
      new.featured := false;
      new.views := 0;
      new.rejection_reason := null;
      new.cover_path := null;
      new.published_at := null;
      new.sold_at := null;
      new.created_at := now();
      new.expires_at := null; new.renewed_at := null; new.bumped_at := null;
      new.featured_until := null; new.highlight_until := null; new.urgent_until := null;
      new.auto_renew_until := null; new.paid_slot_until := null;
      new.shop_until := (select p.shop_until from public.profiles p where p.id = auth.uid());
      new.prev_values := null; new.owner_edited_at := null;
    end if;
    return new;
  end if;

  new.updated_at := now();
  if admin or bypass then
    -- старый переключатель «Топ» (featured) превращаем в срок featured_until
    if new.featured is distinct from old.featured and new.featured_until is not distinct from old.featured_until then
      new.featured_until := case when new.featured then now() + interval '7 days' else null end;
    elsif new.featured and new.featured_until is null then
      new.featured_until := now() + interval '7 days';   -- старые «Топ» без срока → 7 дней
    end if;
    new.featured := coalesce(new.featured_until > now(), false);
    if new.status = 'approved' and old.status is distinct from 'approved' then
      if new.published_at is null then new.published_at := now(); end if;
      new.bumped_at := coalesce(new.bumped_at, new.published_at, now());
      new.expires_at := greatest(coalesce(new.expires_at, now()), now() + make_interval(days => ldays),
                                 coalesce(new.auto_renew_until, now()));
    end if;
    if new.status = 'sold' and old.status is distinct from 'sold' then new.sold_at := now(); end if;
    -- одобрили / отклонили → «что изменил продавец» больше не нужно
    if new.status in ('approved','rejected') and old.status is distinct from new.status then
      new.prev_values := null; new.owner_edited_at := null;
    end if;
    return new;
  end if;

  -- обычный пользователь (владелец)
  new.user_id := old.user_id;
  new.verified := old.verified;
  new.featured := old.featured;
  new.views := old.views;
  new.rejection_reason := old.rejection_reason;
  new.cover_path := old.cover_path;
  new.published_at := old.published_at;
  new.created_at := old.created_at;
  new.expires_at := old.expires_at; new.renewed_at := old.renewed_at; new.bumped_at := old.bumped_at;
  new.featured_until := old.featured_until; new.highlight_until := old.highlight_until;
  new.urgent_until := old.urgent_until; new.auto_renew_until := old.auto_renew_until;
  new.paid_slot_until := old.paid_slot_until; new.shop_until := old.shop_until;
  new.prev_values := old.prev_values; new.owner_edited_at := old.owner_edited_at;

  if new.status is distinct from old.status then
    if old.status in ('approved','expired') and new.status = 'sold' then
      new.sold_at := now();
    elsif new.status = 'draft' and old.status in ('pending','rejected') then
      null; -- можно отозвать с модерации в черновик
    else
      raise exception 'Недопустимая смена статуса: % → %', old.status, new.status using errcode = '42501';
    end if;
  end if;

  changed := (new.category, new.brand_id, new.brand_other, new.model, new.year, new.bike_type, new.frame_size,
      new.wheel_size, new.condition, new.price, new.currency, new.country, new.city, new.description)
     is distinct from
     (old.category, old.brand_id, old.brand_other, old.model, old.year, old.bike_type, old.frame_size,
      old.wheel_size, old.condition, old.price, old.currency, old.country, old.city, old.description);
  if changed then
    if public.is_banned() then
      raise exception 'Аккаунт заблокирован' using errcode = '42501';
    end if;
    if old.status <> 'sold' then
      new.owner_edited_at := now();
      -- запоминаем, как было до первой правки после одобрения (модератор видит, что изменилось)
      if old.status in ('approved','expired','pending') and old.prev_values is null and old.published_at is not null then
        new.prev_values := jsonb_build_object(
          'title', old.title, 'model', old.model, 'brand_id', old.brand_id, 'brand_other', old.brand_other,
          'category', old.category, 'condition', old.condition, 'year', old.year, 'bike_type', old.bike_type,
          'frame_size', old.frame_size, 'wheel_size', old.wheel_size, 'price', old.price, 'currency', old.currency,
          'country', old.country, 'city', old.city, 'description', old.description);
      end if;
    end if;
    if old.status in ('approved','expired') and new.status = old.status then
      new.status := 'pending';      -- изменили одобренное/истёкшее → снова на модерацию
      new.verified := false;
    elsif old.status = 'rejected' and new.status = 'rejected' then
      new.status := 'draft';
    elsif old.status = 'sold' then
      raise exception 'Проданное объявление нельзя редактировать' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists listings_guard on public.listings;
create trigger listings_guard before insert or update on public.listings
  for each row execute function public.listings_guard();

-- Права на изменение: владелец (не заблокированный) — свои, админ — любые.
-- Какие именно поля и статусы можно менять, решает триггер listings_guard выше.
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated
  using ((user_id = auth.uid() and not public.is_banned()) or public.is_admin())
  with check ((user_id = auth.uid() and not public.is_banned()) or public.is_admin());
revoke update on public.listings from anon;
grant update on public.listings to authenticated;
