// Проверка реальных запросов сайта (те же select/filter/rpc, что в site/js/api.js)
// против локального PostgREST + PostgreSQL с миграциями. Запуск: deno run -A tests/api_queries_test.mjs (см. README → «Тесты»).
import { createClient } from 'npm:@supabase/supabase-js@2';
import jwt from 'npm:jsonwebtoken@9';
import assert from 'node:assert/strict';

const SECRET = 'test-secret-test-secret-test-secret-123456';
const PGRST = process.env.PGRST || 'http://127.0.0.1:3011';
const A = 'aaaaaaaa-0000-0000-0000-00000000000a', B = 'bbbbbbbb-0000-0000-0000-00000000000b', M = '99999999-0000-0000-0000-000000000099';
const tok = (sub) => jwt.sign(sub ? { sub, role: 'authenticated' } : { role: 'anon' }, SECRET);
const fetchRewrite = (url, init) => fetch(String(url).replace('http://fake.supabase/rest/v1', PGRST), init);
const as = (sub) => createClient('http://fake.supabase', 'anon', { accessToken: async () => tok(sub), global: { fetch: fetchRewrite } });
const CARD_FIELDS = 'id,title,category,brand_id,brand_other,model,year,bike_type,wheel_size,condition,price,currency,price_kzt,country,city,cover_path,verified,featured,status,views,created_at,published_at,known_brands(name,country)'
  + ',user_id,expires_at,bumped_at,featured_until,highlight_until,urgent_until,auto_renew_until,shop_until';
const ok = (m) => console.log('  ok:', m);
const must = ({ data, error }) => { if (error) throw new Error(JSON.stringify(error)); return data; };

const a = as(A), b = as(B), m = as(M), anon = as(null);
const { data: br } = await anon.from('known_brands').select('id,name,country,kind,is_popular').order('name');
const trek = br.find((x) => x.name === 'Trek').id;
ok(`справочник брендов через API: ${br.length}`);

// создание (как createListing)
const id = must(await a.from('listings').insert({ category: 'bike', brand_id: trek, model: 'Marlin 7', year: 2022, bike_type: 'горный',
  condition: 'used', price: 800, currency: 'USD', country: 'Казахстан', city: 'Алматы', description: 'Отличный', user_id: A, status: 'approved' }).select('id').single()).id;
ok(`объявление создано id=${id}`);
const other = must(await a.from('listings').insert({ category: 'part', brand_other: 'NoName Pro', model: 'Вилка', condition: 'new', price: 10000,
  currency: 'KZT', country: 'Казахстан', city: 'Астана', user_id: A }).select('id, needs_close_review').single());
assert.equal(other.needs_close_review, true); ok('«другой бренд» → needs_close_review');

for (let i = 0; i < 3; i++) must(await a.from('listing_photos').insert({ listing_id: id, path: `${A}/${id}/general-${i}.webp`, kind: 'general', position: i }));
must(await a.from('listing_photos').insert({ listing_id: id, path: `${A}/${id}/brand-1.webp`, kind: 'brand', position: 100 }));
must(await a.from('listing_verification').upsert({ listing_id: id, serial_number: 'WTU123', serial_photo_path: `${A}/${id}/serial-1.webp` }, { onConflict: 'listing_id' }));
must(await a.rpc('submit_listing', { p_id: id }));
const subErr = (await a.rpc('submit_listing', { p_id: other.id })).error;
assert.match(subErr.message, /минимум 3/); ok('submit_listing: без фото — понятная ошибка «' + subErr.message + '»');

// гость не видит pending
assert.equal((await anon.from('listings').select('id').eq('id', id)).data.length, 0); ok('pending не виден гостю');
// админ: очередь (как adminListings)
const q = must(await m.from('listings').select('*, known_brands(name,country), listing_photos(id,path,kind,position), listing_verification(serial_number,serial_photo_path,moderator_note)').eq('status', 'pending').order('updated_at', { ascending: true }).limit(100));
assert.equal(q.length, 1); assert.equal(q[0].listing_verification.serial_number, 'WTU123'); assert.equal(q[0].listing_photos.length, 4);
ok('очередь модерации с серийником и фото');
const profs = must(await m.from('profiles').select('id,tg_id,username,first_name,created_at').in('id', [A]));
assert.equal(profs[0].username, 'seller_a'); ok('админ видит профиль продавца');
assert.equal((await m.from('listing_verification').select('listing_id, serial_number').ilike('serial_number', 'wtu123')).data.length, 1); ok('поиск дублей серийника');
must(await m.from('listings').update({ status: 'approved', verified: true, featured: true }).eq('id', id));

// каталог (как searchListings)
const qs = 'marlin';
const r = await anon.from('listings').select(CARD_FIELDS, { count: 'exact' }).eq('status', 'approved')
  .or(`title.ilike.%${qs}%,description.ilike.%${qs}%`).eq('category', 'bike').eq('brand_id', trek).eq('bike_type', 'горный')
  .eq('country', 'Казахстан').ilike('city', '%алм%').eq('condition', 'used').eq('verified', true).gte('year', 2020).lte('year', 2023)
  .gte('price_kzt', 100000).lte('price_kzt', 500000)
  .gt('expires_at', new Date().toISOString())
  .order('featured', { ascending: false }).order('bumped_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(0, 23);
must(r); assert.equal(r.count, 1); assert.equal(r.data[0].known_brands.name, 'Trek'); assert.equal(r.data[0].cover_path, `${A}/${id}/general-0.webp`);
ok(`поиск со всеми фильтрами: найдено ${r.count}, price_kzt=${r.data[0].price_kzt}`);
const r2 = must(await anon.from('listings').select(CARD_FIELDS, { count: 'exact' }).eq('status', 'approved').eq('currency', 'USD').gte('price', 900));
assert.equal(r2.length, 0); ok('фильтр цены в валюте');
assert.equal((await anon.from('listings').select('id', { count: 'exact' }).eq('status', 'approved').is('brand_id', null)).count, 0); ok('фильтр «другой бренд»');

// страница объявления
const l = must(await anon.from('listings').select('*, known_brands(name,country), listing_photos(id,path,kind,position)').eq('id', id).maybeSingle());
assert.equal(l.listing_photos.length, 4); ok('страница объявления + галерея');
const seller = must(await anon.rpc('get_seller', { p_listing_id: id }));
assert.equal(seller[0].username, 'seller_a'); assert.equal(seller[0].active_listings, 1); ok('get_seller');
assert.deepEqual(Object.keys(seller[0]).sort(), ['active_listings', 'first_name', 'is_shop', 'member_since', 'shop_name', 'username']); ok('get_seller без фото и телефона (+ магазин)');
assert.ok((await anon.rpc('get_seller_phone', { p_listing_id: id })).error); ok('get_seller_phone удалена');
must(await anon.rpc('increment_view', { p_id: id }));
assert.equal(must(await anon.from('listings').select('views').eq('id', id).single()).views, 1); ok('increment_view');
assert.ok((await anon.from('listing_verification').select('*')).error); ok('гость: listing_verification закрыт');
assert.equal(must(await b.from('listing_verification').select('*')).length, 0); ok('чужой пользователь: серийник не виден');
assert.equal(must(await b.from('profiles').select('*')).length, 1); ok('профили чужих не читаются');

// избранное, жалоба
must(await b.from('favorites').upsert({ user_id: B, listing_id: id }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true }));
must(await b.from('favorites').upsert({ user_id: B, listing_id: id }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true }));
const favs = must(await b.from('favorites').select(`created_at, listings(${CARD_FIELDS})`).order('created_at', { ascending: false }));
assert.equal(favs[0].listings.id, id); ok('избранное (повторное добавление без ошибки)');
must(await b.from('reports').insert({ listing_id: id, reason: 'replica', comment: 'тест', user_id: B }));
const dup = (await b.from('reports').insert({ listing_id: id, reason: 'replica', user_id: B })).error;
assert.match(dup.message, /duplicate key/); ok('повторная жалоба отклоняется');
const reps = must(await m.from('reports').select('*, listings(id,title,status)').order('created_at', { ascending: false }));
assert.equal(reps[0].listings.title, 'Trek Marlin 7'); ok('админ видит жалобы с объявлением');

// мои объявления, продажа
const mine = must(await a.from('listings').select(CARD_FIELDS + ',rejection_reason').eq('user_id', A).order('created_at', { ascending: false }));
assert.equal(mine.length, 2); ok('мои объявления (включая черновик)');
assert.ok((await a.from('profiles').update({ is_admin: true }).eq('id', A)).error); ok('is_admin через API не меняется');
// ---- миграция 07: услуги, заказы, продление, магазин, очистка (запросы как в api.js)
const svcs = must(await anon.from('services').select('*').order('sort'));
assert.ok(svcs.find((x) => x.code === 'top').price_kzt > 0); ok(`услуги и цены читаются гостем: ${svcs.length}`);
const st = must(await anon.from('app_settings').select('*').eq('id', 1).maybeSingle());
assert.equal(st.free_listing_limit, null); ok('настройки: лимит выключен');
assert.ok((await a.from('services').update({ price_kzt: 1 }).eq('code', 'top').select()).data?.length !== 1); ok('пользователь не меняет цены');
must(await anon.rpc('maintenance_tick', { p_force: false })); ok('maintenance_tick вызывается гостем');
const oid = must(await a.rpc('create_order', { p_service: 'top', p_listing_id: id, p_note: null }));
assert.ok(oid > 0); ok(`create_order → заказ № ${oid}`);
assert.ok((await a.from('service_orders').insert({ user_id: A, service: 'top', price_kzt: 0 })).error); ok('прямой insert заказа запрещён');
const myo = must(await a.from('service_orders').select('*').eq('user_id', A).order('created_at', { ascending: false }).limit(50));
assert.equal(myo[0].price_kzt, svcs.find((x) => x.code === 'top').price_kzt); ok('мои заявки с ценой из services');
assert.equal(must(await b.from('service_orders').select('*')).length, 0); ok('чужие заявки не видны');
assert.ok((await a.rpc('admin_activate_order', { p_id: oid })).error); ok('владелец не может включить услугу');
const ao = must(await m.from('service_orders').select('*, listings(id,title,status,featured_until,highlight_until,urgent_until,auto_renew_until,expires_at)').eq('status', 'requested').order('created_at', { ascending: false }).limit(200));
assert.equal(ao[0].listings.id, id); ok('админ: заказы с объявлением');
must(await m.rpc('admin_activate_order', { p_id: oid }));
const after = must(await anon.from('listings').select(CARD_FIELDS).eq('id', id).single());
assert.ok(after.featured && new Date(after.featured_until) > new Date()); ok('«Оплачено, включить» → Топ включён');
const shopOid = must(await a.rpc('create_order', { p_service: 'shop', p_listing_id: null, p_note: 'Velo A' }));
must(await m.rpc('admin_activate_order', { p_id: shopOid }));
const shop = must(await anon.rpc('get_shop', { p_username: 'seller_a' }))[0];
assert.equal(shop.shop_name, 'Velo A'); assert.equal(shop.is_shop, true); ok('get_shop: магазин');
const shopList = must(await anon.from('listings').select(CARD_FIELDS, { count: 'exact' }).eq('status', 'approved').gt('expires_at', new Date().toISOString()).eq('user_id', shop.user_id));
assert.equal(shopList.length, 1); assert.ok(new Date(shopList[0].shop_until) > new Date()); ok('страница магазина: объявления + значок');
assert.ok((await a.rpc('renew_listing', { p_id: id })).error); ok('продлить рано — ошибка');
must(await m.from('app_settings').update({ free_listing_limit: 5 }).eq('id', 1));
must(await m.from('app_settings').update({ free_listing_limit: null }).eq('id', 1)); ok('админ меняет настройки');
assert.ok(Array.isArray(must(await m.rpc('admin_cleanup_candidates', { p_limit: 100 })))); ok('admin_cleanup_candidates');
assert.ok((await a.rpc('admin_cleanup_candidates', { p_limit: 100 })).error); ok('очистка недоступна пользователю');
const gal = must(await anon.from('ads').select('id,slot,title,image_url,url,position').eq('slot', 'gallery_end').eq('active', true).order('position'));
assert.equal(gal.length, 2); ok('баннеры gallery_end');
must(await a.from('listings').update({ status: 'sold' }).eq('id', id)); ok('отметка «Продано»');

// реклама и курсы
must(await m.from('ads').insert({ slot: 'listing_side', title: 't', image_url: 'https://x/y.png', url: 'https://x', active: true }));
assert.ok((await b.from('ads').insert({ slot: 'listing_side', image_url: 'x', url: 'https://x' })).error); ok('рекламу добавляет только админ');
const ads = must(await anon.from('ads').select('id,slot,title,image_url,url,position').eq('slot', 'home_top').eq('active', true).order('position'));
assert.equal(ads.length, 2); ok('баннеры home_top');
must(await m.from('currency_rates').upsert({ code: 'USD', rate_to_kzt: 510, updated_at: new Date().toISOString() }));
assert.equal(Number(must(await anon.from('listings').select('price_kzt').eq('id', id).single()).price_kzt), 408000); ok('админ меняет курс → цены пересчитаны');
must(await a.from('listings').delete().eq('id', other.id)); ok('удаление своего объявления');
console.log('ALL API TESTS PASSED');
