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
  last_name   text,
  photo_url   text,
  phone       text check (phone is null or phone ~ '^\+?[0-9 ()\-]{6,20}$'),
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

-- Публичная карточка продавца (без телефона)
create or replace function public.get_seller(p_listing_id bigint)
returns table (username text, first_name text, photo_url text, member_since timestamptz, active_listings bigint)
language sql stable security definer set search_path = public as $$
  select p.username, p.first_name, p.photo_url, p.created_at,
         (select count(*) from public.listings x where x.user_id = p.id and x.status = 'approved')
    from public.listings l join public.profiles p on p.id = l.user_id
   where l.id = p_listing_id
     and (l.status in ('approved','sold') or l.user_id = auth.uid() or public.is_admin());
$$;

-- Телефон продавца — по кнопке «Показать телефон»
create or replace function public.get_seller_phone(p_listing_id bigint)
returns text language sql stable security definer set search_path = public as $$
  select p.phone
    from public.listings l join public.profiles p on p.id = l.user_id
   where l.id = p_listing_id and l.status = 'approved';
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
