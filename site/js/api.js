// Слой данных: Supabase (боевой режим) или демо-данные (если ключи не заданы в config.js)
import { CONFIG } from './config.js';

const HAS_KEYS = /^https:\/\/.+/.test(CONFIG.SUPABASE_URL || '') && !!CONFIG.SUPABASE_ANON_KEY;

// Если ключи есть, но таблицы в базе ещё не созданы (или проект на паузе),
// сайт не ломается: показывает демо-данные и баннер «Сайт настраивается».
async function backendReady() {
  if (!HAS_KEYS) return false;
  const cacheKey = 'velomarket-backend-ok2';
  try {
    const c = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
    if (c && Date.now() - c.t < 60000) return c.ok;
  } catch { /* ignore */ }
  let ok = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const h = { headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` }, signal: ctrl.signal };
    const [r, r2] = await Promise.all([
      fetch(`${CONFIG.SUPABASE_URL}/rest/v1/known_brands?select=id&limit=1`, h),
      fetch(`${CONFIG.SUPABASE_URL}/rest/v1/services?select=code&limit=1`, h).catch(() => null),
    ]);
    clearTimeout(timer);
    ok = r.ok ? { v2: !!r2?.ok } : false;
  } catch { ok = false; }
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ ok, t: Date.now() })); } catch { /* ignore */ }
  return ok;
}
const READY = await backendReady();
export const IS_DEMO = !READY;
// Миграция 07 (сроки, платные услуги) применена? Пока нет — сайт работает по-старому, без новых функций.
export const V2 = IS_DEMO || !!READY?.v2;
export const SETUP_PENDING = HAS_KEYS && !READY;
export const CATEGORIES = { bike: 'Велосипеды', part: 'Запчасти', accessory: 'Аксессуары' };
export const BIKE_TYPES = ['горный', 'шоссейный', 'гравийный', 'городской', 'электро', 'BMX', 'детский', 'фэтбайк'];
export const CONDITIONS = { new: 'Новый', used: 'С пробегом' };
export const STATUSES = { draft: 'Черновик', pending: 'На модерации', approved: 'Опубликовано', rejected: 'Отклонено', sold: 'Продано', expired: 'Срок истёк' };
export const CURRENCIES = ['KZT', 'RUB', 'USD', 'EUR', 'UZS', 'KGS', 'BYN', 'CNY', 'GBP', 'JPY'];
export const COUNTRIES = ['Казахстан', 'Россия', 'Узбекистан', 'Кыргызстан', 'Таджикистан', 'Туркменистан', 'Беларусь',
  'Армения', 'Грузия', 'Азербайджан', 'Монголия', 'Китай', 'Турция', 'ОАЭ', 'Германия', 'Польша', 'Чехия', 'Литва',
  'Латвия', 'Эстония', 'Украина', 'Молдова', 'Израиль', 'США', 'Канада', 'Великобритания', 'Франция', 'Италия',
  'Испания', 'Нидерланды', 'Япония', 'Южная Корея', 'Другая страна'];
export const KZ_CITIES = ['Алматы', 'Астана', 'Шымкент', 'Караганда', 'Актобе', 'Тараз', 'Павлодар', 'Усть-Каменогорск',
  'Семей', 'Атырау', 'Костанай', 'Кызылорда', 'Уральск', 'Петропавловск', 'Актау', 'Темиртау', 'Туркестан', 'Кокшетау',
  'Талдыкорган', 'Экибастуз', 'Жезказган', 'Конаев'];
export const REPORT_REASONS = { replica: 'Реплика / подделка', fraud: 'Мошенничество', wrong_info: 'Неверное описание',
  sold: 'Уже продано', spam: 'Спам / дубль', other: 'Другое' };

const CARD_FIELDS_V1 = 'id,title,category,brand_id,brand_other,model,year,bike_type,wheel_size,condition,price,currency,price_kzt,country,city,cover_path,verified,featured,status,views,created_at,published_at,known_brands(name,country)';
const CARD_FIELDS = V2 ? CARD_FIELDS_V1 + ',user_id,expires_at,bumped_at,featured_until,highlight_until,urgent_until,auto_renew_until,shop_until' : CARD_FIELDS_V1;
export const isOn = (until) => !!until && new Date(until) > new Date();
export const daysLeft = (until) => until ? Math.max(0, Math.ceil((new Date(until) - Date.now()) / 86400000)) : 0;
// «живое» объявление в каталоге: одобрено и срок не истёк
export const isLive = (l) => l.status === 'approved' && (!l.expires_at || new Date(l.expires_at) > new Date());

// ------------------------------------------------------------------ Supabase
let sb = null;
async function client() {
  if (sb) return sb;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'velomarket-auth' },
  });
  return sb;
}
function must({ data, error, count }) {
  if (error) throw new Error(humanError(error));
  return count !== undefined && count !== null ? { data, count } : data;
}
function humanError(e) {
  const m = e?.message || String(e);
  if (/JWT|session/i.test(m)) return 'Сессия истекла — войдите снова';
  if (/row-level security|permission denied|42501/i.test(m)) return 'Недостаточно прав для этого действия';
  if (/duplicate key.*reports/i.test(m)) return 'Вы уже отправляли жалобу на это объявление';
  return m;
}
export function photoUrl(path, bucket = 'listing-photos') {
  if (!path) return 'assets/demo/bike-mtb.svg';
  if (/^(https?:|assets\/|data:|blob:)/.test(path)) return path;
  return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
const rnd = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

// ------------------------------------------------------------------ Демо
let demo = null;
async function D() {
  if (demo) return demo;
  const m = await import('./demo-data.js');
  const b = await import('./brands-data.js');
  demo = { ...m, brands: b.BRANDS, listings: m.patchDemoListings(m.buildDemoListings()), ads: [...m.DEMO_ADS], orders: m.buildDemoOrders(),
    services: CONFIG.SERVICES_FALLBACK.map((x) => ({ ...x })), settings: { ...CONFIG.SETTINGS_FALLBACK }, reports: [
    { id: 1, listing_id: 1003, reason: 'replica', comment: 'Демо-жалоба: сомневаюсь в оригинальности', status: 'open', created_at: new Date().toISOString() }] };
  return demo;
}
function demoMe() {
  const v = localStorage.getItem('velomarket-demo-login');
  if (!v || !demo) return null;
  return v === 'admin' ? demo.DEMO_ADMIN : demo.DEMO_USER;
}
const demoFavKey = 'velomarket-demo-fav';
const demoFav = () => new Set(JSON.parse(localStorage.getItem(demoFavKey) || '[]'));
function withBrand(l) {
  const br = demo.brands.find((x) => x.id === Number(l.brand_id));
  return { ...l, known_brands: br ? { name: br.name, country: br.country } : null, title: `${br ? br.name : l.brand_other || ''} ${l.model}`.trim() };
}
function demoOnly() { throw new Error('В демо-режиме это действие недоступно — подключите Supabase (см. README)'); }

// ------------------------------------------------------------------ Авторизация
// Профиль загружаем один раз за страницу. Никаких перезагрузок/редиректов здесь нет.
let meP = null;
export function getMe() {
  if (!meP) meP = loadMe().catch((e) => ({ id: null, first_name: 'Пользователь', is_admin: false, _profileError: e.message || String(e) }));
  return meP;
}
async function loadMe() {
  if (IS_DEMO) { await D(); return demoMe(); }
  const s = await client();
  const { data: { session } } = await s.auth.getSession();
  if (!session) return null;
  // только колонки, которые есть в любой версии схемы (до и после миграции 06)
  const { data, error, status } = await s.from('profiles').select('id,tg_id,username,first_name,is_admin,is_banned,created_at' + (V2 ? ',shop_name,shop_until' : ''))
    .eq('id', session.user.id).maybeSingle();
  if (error) {
    if (status === 401 || /JWT|token/i.test(error.message)) {   // сессия недействительна → тихо выходим (без перезагрузки)
      await s.auth.signOut({ scope: 'local' }).catch(() => {});
      return null;
    }
    return { id: session.user.id, first_name: 'Пользователь', is_admin: false, _profileError: error.message };
  }
  if (!data) return { id: session.user.id, first_name: 'Пользователь', is_admin: false, _profileError: 'Профиль не найден' };
  return data;
}
export async function loginWithTelegram(tgUser) {
  if (IS_DEMO) demoOnly();
  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/telegram-auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
    body: JSON.stringify(tgUser),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404) throw new Error('Функция входа ещё не установлена в Supabase (telegram-auth). Попробуйте позже.');
    const map = { invalid_hash: 'Подпись Telegram не прошла проверку', auth_expired: 'Данные входа устарели, попробуйте ещё раз',
      too_many_requests: 'Слишком много попыток, подождите минуту', banned: 'Аккаунт заблокирован' };
    throw new Error(map[j.error] || `Ошибка входа (${j.error || r.status})`);
  }
  const s = await client();
  const { error } = await s.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
  if (error) throw new Error(humanError(error));
  meP = null;
  return j.user;
}
export function demoLogin(role) { localStorage.setItem('velomarket-demo-login', role); }
export async function logout() {
  meP = null;
  if (IS_DEMO) { localStorage.removeItem('velomarket-demo-login'); return; }
  const s = await client();
  await s.auth.signOut({ scope: 'local' }).catch(() => {});
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('velomarket-auth')) localStorage.removeItem(k); } catch { /* ignore */ }
}
// ------------------------------------------------------------------ Справочники
export async function listBrands() {
  if (IS_DEMO) return (await D()).brands;
  const s = await client();
  return must(await s.from('known_brands').select('id,name,country,kind,is_popular').order('name'));
}
export async function listRates() {
  if (IS_DEMO) return (await D()).DEMO_RATES;
  return must(await (await client()).from('currency_rates').select('*').order('code'));
}

// ------------------------------------------------------------------ Каталог
function sanitizeQ(q) { return (q || '').replace(/[%,()*\\:."']/g, ' ').trim().slice(0, 60); }

export async function searchListings(f = {}) {
  const page = Math.max(1, Number(f.page) || 1);
  const size = Number(f.pageSize) || CONFIG.PAGE_SIZE;
  if (IS_DEMO) {
    await D();
    let items = demo.listings.filter(isLive).map(withBrand);
    if (f.user) items = items.filter((l) => l.user_id === f.user);
    const q = sanitizeQ(f.q).toLowerCase();
    if (q) items = items.filter((l) => (l.title + ' ' + l.description).toLowerCase().includes(q));
    if (f.category) items = items.filter((l) => l.category === f.category);
    if (f.brand === 'other') items = items.filter((l) => !l.brand_id);
    else if (f.brand) items = items.filter((l) => l.brand_id === Number(f.brand));
    if (f.type) items = items.filter((l) => l.bike_type === f.type);
    if (f.country) items = items.filter((l) => l.country === f.country);
    if (f.city) items = items.filter((l) => l.city.toLowerCase().includes(f.city.toLowerCase()));
    if (f.condition) items = items.filter((l) => l.condition === f.condition);
    if (f.verified) items = items.filter((l) => l.verified);
    if (f.featured) items = items.filter((l) => l.featured);
    if (f.year_from) items = items.filter((l) => l.year >= +f.year_from);
    if (f.year_to) items = items.filter((l) => l.year <= +f.year_to);
    const pf = f.currency ? 'price' : 'price_kzt';
    if (f.currency) items = items.filter((l) => l.currency === f.currency);
    if (f.price_from) items = items.filter((l) => l[pf] >= +f.price_from);
    if (f.price_to) items = items.filter((l) => l[pf] <= +f.price_to);
    const sorters = { price_asc: (a, b) => a.price_kzt - b.price_kzt, price_desc: (a, b) => b.price_kzt - a.price_kzt,
      year_desc: (a, b) => (b.year || 0) - (a.year || 0), fresh: (a, b) => (b.bumped_at || b.published_at).localeCompare(a.bumped_at || a.published_at) };
    const srt = sorters[f.sort] || sorters.fresh;
    items.sort((a, b) => (f.sort && f.sort !== 'fresh' ? 0 : (b.featured - a.featured)) || srt(a, b));
    return { items: items.slice((page - 1) * size, page * size), total: items.length };
  }
  const s = await client();
  if (V2) tick();
  let q = s.from('listings').select(CARD_FIELDS, { count: 'exact' }).eq('status', 'approved');
  if (V2) q = q.gt('expires_at', new Date().toISOString());   // истёкшие не показываем (даже владельцу в каталоге)
  if (V2 && f.user) q = q.eq('user_id', f.user);
  const qs = sanitizeQ(f.q);
  if (qs) q = q.or(`title.ilike.%${qs}%,description.ilike.%${qs}%`);
  if (f.category) q = q.eq('category', f.category);
  if (f.brand === 'other') q = q.is('brand_id', null); else if (f.brand) q = q.eq('brand_id', Number(f.brand));
  if (f.type) q = q.eq('bike_type', f.type);
  if (f.country) q = q.eq('country', f.country);
  if (f.city) q = q.ilike('city', `%${sanitizeQ(f.city)}%`);
  if (f.condition) q = q.eq('condition', f.condition);
  if (f.verified) q = q.eq('verified', true);
  if (f.featured) q = q.eq('featured', true);
  if (f.year_from) q = q.gte('year', +f.year_from);
  if (f.year_to) q = q.lte('year', +f.year_to);
  const pf = f.currency ? 'price' : 'price_kzt';
  if (f.currency) q = q.eq('currency', f.currency);
  if (f.price_from) q = q.gte(pf, +f.price_from);
  if (f.price_to) q = q.lte(pf, +f.price_to);
  if (!f.sort || f.sort === 'fresh') q = q.order('featured', { ascending: false }).order(V2 ? 'bumped_at' : 'published_at', { ascending: false, nullsFirst: false });
  if (f.sort === 'price_asc') q = q.order('price_kzt', { ascending: true });
  if (f.sort === 'price_desc') q = q.order('price_kzt', { ascending: false });
  if (f.sort === 'year_desc') q = q.order('year', { ascending: false, nullsFirst: false });
  q = q.order('id', { ascending: false }).range((page - 1) * size, page * size - 1);
  const { data, count } = must(await q);
  return { items: data || [], total: count || 0 };
}

export async function getListing(id) {
  id = Number(id);
  if (IS_DEMO) {
    await D(); const l = demo.listings.find((x) => x.id === id);
    if (!l) return null;
    const me = demoMe();
    if (!isLive(l) && l.status !== 'sold' && !(me && (me.is_admin || l.user_id === me.id))) return null;
    return withBrand({ ...l, listing_photos: [...l.listing_photos].sort((a, b) => a.position - b.position) });
  }
  const s = await client();
  const l = must(await s.from('listings').select('*, known_brands(name,country), listing_photos(id,path,kind,position)').eq('id', id).maybeSingle());
  if (l) l.listing_photos.sort((a, b) => (a.kind === 'brand') - (b.kind === 'brand') || a.position - b.position || a.id - b.id);
  return l;
}
export async function getSeller(id) {
  if (IS_DEMO) { await D(); return demo.listings.find((x) => x.id === +id)?._seller || null; }
  const r = must(await (await client()).rpc('get_seller', { p_listing_id: +id }));
  return r?.[0] || null;
}
export async function incrementView(id) {
  const key = `vm-viewed-${id}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  if (IS_DEMO) return;
  await (await client()).rpc('increment_view', { p_id: +id });
}
export async function sendReport(listingId, reason, comment) {
  if (IS_DEMO) return;
  const me = await getMe();
  if (!me) throw new Error('Войдите, чтобы отправить жалобу');
  must(await (await client()).from('reports').insert({ listing_id: +listingId, reason, comment: comment || null, user_id: me.id }));
}

// ------------------------------------------------------------------ Избранное
export async function favoriteIds() {
  if (IS_DEMO) return demoFav();
  const me = await getMe(); if (!me) return new Set();
  const d = must(await (await client()).from('favorites').select('listing_id'));
  return new Set(d.map((x) => x.listing_id));
}
export async function toggleFavorite(id, on) {
  id = Number(id);
  if (IS_DEMO) { const f = demoFav(); on ? f.add(id) : f.delete(id); localStorage.setItem(demoFavKey, JSON.stringify([...f])); return; }
  const me = await getMe(); if (!me) throw new Error('Войдите через Telegram, чтобы сохранять избранное');
  const s = await client();
  if (on) must(await s.from('favorites').upsert({ user_id: me.id, listing_id: id }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true }));
  else must(await s.from('favorites').delete().eq('listing_id', id).eq('user_id', me.id));
}
export async function listFavorites() {
  if (IS_DEMO) { await D(); const f = demoFav(); return demo.listings.filter((l) => f.has(l.id)).map(withBrand); }
  const s = await client();
  const d = must(await s.from('favorites').select(`created_at, listings(${CARD_FIELDS})`).order('created_at', { ascending: false }));
  return d.map((x) => x.listings).filter(Boolean);
}

// ------------------------------------------------------------------ Мои объявления
export async function myListings() {
  if (IS_DEMO) { await D(); const me = demoMe(); return me ? demo.listings.filter((l) => l.user_id === 'demo-user').map(withBrand) : []; }
  const s = await client(); const me = await getMe();
  return must(await s.from('listings').select(CARD_FIELDS + ',rejection_reason' + (V2 ? ',renewed_at,paid_slot_until' : '')).eq('user_id', me.id).order('created_at', { ascending: false }));
}
export async function markSold(id) {
  if (IS_DEMO) { await D(); const l = demo.listings.find((x) => x.id === +id); if (l) { l.status = 'sold'; l.sold_at = new Date().toISOString(); } return; }
  must(await (await client()).from('listings').update({ status: 'sold' }).eq('id', +id));
}
export async function deleteListing(id) {
  if (IS_DEMO) { await D(); demo.listings = demo.listings.filter((x) => x.id !== +id); return; }
  const s = await client();
  const photos = must(await s.from('listing_photos').select('path').eq('listing_id', +id));
  const ver = must(await s.from('listing_verification').select('serial_photo_path').eq('listing_id', +id).maybeSingle());
  must(await s.from('listings').delete().eq('id', +id));
  if (photos.length) await s.storage.from('listing-photos').remove(photos.map((p) => p.path));
  if (ver?.serial_photo_path) await s.storage.from('verification').remove([ver.serial_photo_path]);
}

// ------------------------------------------------------------------ Подача / редактирование
const EDITABLE = ['category', 'brand_id', 'brand_other', 'model', 'year', 'bike_type', 'frame_size', 'wheel_size',
  'condition', 'price', 'currency', 'country', 'city', 'description'];
const pick = (o) => Object.fromEntries(EDITABLE.filter((k) => k in o).map((k) => [k, o[k] === '' ? null : o[k]]));

export async function getListingForEdit(id) {
  if (IS_DEMO) { const l = await getListing(id); return l && { ...l, verification: { serial_number: l._serial } }; }
  const s = await client();
  const l = await getListing(id);
  if (!l) return null;
  const v = must(await s.from('listing_verification').select('*').eq('listing_id', +id).maybeSingle());
  return { ...l, verification: v };
}
export async function createListing(fields) {
  if (IS_DEMO) demoOnly();
  const s = await client(); const me = await getMe();
  return must(await s.from('listings').insert({ ...pick(fields), user_id: me.id }).select('id').single()).id;
}
export async function updateListing(id, fields) {
  if (IS_DEMO) demoOnly();
  must(await (await client()).from('listings').update(pick(fields)).eq('id', +id));
}
export async function uploadListingPhoto(listingId, blob, ext, kind, position) {
  const s = await client(); const me = await getMe();
  const path = `${me.id}/${listingId}/${kind}-${rnd()}.${ext}`;
  const { error } = await s.storage.from('listing-photos').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error('Загрузка фото: ' + humanError(error));
  must(await s.from('listing_photos').insert({ listing_id: +listingId, path, kind, position }));
  return path;
}
export async function deleteListingPhoto(photo) {
  const s = await client();
  must(await s.from('listing_photos').delete().eq('id', photo.id));
  await s.storage.from('listing-photos').remove([photo.path]);
}
export async function saveVerification(listingId, serial, blob, ext, oldPath) {
  const s = await client(); const me = await getMe();
  let path = oldPath;
  if (blob) {
    path = `${me.id}/${listingId}/serial-${rnd()}.${ext}`;
    const { error } = await s.storage.from('verification').upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error('Загрузка фото серийника: ' + humanError(error));
  }
  if (!path) throw new Error('Нужно фото серийного номера');
  must(await s.from('listing_verification').upsert({ listing_id: +listingId, serial_number: serial, serial_photo_path: path }, { onConflict: 'listing_id' }));
  if (blob && oldPath && oldPath !== path) await s.storage.from('verification').remove([oldPath]);
}
export async function submitListing(id) {
  must(await (await client()).rpc('submit_listing', { p_id: +id }));
}

// ------------------------------------------------------------------ Реклама
export async function getAds(slot) {
  if (IS_DEMO) return (await D()).ads.filter((a) => a.slot === slot && a.active);
  if (slot === 'gallery_end' && !V2) return [];
  try {
    return must(await (await client()).from('ads').select('id,slot,title,image_url,url,position')
      .eq('slot', slot).eq('active', true).order('position'));
  } catch { return []; }
}

// ------------------------------------------------------------------ Админка
async function requireAdmin() { const me = await getMe(); if (!me?.is_admin) throw new Error('Только для администратора'); return me; }

export async function adminListings(status) {
  await requireAdmin();
  if (IS_DEMO) {
    return demo.listings.filter((l) => !status || l.status === status).map((l) => withBrand({ ...l,
      verification: { serial_number: l._serial, signed_url: l.cover_path }, seller: { username: 'demo_seller', first_name: 'Демо-продавец', tg_id: 0 } }));
  }
  const s = await client();
  let q = s.from('listings').select('*, known_brands(name,country), listing_photos(id,path,kind,position), listing_verification(serial_number,serial_photo_path,moderator_note)')
    .order(status === 'pending' ? 'updated_at' : 'created_at', { ascending: status === 'pending' }).limit(100);
  if (status) q = q.eq('status', status);
  const rows = must(await q);
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const profs = ids.length ? must(await s.from('profiles').select('id,tg_id,username,first_name,created_at').in('id', ids)) : [];
  const pm = Object.fromEntries(profs.map((p) => [p.id, p]));
  for (const r of rows) {
    const v = Array.isArray(r.listing_verification) ? r.listing_verification[0] : r.listing_verification;
    if (v?.serial_photo_path) {
      const { data } = await s.storage.from('verification').createSignedUrl(v.serial_photo_path, 3600);
      v.signed_url = data?.signedUrl;
    }
    r.verification = v || null; r.seller = pm[r.user_id] || null;
    r.listing_photos?.sort((a, b) => a.position - b.position);
  }
  return rows;
}
export async function adminUpdateListing(id, patch) {
  await requireAdmin();
  if (IS_DEMO) {
    const l = demo.listings.find((x) => x.id === +id); Object.assign(l, patch);
    if ('featured' in patch) l.featured_until = patch.featured ? new Date(Date.now() + 7 * 86400000).toISOString() : null;
    if (patch.status === 'approved' && !isLive(l)) l.expires_at = new Date(Date.now() + 30 * 86400000).toISOString();
    return;
  }
  must(await (await client()).from('listings').update(patch).eq('id', +id));
}
export async function adminSerialSearch(serial) {
  await requireAdmin();
  if (IS_DEMO) return demo.listings.filter((l) => l._serial === serial).map((l) => ({ listing_id: l.id }));
  return must(await (await client()).from('listing_verification').select('listing_id, serial_number').ilike('serial_number', serial.trim()));
}
export async function adminReports() {
  await requireAdmin();
  if (IS_DEMO) return demo.reports.map((r) => ({ ...r, listings: withBrand(demo.listings.find((l) => l.id === r.listing_id)) }));
  return must(await (await client()).from('reports').select('*, listings(id,title,status)').order('created_at', { ascending: false }).limit(200));
}
export async function adminSetReport(id, status) {
  await requireAdmin();
  if (IS_DEMO) { demo.reports.find((r) => r.id === id).status = status; return; }
  must(await (await client()).from('reports').update({ status }).eq('id', id));
}
export async function adminAds() {
  await requireAdmin();
  if (IS_DEMO) return demo.ads;
  return must(await (await client()).from('ads').select('*').order('slot').order('position'));
}
export async function adminSaveAd(ad) {
  await requireAdmin();
  const row = { slot: ad.slot, title: ad.title || '', image_url: ad.image_url, url: ad.url, active: !!ad.active,
    starts_at: ad.starts_at || null, ends_at: ad.ends_at || null, position: Number(ad.position) || 0 };
  if (IS_DEMO) { if (ad.id) Object.assign(demo.ads.find((a) => a.id === +ad.id), row); else demo.ads.push({ ...row, id: Date.now() }); return; }
  const s = await client();
  if (ad.id) must(await s.from('ads').update(row).eq('id', +ad.id)); else must(await s.from('ads').insert(row));
}
export async function adminDeleteAd(id) {
  await requireAdmin();
  if (IS_DEMO) { demo.ads = demo.ads.filter((a) => a.id !== id); return; }
  must(await (await client()).from('ads').delete().eq('id', id));
}
export async function adminUploadAdImage(file) {
  await requireAdmin();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Только JPG, PNG, WebP или GIF');
  let body = file, type = file.type, ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  if (file.type === 'image/gif') {
    // GIF не пережимаем, чтобы не потерять анимацию
    if (file.size > 2 * 1024 * 1024) throw new Error('GIF-баннер до 2 МБ');
  } else {
    // Сжимаем в браузере: длинная сторона до 1600px, WebP/JPEG
    const { compressImage } = await import('./image.js');
    const c = await compressImage(file, { maxSide: 1600, quality: 0.85 });
    body = c.blob; type = c.blob.type; ext = c.ext;
    if (body.size > 2 * 1024 * 1024) throw new Error('Баннер после сжатия больше 2 МБ');
  }
  if (IS_DEMO) return URL.createObjectURL(body);
  const s = await client();
  const path = `${new Date().toISOString().slice(0, 10)}/${rnd()}.${ext}`;
  const { error } = await s.storage.from('ads').upload(path, body, { contentType: type, cacheControl: '31536000' });
  if (error) throw new Error(humanError(error));
  return photoUrl(path, 'ads');
}
export async function adminAddBrand(name, country, kind) {
  await requireAdmin();
  if (IS_DEMO) { demo.brands.push({ id: Date.now(), name, country, kind, is_popular: false }); return; }
  must(await (await client()).from('known_brands').insert({ name, country, kind }));
}
export async function adminSetRate(code, rate) {
  await requireAdmin();
  if (IS_DEMO) return;
  must(await (await client()).from('currency_rates').upsert({ code, rate_to_kzt: Number(rate), updated_at: new Date().toISOString() }));
}

// ------------------------------------------------------------------ Сроки, услуги, заказы (миграция 07)
const NEED_V2 = 'Эта функция заработает после применения миграции 07 (monetization.sql) в Supabase';
// «Ленивое» обслуживание: истечение сроков, автопродление, снятие «Топ». Не чаще раза в 5 минут с одного браузера.
function tick() {
  try {
    const k = 'velomarket-tick'; const last = +localStorage.getItem(k) || 0;
    if (Date.now() - last < 5 * 60000) return;
    localStorage.setItem(k, String(Date.now()));
    client().then((s) => s.rpc('maintenance_tick', { p_force: false })).catch(() => {});
  } catch { /* ignore */ }
}
let servicesP = null;
export function listServices() {
  if (!servicesP) {
    servicesP = (async () => {
      if (IS_DEMO) { await D(); return demo.services; }
      if (!V2) return CONFIG.SERVICES_FALLBACK.map((x) => ({ ...x }));
      try { return must(await (await client()).from('services').select('*').order('sort')); }
      catch { return CONFIG.SERVICES_FALLBACK.map((x) => ({ ...x })); }
    })();
  }
  return servicesP;
}
export async function getSettings() {
  if (IS_DEMO) { await D(); return demo.settings; }
  if (!V2) return { ...CONFIG.SETTINGS_FALLBACK };
  try { return must(await (await client()).from('app_settings').select('*').eq('id', 1).maybeSingle()) || { ...CONFIG.SETTINGS_FALLBACK }; }
  catch { return { ...CONFIG.SETTINGS_FALLBACK }; }
}
export async function renewListing(id) {
  if (IS_DEMO) {
    await D(); const l = demo.listings.find((x) => x.id === +id);
    if (l.expires_at && daysLeft(l.expires_at) > demo.settings.renew_window_days) throw new Error(`Продлить можно за ${demo.settings.renew_window_days} дн. до окончания срока`);
    Object.assign(l, { status: 'approved', expires_at: new Date(Date.now() + demo.settings.listing_days * 86400000).toISOString(), renewed_at: new Date().toISOString() });
    return l.expires_at;
  }
  if (!V2) throw new Error(NEED_V2);
  return must(await (await client()).rpc('renew_listing', { p_id: +id }));
}
export async function myOrders() {
  if (IS_DEMO) { await D(); const me = demoMe(); return me ? demo.orders.filter((o) => o.user_id === me.id) : []; }
  if (!V2) return [];
  const me = await getMe(); if (!me?.id) return [];
  return must(await (await client()).from('service_orders').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(50));
}
export async function orderService(code, listingId = null, note = null) {
  const me = await getMe();
  if (!me) throw new Error('Войдите через Telegram, чтобы заказать услугу');
  if (IS_DEMO) {
    await D(); const sv = demo.services.find((x) => x.code === code);
    const dup = demo.orders.find((o) => o.user_id === me.id && o.service === code && o.listing_id === listingId && o.status === 'requested');
    if (dup) return dup.id;
    const o = { id: 100 + demo.orders.length, user_id: me.id, listing_id: listingId, service: code, price_kzt: sv.price_kzt, days: sv.duration_days, note, status: 'requested', created_at: new Date().toISOString() };
    demo.orders.unshift(o); return o.id;
  }
  if (!V2) throw new Error(NEED_V2);
  return must(await (await client()).rpc('create_order', { p_service: code, p_listing_id: listingId ? +listingId : null, p_note: note || null }));
}
// Ссылка в Telegram с готовым текстом заказа
export function payLink({ orderId, service, listing, price, note }) {
  const base = location.href.replace(/[^/]*([?#].*)?$/, '');
  const lines = [`Здравствуйте! Хочу оплатить услугу VeloMarket «${service.title}»${service.duration_days ? ` (${service.duration_days} дн.)` : ''}.`];
  if (orderId) lines.push(`Заказ № ${orderId}`);
  if (listing) lines.push(`Объявление № ${listing.id}: ${listing.title}`, `${base}listing.html?id=${listing.id}`);
  if (note) lines.push(`Комментарий: ${note}`);
  lines.push(`Сумма: ${Number(price ?? service.price_kzt).toLocaleString('ru-RU')} ₸`, 'Оплачу Kaspi-переводом — пришлите, пожалуйста, реквизиты.');
  const text = lines.join('\n');
  return { text, url: `https://t.me/${encodeURIComponent(CONFIG.PAY_TELEGRAM || CONFIG.SUPPORT_TELEGRAM)}?text=${encodeURIComponent(text)}` };
}
export async function getShop(username) {
  if (IS_DEMO) {
    await D(); const u = String(username || '').toLowerCase();
    if (u === 'demo_seller') return { user_id: 'demo-seller', username: 'demo_seller', first_name: 'Демо-продавец', shop_name: 'ВелоДемо Алматы', is_shop: true, member_since: demo.listings[0]._seller.member_since, active_listings: demo.listings.filter((l) => l.user_id === 'demo-seller' && isLive(l)).length };
    if (u === 'demo_user') return { user_id: 'demo-user', username: 'demo_user', first_name: 'Демо', shop_name: null, is_shop: false, member_since: demo.listings[0]._seller.member_since, active_listings: demo.listings.filter((l) => l.user_id === 'demo-user' && isLive(l)).length };
    return null;
  }
  if (!V2) return null;
  const r = must(await (await client()).rpc('get_shop', { p_username: String(username || '') }));
  return r?.[0] || null;
}
// ---- админ: заказы
export async function adminOrders(status) {
  await requireAdmin();
  let rows;
  if (IS_DEMO) rows = demo.orders.filter((o) => !status || o.status === status).map((o) => ({ ...o }));
  else {
    if (!V2) throw new Error(NEED_V2);
    const s = await client();
    let q = s.from('service_orders').select('*, listings(id,title,status,featured_until,highlight_until,urgent_until,auto_renew_until,expires_at)').order('created_at', { ascending: false }).limit(200);
    if (status) q = q.eq('status', status);
    rows = must(await q);
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const profs = ids.length ? must(await s.from('profiles').select('id,tg_id,username,first_name').in('id', ids)) : [];
    const pm = Object.fromEntries(profs.map((p) => [p.id, p]));
    for (const r of rows) r.user = pm[r.user_id] || null;
    return rows;
  }
  for (const r of rows) {
    r.user = r.user_id === 'demo-user' ? demo.DEMO_USER : { username: 'demo_seller', first_name: 'Демо-продавец', tg_id: 0 };
    const l = demo.listings.find((x) => x.id === r.listing_id); r.listings = l ? withBrand(l) : null;
  }
  return rows;
}
export async function adminActivateOrder(id) {
  await requireAdmin();
  if (IS_DEMO) {
    const o = demo.orders.find((x) => x.id === +id); const l = demo.listings.find((x) => x.id === o.listing_id);
    const ext = (v) => new Date(Math.max(Date.now(), v ? +new Date(v) : 0) + o.days * 86400000).toISOString();
    const now = new Date().toISOString();
    if (l) {
      if (o.service === 'top') { l.featured_until = ext(l.featured_until); l.featured = true; }
      if (o.service === 'highlight') l.highlight_until = ext(l.highlight_until);
      if (o.service === 'urgent') l.urgent_until = ext(l.urgent_until);
      if (o.service === 'extra_listing') l.paid_slot_until = ext(l.paid_slot_until);
      if (o.service === 'auto_renew') { l.auto_renew_until = ext(l.auto_renew_until); l.expires_at = l.auto_renew_until; l.bumped_at = now; if (l.status === 'expired') l.status = 'approved'; }
      if (o.service === 'bump') { l.bumped_at = now; if (l.status === 'expired') { l.status = 'approved'; l.expires_at = ext(null); } }
    }
    Object.assign(o, { status: 'active', paid_at: now, activated_at: now }); return;
  }
  must(await (await client()).rpc('admin_activate_order', { p_id: +id }));
}
export async function adminCancelOrder(id) {
  await requireAdmin();
  if (IS_DEMO) { demo.orders.find((x) => x.id === +id).status = 'cancelled'; return; }
  must(await (await client()).rpc('admin_cancel_order', { p_id: +id }));
}
// ---- админ: цены и настройки
export async function adminSaveService(code, patch) {
  await requireAdmin(); servicesP = null;
  const row = { price_kzt: Math.max(0, Math.round(Number(patch.price_kzt) || 0)), duration_days: Math.max(0, Math.round(Number(patch.duration_days) || 0)), active: !!patch.active };
  if (IS_DEMO) { Object.assign(demo.services.find((x) => x.code === code), row); return; }
  if (!V2) throw new Error(NEED_V2);
  must(await (await client()).from('services').update(row).eq('code', code));
}
export async function adminSaveSettings(patch) {
  await requireAdmin();
  const num = (v) => (v === '' || v === null || v === undefined ? null : Math.round(Number(v)));
  const row = { listing_days: num(patch.listing_days) || 30, renew_window_days: num(patch.renew_window_days) ?? 3, auto_bump_days: num(patch.auto_bump_days) || 3,
    cleanup_after_days: num(patch.cleanup_after_days) || 30, free_listing_limit: num(patch.free_listing_limit), shop_listing_limit: num(patch.shop_listing_limit) };
  if (IS_DEMO) { Object.assign(demo.settings, row); return; }
  if (!V2) throw new Error(NEED_V2);
  must(await (await client()).from('app_settings').update(row).eq('id', 1));
}
// ---- админ: очистка старых объявлений и их фото
export async function adminCleanupCandidates() {
  await requireAdmin();
  if (IS_DEMO) {
    const lim = Date.now() - demo.settings.cleanup_after_days * 86400000;
    return demo.listings.filter((l) => { const since = l.status === 'sold' ? l.sold_at : l.status === 'rejected' ? l.updated_at : l.expires_at;
      return ['sold', 'rejected', 'expired'].includes(l.status) && since && new Date(since) < lim; })
      .map((l) => ({ listing_id: l.id, status: l.status, since: l.sold_at || l.expires_at || l.updated_at, photo_paths: l.listing_photos.map((p) => p.path), serial_path: 'demo' }));
  }
  if (!V2) return [];
  return must(await (await client()).rpc('admin_cleanup_candidates', { p_limit: 100 }));
}
// Файлы удаляем через Storage API (так стираются и сами файлы), потом строки в базе.
export async function adminCleanupRun(onProgress = () => {}) {
  const list = await adminCleanupCandidates();
  if (!list.length) return { listings: 0, files: 0 };
  if (IS_DEMO) { const ids = new Set(list.map((x) => x.listing_id)); demo.listings = demo.listings.filter((l) => !ids.has(l.id)); return { listings: ids.size, files: list.reduce((n, x) => n + x.photo_paths.length + 1, 0) }; }
  const s = await client();
  let files = 0; const done = [];
  for (const c of list) {
    const photos = (c.photo_paths || []).filter(Boolean);
    if (photos.length) { const { error } = await s.storage.from('listing-photos').remove(photos); if (error) throw new Error('Фото: ' + humanError(error)); files += photos.length; }
    if (c.serial_path) { const { error } = await s.storage.from('verification').remove([c.serial_path]); if (error) throw new Error('Серийник: ' + humanError(error)); files += 1; }
    done.push(c.listing_id); onProgress(done.length, list.length);
  }
  const n = must(await s.rpc('admin_purge_listings', { p_ids: done }));
  return { listings: n, files };
}
