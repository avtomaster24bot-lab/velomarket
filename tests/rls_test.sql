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
update public.profiles set phone = '+7 701 123 45 67';
select pg_temp.check((select phone from profiles where id=:A) is not null, 'свой телефон менять можно');

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
select pg_temp.check(public.get_seller_phone((select id from listings)) is not null, 'телефон по кнопке');
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
\echo ALL DB TESTS PASSED
