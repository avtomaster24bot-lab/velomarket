-- Локальный тест схемы и RLS. Запуск: tests/run_db_tests.sh
\set ON_ERROR_STOP on
\set A '\'aaaaaaaa-0000-0000-0000-00000000000a\''
\set B '\'bbbbbbbb-0000-0000-0000-00000000000b\''
\set M '\'99999999-0000-0000-0000-000000000099\''

-- helper для проверок
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FAIL: %', msg; end if; raise notice 'ok: %', msg; end $$;
grant execute on function pg_temp.check(boolean,text) to public;

insert into auth.users (id, email) values (:A,'tg1@telegram.local'),(:B,'tg2@telegram.local'),(:M,'tg3@telegram.local');
insert into public.profiles (id, tg_id, username, first_name, is_admin) values
  (:A, 1001, 'seller_a', 'Алмас', false), (:B, 1002, 'buyer_b', 'Бек', false), (:M, 1003, 'GrifRift555', 'Админ', true);

-- ===== A: создаёт объявление, пытаясь сразу «одобрить» себя =====
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
insert into public.listings (category, brand_id, model, year, bike_type, condition, price, currency, country, city, description, status, verified, featured, views)
values ('bike', (select id from known_brands where name='Panasonic'), 'BE-EPE63', 2019, 'электро', 'used', 1000, 'USD', 'Казахстан', 'Алматы', 'Тест', 'approved', true, true, 999);
select pg_temp.check((select status='draft' and not verified and not featured and views=0 and user_id=:A from listings), 'insert: статус принудительно draft, флаги сброшены');
select pg_temp.check((select title from listings)='Panasonic BE-EPE63', 'title собран из бренда и модели');
select pg_temp.check((select price_kzt from listings)=520000, 'price_kzt пересчитан из USD');
do $$ begin perform public.submit_listing((select id from listings limit 1)); raise exception 'FAIL: submit без фото прошёл';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: submit без фото отклонён (%)', sqlerrm; end $$;

insert into public.listing_photos (listing_id, path, kind, position)
select l.id, :A || '/' || l.id || '/p' || g || '.webp', case when g=4 then 'brand' else 'general' end, g
from listings l, generate_series(1,4) g;
do $$ begin
  insert into public.listing_photos (listing_id, path, kind) select id, 'bbbbbbbb-0000-0000-0000-00000000000b/'||id||'/x.webp','general' from listings;
  raise exception 'FAIL: фото с чужим путём вставилось';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: фото с чужим путём запрещено'; end $$;
insert into public.listing_verification (listing_id, serial_number, serial_photo_path)
select id, 'WBK123456', :A || '/' || id || '/serial.webp' from listings;
reset role; update public.profiles set username = null where id = :A;
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
do $$ begin perform public.submit_listing((select id from listings limit 1)); raise exception 'FAIL: подача без username прошла';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: без username в Telegram подать нельзя (%)', left(sqlerrm, 60); end $$;
reset role; update public.profiles set username = 'seller_a' where id = :A;
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select public.submit_listing((select id from listings));
select pg_temp.check((select status='pending' and cover_path like '%/p1.webp' from listings), 'submit → pending, обложка = первое общее фото');
do $$ begin update public.listings set status='approved'; raise exception 'FAIL: владелец сам одобрил';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: владелец не может одобрить сам (%)', sqlerrm; end $$;
update public.listings set verified = true, featured = true, views = 5000;
select pg_temp.check((select not verified and not featured and views=0 from listings), 'владелец не может поставить verified/featured/views');
insert into storage.objects (bucket_id, name) values ('verification', :A || '/1/serial.webp'), ('listing-photos', :A || '/1/p1.webp');
do $$ begin insert into storage.objects (bucket_id, name) values ('listing-photos', 'bbbbbbbb-0000-0000-0000-00000000000b/1/hack.webp');
  raise exception 'FAIL: загрузка в чужую папку';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: storage — нельзя писать в чужую папку'; end $$;
do $$ begin update public.profiles set is_admin = true; raise exception 'FAIL: сделал себя админом';
exception when insufficient_privilege then raise notice 'ok: нельзя сделать себя админом'; end $$;
do $$ begin update public.profiles set first_name = 'X'; raise exception 'FAIL: профиль меняется пользователем';
exception when insufficient_privilege then raise notice 'ok: пользователь не может менять профиль (только функция входа)'; end $$;

-- ===== B: чужой пользователь =====
select set_config('request.jwt.claim.sub', :B, false);
select pg_temp.check((select count(*) from listings)=0, 'B не видит чужое объявление на модерации');
select pg_temp.check((select count(*) from listing_verification)=0, 'B не видит серийник');
select pg_temp.check((select count(*) from profiles)=1, 'B видит только свой профиль');
update public.listings set price = 1;
select pg_temp.check((select count(*) from storage.objects where bucket_id='verification')=0, 'B не видит фото серийника в storage');
do $$ begin insert into public.ads (slot, image_url, url) values ('home_top','x','https://x'); raise exception 'FAIL: B создал рекламу';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: не-админ не может создать рекламу'; end $$;
do $$ begin perform public.rate_limit_hit('x', 1, 60); raise exception 'FAIL: rate_limit_hit доступна пользователю';
exception when insufficient_privilege then raise notice 'ok: rate_limit_hit недоступна authenticated'; end $$;

-- ===== M: модератор =====
select set_config('request.jwt.claim.sub', :M, false);
select pg_temp.check((select count(*) from listing_verification)=1, 'админ видит серийник');
select pg_temp.check((select count(*) from storage.objects where bucket_id='verification')=1, 'админ видит фото серийника');
update public.listings set status='approved', verified=true, featured=true;
select pg_temp.check((select status='approved' and verified and featured and published_at is not null from listings), 'админ одобрил + Проверено + Продвижение');
insert into public.ads (slot, title, image_url, url, active) values ('home_top','off','x.svg','https://x', false);

-- ===== anon: гость =====
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select count(*) from listings)=1, 'гость видит одобренное');
select pg_temp.check((select count(*) from listing_photos)=4, 'гость видит фото одобренного');
select pg_temp.check((select count(*) from ads where title='off')=0, 'гость не видит неактивную рекламу');
select pg_temp.check((select username from public.get_seller((select id from listings)))='seller_a', 'get_seller работает');
select pg_temp.check(not exists (select 1 from pg_proc where proname = 'get_seller_phone'), 'функции телефона нет');
select pg_temp.check(not exists (select 1 from information_schema.columns where table_name='profiles' and column_name in ('phone','photo_url','last_name')), 'в profiles нет phone/photo_url/last_name');
select public.increment_view((select id from listings));
select pg_temp.check((select views from listings)=1, 'просмотры +1');
do $$ begin perform count(*) from public.listing_verification; raise exception 'FAIL: гость читает серийники';
exception when insufficient_privilege then raise notice 'ok: гость не имеет доступа к listing_verification'; end $$;
do $$ begin insert into public.listings (category, brand_other, model, condition, price, country, city) values ('bike','X','Y','new',1,'KZ','A');
  raise exception 'FAIL: гость создал объявление';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: гость не может создать объявление'; end $$;

-- ===== A: правка одобренного → повторная модерация; продажа =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
update public.listings set description = 'Изменил описание';
select pg_temp.check((select status='pending' and not verified from listings), 'правка одобренного → снова pending, verified снят');
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :M, false);
update public.listings set status='approved';
select set_config('request.jwt.claim.sub', :A, false);
update public.listings set status='sold';
select pg_temp.check((select status='sold' and sold_at is not null from listings), 'владелец отметил «Продано»');

-- ===== B: избранное и жалоба =====
select set_config('request.jwt.claim.sub', :B, false);
insert into public.favorites (listing_id) select id from listings;
insert into public.reports (listing_id, reason, comment) select id, 'replica', 'Похоже на реплику' from listings;
select set_config('request.jwt.claim.sub', :A, false);
select pg_temp.check((select count(*) from favorites)=0, 'A не видит чужое избранное');
select pg_temp.check((select count(*) from reports)=0, 'A не видит чужие жалобы');
select set_config('request.jwt.claim.sub', :M, false);
select pg_temp.check((select count(*) from reports)=1, 'админ видит жалобы');

-- ===== service_role: rate limit =====
reset role; set role service_role;
select pg_temp.check(public.rate_limit_hit('ip:1', 2, 60) and public.rate_limit_hit('ip:1', 2, 60) and not public.rate_limit_hit('ip:1', 2, 60), 'rate_limit_hit: 3-й запрос сверх лимита 2 отклонён');
reset role;
select pg_temp.check((select count(*) from known_brands) > 150, 'справочник брендов загружен');
update public.currency_rates set rate_to_kzt = 500 where code = 'USD';
select pg_temp.check((select price_kzt from listings)=500000, 'смена курса USD пересчитала price_kzt');

-- ===================== Монетизация, сроки, очистка (миграция 07) =====================
reset role;
select pg_temp.check((select count(*) from services where kind='listing') >= 5, 'услуги и цены загружены');
select pg_temp.check((select free_listing_limit is null from app_settings), 'лимит бесплатных объявлений по умолчанию выключен');
select pg_temp.check((select count(*) from ads where slot='gallery_end') = 2, 'реклама gallery_end засеяна');
-- два опубликованных объявления A (как будто одобрены): L1 старше, L2 новее
insert into listings (user_id, category, brand_id, model, condition, price, country, city, status, published_at, bumped_at, expires_at)
values (:A,'bike',(select id from known_brands where name='Trek'),'L1','used',100,'Казахстан','Алматы','approved', now()-interval '5 days', now()-interval '5 days', now()+interval '25 days'),
       (:A,'bike',(select id from known_brands where name='Trek'),'L2','used',200,'Казахстан','Алматы','approved', now()-interval '1 day', now()-interval '1 day', now()+interval '29 days');
create temp table ids as select (select id from listings where model='L1') l1, (select id from listings where model='L2') l2;
grant select on ids to public;

set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
update listings set featured_until = now()+interval '1 year', highlight_until = now()+interval '1 year', urgent_until = now()+interval '1 year',
  auto_renew_until = now()+interval '1 year', expires_at = now()+interval '5 years', bumped_at = now()+interval '1 day', paid_slot_until = now()+interval '1 year', featured = true
 where model in ('L1','L2');
select pg_temp.check((select bool_and(featured_until is null and highlight_until is null and urgent_until is null and auto_renew_until is null
  and paid_slot_until is null and not featured and expires_at < now()+interval '31 days' and bumped_at < now()) from listings where model in ('L1','L2')),
  'владелец НЕ может сам включить Топ/цвет/Срочно/автопродление/срок/поднятие');
do $$ begin insert into service_orders (user_id, listing_id, service, price_kzt) values (auth.uid(), (select l1 from ids), 'top', 0);
  raise exception 'FAIL: заказ вставлен напрямую с ценой 0';
exception when insufficient_privilege then raise notice 'ok: заказ напрямую (со своей ценой) создать нельзя'; end $$;
select public.create_order('top', (select l1 from ids));
select pg_temp.check((select price_kzt=1500 and status='requested' and days=7 from service_orders where service='top'), 'create_order: цена и срок берутся из services');
select pg_temp.check(public.create_order('top', (select l1 from ids)) = (select id from service_orders where service='top'), 'повторный заказ той же услуги → тот же номер');
do $$ begin perform public.admin_activate_order((select id from service_orders limit 1)); raise exception 'FAIL: владелец включил услугу';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: владелец не может включить услугу (%)', sqlerrm; end $$;
do $$ begin update service_orders set status='active'; if exists (select 1 from service_orders where status='active') then raise exception 'FAIL: владелец сменил статус заказа'; end if;
  raise notice 'ok: владелец не может сменить статус заказа'; end $$;
select set_config('request.jwt.claim.sub', :B, false);
select pg_temp.check((select count(*) from service_orders)=0, 'чужие заказы не видны');
do $$ begin perform public.create_order('top', (select l1 from ids)); raise exception 'FAIL: B заказал услугу на чужое объявление';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: услугу на чужое объявление заказать нельзя'; end $$;

-- админ: «Оплачено, включить»
select set_config('request.jwt.claim.sub', :M, false);
select public.admin_activate_order((select id from service_orders where service='top'));
select pg_temp.check((select featured and featured_until > now()+interval '6 days' from listings where id=(select l1 from ids)), 'админ включил Топ на 7 дней');
select pg_temp.check((select status='active' and activated_at is not null from service_orders where service='top'), 'заказ → active');
-- сортировка каталога: Топ первым, затем по bumped_at
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select array_agg(model order by featured desc, bumped_at desc nulls last, id desc) from listings where status='approved') = array['L1','L2'], 'сортировка: Топ (L1) выше свежего L2');
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select public.create_order('bump', (select l2 from ids));
select public.create_order('highlight', (select l2 from ids));
select set_config('request.jwt.claim.sub', :M, false);
select public.admin_activate_order((select id from service_orders where service='bump'));
select public.admin_activate_order((select id from service_orders where service='highlight'));
select pg_temp.check((select bumped_at > now()-interval '1 minute' and highlight_until > now() from listings where id=(select l2 from ids)), 'Поднять + Выделить включены');
-- Топ истёк → tick снимает
reset role; update listings set featured_until = now()-interval '1 minute' where id=(select l1 from ids);
select public.maintenance_tick(true);
select pg_temp.check((select not featured from listings where id=(select l1 from ids)), 'tick: истёкший Топ снят');
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select array_agg(model order by featured desc, bumped_at desc nulls last, id desc) from listings where status='approved') = array['L2','L1'], 'сортировка: поднятое L2 теперь выше');

-- срок истёк: скрыто сразу (RLS), потом tick → expired
reset role; update listings set expires_at = now()-interval '1 hour' where id=(select l2 from ids);
set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select count(*) from listings where model='L2')=0, 'истёкшее скрыто от гостей сразу (ещё до tick)');
reset role; select public.maintenance_tick(true);
reset role; select pg_temp.check((select status='expired' from listings where id=(select l2 from ids)), 'tick: approved → expired');
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select pg_temp.check((select count(*) from listings where model='L2')=1, 'владелец видит своё истёкшее');
do $$ begin perform public.renew_listing((select l1 from ids)); raise exception 'FAIL: продлили слишком рано';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: продлить рано нельзя (%)', sqlerrm; end $$;
select public.renew_listing((select l2 from ids));
select pg_temp.check((select status='approved' and expires_at > now()+interval '29 days' and renewed_at is not null from listings where id=(select l2 from ids)), 'бесплатное продление +30 дней');
select set_config('request.jwt.claim.sub', :B, false);
do $$ begin perform public.renew_listing((select l2 from ids)); raise exception 'FAIL: B продлил чужое';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: чужое продлить нельзя'; end $$;

-- автопродление: не истекает и поднимается
select set_config('request.jwt.claim.sub', :A, false);
select public.create_order('auto_renew', (select l1 from ids));
select set_config('request.jwt.claim.sub', :M, false);
select public.admin_activate_order((select id from service_orders where service='auto_renew'));
reset role;
update listings set bumped_at = now()-interval '10 days', expires_at = now()+interval '1 day' where id=(select l1 from ids);
select public.maintenance_tick(true);
select pg_temp.check((select status='approved' and expires_at > now()+interval '29 days' and bumped_at > now()-interval '1 minute' from listings where id=(select l1 from ids)), 'автопродление: срок продлён и объявление поднято');

-- Магазин
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
do $$ begin perform public.create_order('shop', null, ''); raise exception 'FAIL: магазин без названия';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: магазин без названия не заказать'; end $$;
select public.create_order('shop', null, 'Velo Shop A');
select set_config('request.jwt.claim.sub', :M, false);
select public.admin_activate_order((select id from service_orders where service='shop'));
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select is_shop and shop_name='Velo Shop A' and active_listings=2 from public.get_shop('SELLER_A')), 'get_shop: магазин с названием и объявлениями');
select pg_temp.check((select bool_and(shop_until > now()) from listings where model in ('L1','L2')), 'значок «Магазин» на объявлениях');
select pg_temp.check((select is_shop from public.get_seller((select l1 from ids))), 'get_seller отдаёт is_shop');
select pg_temp.check(not exists (select 1 from public.get_shop('buyer_b')), 'get_shop не раскрывает покупателей без объявлений');

-- лимит бесплатных объявлений (включаем = 1)
reset role; update app_settings set free_listing_limit = 1, shop_listing_limit = null;
update profiles set shop_until = null where id = :A;
insert into listings (user_id, category, brand_id, model, condition, price, country, city, status)
values (:A,'bike',(select id from known_brands where name='Trek'),'L3','used',300,'Казахстан','Алматы','draft');
insert into listing_photos (listing_id, path, kind, position) select l.id, :A||'/'||l.id||'/g'||g||'.webp', case when g=4 then 'brand' else 'general' end, g from listings l, generate_series(1,4) g where l.model='L3';
insert into listing_verification (listing_id, serial_number, serial_photo_path) select id, 'SN-L3', :A||'/'||id||'/s.webp' from listings where model='L3';
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
do $$ begin perform public.submit_listing((select id from listings where model='L3')); raise exception 'FAIL: лимит не сработал';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: лимит бесплатных объявлений (%)', left(sqlerrm, 50); end $$;
select public.create_order('extra_listing', (select id from listings where model='L3'));
select set_config('request.jwt.claim.sub', :M, false);
select public.admin_activate_order((select id from service_orders where service='extra_listing'));
select set_config('request.jwt.claim.sub', :A, false);
select public.submit_listing((select id from listings where model='L3'));
select pg_temp.check((select status='pending' from listings where model='L3'), 'с «Доп. объявлением» подача проходит');
reset role; update app_settings set free_listing_limit = null;

-- tick от гостя не чаще раза в 5 минут
set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((public.maintenance_tick(true) ->> 'skipped')::boolean, 'гость не может форсировать tick (троттлинг)');

-- очистка: проданное 40 дней назад
reset role; update listings set sold_at = now()-interval '40 days' where status='sold';
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
do $$ begin perform * from public.admin_cleanup_candidates(); raise exception 'FAIL: не-админ видит кандидатов';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: очистка только для админа'; end $$;
select set_config('request.jwt.claim.sub', :M, false);
select pg_temp.check((select count(*) = 1 and bool_and(array_length(photo_paths,1) = 4 and serial_path is not null) from public.admin_cleanup_candidates()), 'кандидаты на очистку: проданное >30 дней, с путями фото и серийника');
select pg_temp.check(public.admin_purge_listings(array[(select l1 from ids), (select listing_id from public.admin_cleanup_candidates() limit 1)]) = 1, 'purge удаляет только кандидатов (L1 не тронут)');
select pg_temp.check((select count(*) from listings where model='L1')=1, 'L1 (не кандидат) не удалён');
reset role;
\echo ALL DB TESTS PASSED
