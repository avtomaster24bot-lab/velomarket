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
