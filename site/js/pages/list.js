import * as api from '../api.js';
import { CONFIG } from '../config.js';
import { $, $$, esc, layout, cardHTML, bindFavs, renderAds, pager, params, ICON, toast } from '../ui.js';

const p = params();
await layout(p.category === 'bike' ? 'bike' : p.category === 'part' ? 'part' : '');
const form = $('#ff');
const brands = await api.listBrands().catch(() => []);
const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
$('#f-brand').insertAdjacentHTML('beforeend', brands.map((b) => opt(b.id, `${b.name} (${b.country})`)).join('') + opt('other', 'Другой бренд'));
$('#f-type').insertAdjacentHTML('beforeend', api.BIKE_TYPES.map((t) => opt(t, t[0].toUpperCase() + t.slice(1))).join(''));
$('#f-country').insertAdjacentHTML('beforeend', api.COUNTRIES.map((c) => opt(c, c)).join(''));
$('#cities').innerHTML = api.KZ_CITIES.map((c) => `<option value="${esc(c)}">`).join('');
form.currency.insertAdjacentHTML('beforeend', api.CURRENCIES.map((c) => opt(c, c)).join(''));
$('#open-filters').insertAdjacentHTML('afterbegin', ICON.filter);

for (const [k, v] of Object.entries(p)) {
  const el = form.elements[k];
  if (!el) continue;
  if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
}
$('#sort').value = p.sort || 'fresh';
const syncType = () => { $('#type-field').hidden = form.category.value && form.category.value !== 'bike'; };
syncType(); form.category.addEventListener('change', syncType);

// мобильный «ящик» фильтров
const drawer = $('#filters');
let backdrop;
const openD = () => { drawer.classList.add('open'); backdrop = document.createElement('div'); backdrop.className = 'backdrop'; backdrop.onclick = closeD; document.body.append(backdrop); };
const closeD = () => { drawer.classList.remove('open'); backdrop?.remove(); };
$('#open-filters').onclick = openD; $('#close-filters').onclick = closeD;

function current() {
  const f = Object.fromEntries([...new FormData(form)].filter(([, v]) => v !== ''));
  f.sort = $('#sort').value;
  return f;
}
function go(f) {
  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && !(k === 'sort' && v === 'fresh') && !(k === 'page' && v == 1)));
  history.replaceState(null, '', '?' + qs.toString());
  load(f);
}
form.addEventListener('submit', (e) => { e.preventDefault(); closeD(); go(current()); });
form.addEventListener('reset', () => setTimeout(() => { syncType(); go({ sort: $('#sort').value }); }, 0));
$('#sort').onchange = () => go(current());

const favs = await api.favoriteIds().catch(() => new Set());
bindFavs($('#results'), favs);
const LABELS = { q: 'Поиск', category: 'Категория', brand: 'Бренд', type: 'Тип', country: 'Страна', city: 'Город', price_from: 'Цена от',
  price_to: 'Цена до', currency: 'Валюта', year_from: 'Год от', year_to: 'Год до', condition: 'Состояние', verified: 'Проверено', featured: 'Топ' };
function chipText(k, v) {
  if (k === 'category') return api.CATEGORIES[v];
  if (k === 'brand') return v === 'other' ? 'Другой бренд' : brands.find((b) => String(b.id) === v)?.name || v;
  if (k === 'condition') return api.CONDITIONS[v];
  if (k === 'verified') return '✓ Проверено';
  if (k === 'featured') return 'Топ-объявления';
  return `${LABELS[k]}: ${v}`;
}

async function load(f) {
  const page = Number(f.page) || 1;
  const title = f.featured ? 'Топ-объявления' : f.brand && f.brand !== 'other' ? `${brands.find((b) => String(b.id) === f.brand)?.name || ''}: объявления`
    : f.type ? `${f.type[0].toUpperCase() + f.type.slice(1)} велосипеды` : f.category ? api.CATEGORIES[f.category] : 'Все объявления';
  $('#list-title').textContent = title;
  $('#chips').innerHTML = Object.entries(f).filter(([k]) => LABELS[k]).map(([k, v]) => `<button class="chip" data-k="${k}">${esc(chipText(k, v))}</button>`).join('');
  $('#results').innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('');
  try {
    const { items, total } = await api.searchListings({ ...f, page });
    $('#list-title').insertAdjacentHTML('beforeend', ` <small style="color:var(--muted);font-size:15px;font-weight:600">${total}</small>`);
    if (!items.length) {
      $('#results').innerHTML = `<div class="empty" style="grid-column:1/-1"><h2>Ничего не нашлось</h2><p>Попробуйте убрать часть фильтров.</p></div>`;
      $('#pager').innerHTML = ''; return;
    }
    const cards = items.map((l) => cardHTML(l, favs));
    if (cards.length > 6) cards.splice(6, 0, '<div class="ad-slot" id="ad-inline"></div>');
    $('#results').innerHTML = cards.join('');
    if ($('#ad-inline')) renderAds($('#ad-inline'), 'list_inline');
    $('#pager').innerHTML = pager(total, page, CONFIG.PAGE_SIZE);
  } catch (e) { toast(e.message, 'err'); $('#results').innerHTML = ''; }
}
$('#chips').addEventListener('click', (e) => {
  const k = e.target.dataset.k; if (!k) return;
  const el = form.elements[k]; if (el.type === 'checkbox') el.checked = false; else el.value = '';
  syncType(); go(current());
});
$('#pager').addEventListener('click', (e) => {
  const a = e.target.closest('[data-page]'); if (!a) return;
  e.preventDefault(); go({ ...current(), page: a.dataset.page }); scrollTo({ top: 0, behavior: 'smooth' });
});
load({ ...current(), page: p.page });
