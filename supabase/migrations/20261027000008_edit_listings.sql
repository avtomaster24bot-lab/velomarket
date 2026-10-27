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
