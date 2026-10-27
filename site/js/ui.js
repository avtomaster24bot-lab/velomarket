export function adSrc(u) { return u && u.startsWith('assets/') ? u + (u.includes('?') ? '&' : '?') + 'v=3' : u; }
// Общие элементы интерфейса: шапка, подвал, карточки, баннеры, уведомления
import { CONFIG } from './config.js';
import * as api from './api.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const params = () => Object.fromEntries(new URLSearchParams(location.search));
const SYM = { KZT: '₸', RUB: '₽', USD: '$', EUR: '€', UZS: 'сум', KGS: 'сом', BYN: 'Br', CNY: '¥', GBP: '£', JPY: '¥' };
export function fmtPrice(v, cur = 'KZT') {
  const n = Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
  return ['USD', 'EUR', 'GBP'].includes(cur) ? `${SYM[cur]}${n}` : `${n} ${SYM[cur] || cur}`;
}
export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} мин назад`;
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
  if (s < 172800) return 'вчера';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
export const brandName = (l) => l.known_brands?.name || l.brand_other || '';
export const ICON = {
  heart: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.2 4.5 7 4.5c2.1 0 3.6 1.1 5 2.8 1.4-1.7 2.9-2.8 5-2.8 3.8 0 6 3.8 4.5 7.3C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L21 7.5l-1.4-1.4z" fill="currentColor"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.8-4.8 1.4 1.4-6.2 6.2z" fill="currentColor"/></svg>',
  tg: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M21.9 4.3 18.7 19.5c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.2-8.3c.4-.4-.1-.6-.6-.2L6.2 13.2l-4.9-1.5c-1-.3-1.1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3z" fill="currentColor"/></svg>',
  filter: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 5h18l-7 8v6l-4 2v-8z" fill="currentColor"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>',
  eye: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="m12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.1-.6L12 2 9.1 8.7 2 9.3l5.4 4.7-1.6 7z" fill="currentColor"/></svg>',
};

export function toast(msg, type = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg; box.append(t);
  setTimeout(() => t.classList.add('hide'), 3800); setTimeout(() => t.remove(), 4300);
}

export function cardHTML(l, favs = new Set()) {
  const fav = favs.has(l.id);
  const meta = [l.year, l.bike_type || api.CATEGORIES[l.category], l.wheel_size].filter(Boolean).map(esc).join(' · ');
  const top = l.featured && (!l.featured_until || api.isOn(l.featured_until));
  return `<article class="card${top ? ' is-featured' : ''}${api.isOn(l.highlight_until) ? ' is-highlight' : ''}">
    <a class="card-img" href="listing.html?id=${l.id}">
      <img src="${esc(api.photoUrl(l.cover_path))}" alt="${esc(l.title)}" loading="lazy">
      <div class="badges">
        ${top ? `<span class="badge hot">${ICON.star} Топ</span>` : ''}
        ${api.isOn(l.urgent_until) ? '<span class="badge urgent">⚡ Срочно</span>' : ''}
        ${api.isOn(l.shop_until) ? '<span class="badge shop">🏪 Магазин</span>' : ''}
        ${l.verified ? `<span class="badge ok">${ICON.check} Проверено</span>` : ''}
        ${l.condition === 'new' ? '<span class="badge new">Новый</span>' : ''}
        ${l.status === 'sold' ? '<span class="badge sold">Продано</span>' : ''}
      </div>
    </a>
    <button class="fav${fav ? ' on' : ''}" data-fav="${l.id}" aria-label="В избранное" title="В избранное">${ICON.heart}</button>
    <a class="card-body" href="listing.html?id=${l.id}">
      <div class="price">${fmtPrice(l.price, l.currency)}${l.currency !== 'KZT' ? `<small> ≈ ${fmtPrice(l.price_kzt, 'KZT')}</small>` : ''}</div>
      <h3>${esc(l.title)}</h3>
      <div class="meta">${meta}</div>
      <div class="loc">${ICON.pin} ${esc(l.city)}, ${esc(l.country)} <span>${timeAgo(l.published_at || l.created_at)}</span></div>
    </a>
  </article>`;
}

export function bindFavs(root, favs) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    e.preventDefault();
    const id = Number(b.dataset.fav); const on = !b.classList.contains('on');
    try { await api.toggleFavorite(id, on); b.classList.toggle('on', on); on ? favs.add(id) : favs.delete(id); toast(on ? 'Добавлено в избранное' : 'Убрано из избранного'); }
    catch (err) { toast(err.message, 'err'); if (/Войдите/.test(err.message)) setTimeout(() => location.href = 'login.html?next=' + encodeURIComponent(location.href), 900); }
  });
}

export async function renderAds(slotEl, slot) {
  const ads = await api.getAds(slot).catch(() => []);
  if (!ads.length) { slotEl.hidden = true; return; }
  slotEl.innerHTML = `<span class="ad-label">Реклама</span>` + ads.map((a, i) =>
    `<a class="ad${i ? '' : ' on'}" href="${esc(a.url)}" target="_blank" rel="sponsored noopener"><img src="${esc(adSrc(a.image_url))}" alt="${esc(a.title || 'Реклама')}" loading="lazy"></a>`).join('');
  if (ads.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let i = 0; const items = $$('.ad', slotEl);
    setInterval(() => { items[i].classList.remove('on'); i = (i + 1) % items.length; items[i].classList.add('on'); }, 6000);
  }
}

export async function layout(active = '') {
  const me = await api.getMe().catch(() => null);
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    ${api.SETUP_PENDING ? `<div class="demo-bar">🔧 Сайт настраивается: база данных подключается. Пока показаны ДЕМО-объявления (ненастоящие).</div>`
      : api.IS_DEMO ? `<div class="demo-bar">ДЕМО-режим: все объявления ненастоящие, картинки — иллюстрации. Подключите Supabase в <code>js/config.js</code>.</div>` : ''}
    <div class="wrap hdr">
      <a class="logo" href="index.html"><img src="assets/logo.svg" alt="" width="36" height="36"><span>${esc(CONFIG.SITE_NAME)}</span></a>
      <form class="hdr-search" action="list.html"><input name="q" type="search" placeholder="Trek, Giant, вилка Fox…" aria-label="Поиск"><button aria-label="Найти">Найти</button></form>
      <nav class="hdr-nav">
        <a href="list.html?category=bike" class="${active === 'bike' ? 'on' : ''}">Велосипеды</a>
        <a href="list.html?category=part" class="${active === 'part' ? 'on' : ''}">Запчасти</a>
        <a href="favorites.html" class="ico ${active === 'fav' ? 'on' : ''}" title="Избранное">${ICON.heart}<span class="hide-sm">Избранное</span></a>
        ${me ? `<a href="my.html" class="user ${active === 'my' ? 'on' : ''}"><i>${esc((me.first_name || me.username || '?')[0])}</i><span class="hide-sm">${esc(me.first_name || me.username || 'Кабинет')}</span></a>`
             : `<a href="login.html" class="login">${ICON.tg}<span>Войти</span></a>`}
        ${me?.is_admin ? `<a href="admin.html" class="admin-link ${active === 'admin' ? 'on' : ''}">Модерация</a>` : ''}
        <a href="new.html" class="btn btn-accent post">+ Подать<span class="hide-sm"> объявление</span></a>
      </nav>
    </div>`;
  document.body.prepend(header);
  if (me?._profileError) {
    const bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.style.cssText = 'background:#fdecec;color:#b42318;border-color:#f3c4c4';
    bar.innerHTML = `Не удалось загрузить профиль (${esc(me._profileError)}). <button class="btn btn-sm btn-danger" id="bar-logout" style="margin-left:6px">Выйти и войти снова</button>`;
    header.prepend(bar);
    bar.querySelector('#bar-logout').onclick = async () => { await api.logout(); location.href = 'login.html'; };
  }
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `<div class="wrap foot">
    <div><b>${esc(CONFIG.SITE_NAME)}</b><p>${esc(CONFIG.SITE_TAGLINE)}. Каждое объявление проверяет модератор: реплики и подделки не публикуются.</p></div>
    <div><a href="list.html">Все объявления</a><a href="rules.html">Правила и проверка подлинности</a><a href="rules.html#data">Какие данные мы храним</a><a href="new.html">Подать объявление</a><a href="advertise.html">Реклама и платные услуги</a></div>
    <div><a href="https://t.me/${esc(CONFIG.SUPPORT_TELEGRAM)}" target="_blank" rel="noopener">${ICON.tg} Поддержка и реклама</a><small>© ${new Date().getFullYear()} ${esc(CONFIG.SITE_NAME)}</small></div>
  </div>`;
  document.body.append(footer);
  document.title = document.title.replace('VeloMarket', CONFIG.SITE_NAME);
  return me;
}

// Редирект с защитой от петли: не больше 3 переходов за 15 секунд, иначе — сообщение вместо перехода
export function safeRedirect(url) {
  const key = 'velomarket-redirects';
  let log = [];
  try { log = JSON.parse(sessionStorage.getItem(key) || '[]').filter((t) => Date.now() - t < 15000); } catch { /* ignore */ }
  if (log.length >= 3) {
    showFatal('Не удалось открыть страницу автоматически. Нажмите ссылку ниже или выйдите и войдите снова.', url);
    return false;
  }
  log.push(Date.now());
  try { sessionStorage.setItem(key, JSON.stringify(log)); } catch { /* ignore */ }
  location.replace(url);
  return true;
}
export function showFatal(msg, link) {
  const main = document.querySelector('main');
  if (!main) return;
  main.innerHTML = `<div class="wrap empty"><h1>Что-то пошло не так</h1><p>${esc(msg)}</p>
    ${link ? `<p><a class="btn btn-primary" href="${esc(link)}">Продолжить</a></p>` : ''}
    <p><button class="btn btn-ghost" id="fatal-logout">Выйти из аккаунта</button></p></div>`;
  document.getElementById('fatal-logout').onclick = async () => { await api.logout(); location.href = 'index.html'; };
}

export function pager(total, page, size, onGo) {
  const pages = Math.ceil(total / size);
  if (pages <= 1) return '';
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i); else if (nums.at(-1) !== '…') nums.push('…');
  return `<nav class="pager">${page > 1 ? `<a href="#" data-page="${page - 1}">‹</a>` : ''}${nums.map((n) => n === '…' ? '<span>…</span>' : `<a href="#" data-page="${n}" class="${n === page ? 'on' : ''}">${n}</a>`).join('')}${page < pages ? `<a href="#" data-page="${page + 1}">›</a>` : ''}</nav>`;
}

export function needLogin(me) {
  if (me) return false;
  document.querySelector('main').innerHTML = `<div class="wrap empty"><h1>Нужно войти</h1><p>Войдите через Telegram — это одна кнопка, без паролей.</p><a class="btn btn-primary" href="login.html?next=${encodeURIComponent(location.href)}">${ICON.tg} Войти через Telegram</a></div>`;
  return true;
}

// Диалог заказа платной услуги: создаёт заявку и даёт кнопку «Открыть Telegram» с готовым текстом.
export function fmtKZT(n) { return `${Number(n || 0).toLocaleString('ru-RU')} ₸`; }
export async function orderDialog({ service, listing = null, askNote = null }) {
  let dlg = document.getElementById('order-dlg');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'order-dlg'; document.body.append(dlg); }
  dlg.innerHTML = `<form method="dialog">
    <h3>${esc(service.title)} — ${fmtKZT(service.price_kzt)}${service.duration_days ? ` <small style="font-weight:600;color:var(--muted)">/ ${service.duration_days} дн.</small>` : ''}</h3>
    <p class="hint" style="margin:0 0 10px">${esc(service.description || '')}</p>
    ${listing ? `<p style="margin:0 0 10px">Объявление <b>№ ${listing.id}</b>: ${esc(listing.title)}</p>` : ''}
    ${askNote ? `<div class="field"><label for="od-note">${esc(askNote.label)}</label><input id="od-note" maxlength="${askNote.max || 60}" value="${esc(askNote.value || '')}" placeholder="${esc(askNote.placeholder || '')}" ${askNote.required ? 'required minlength="2"' : ''}></div>` : ''}
    <ol class="pay-steps"><li>Нажмите «Заказать» — откроется чат с менеджером в Telegram с готовым сообщением.</li>
      <li>Отправьте сообщение и оплатите ${esc(CONFIG.PAY_HOW || 'Kaspi-переводом')}.</li>
      <li>Администратор включит услугу — обычно в течение нескольких часов.</li></ol>
    <div class="od-result" hidden></div>
    <div class="btns"><button value="cancel" class="btn btn-ghost" formnovalidate>Закрыть</button><button value="ok" class="btn btn-accent" id="od-go">Заказать</button></div>
  </form>`;
  dlg.showModal();
  const go = dlg.querySelector('#od-go');
  go.onclick = async (e) => {
    e.preventDefault();
    const noteEl = dlg.querySelector('#od-note');
    if (noteEl && !noteEl.reportValidity()) return;
    const note = noteEl?.value.trim() || null;
    go.disabled = true; go.textContent = 'Создаём заявку…';
    try {
      const orderId = await api.orderService(service.code, listing?.id || null, note);
      const { url, text } = api.payLink({ orderId, service, listing, note });
      const box = dlg.querySelector('.od-result'); box.hidden = false;
      box.innerHTML = `<div class="verified-box" style="margin:8px 0 0"><div><b>Заявка № ${orderId} создана.</b> Откройте Telegram и отправьте сообщение — там же договоритесь об оплате.</div></div>
        <a class="btn btn-tg btn-block" style="margin-top:10px" href="${esc(url)}" target="_blank" rel="noopener">${ICON.tg} Открыть Telegram и оплатить</a>
        <button type="button" class="btn btn-ghost btn-block btn-sm" style="margin-top:6px" id="od-copy">Скопировать текст сообщения</button>`;
      box.querySelector('#od-copy').onclick = () => navigator.clipboard?.writeText(text).then(() => toast('Текст скопирован'));
      go.remove();
      window.open(url, '_blank', 'noopener');
      dlg.dispatchEvent(new CustomEvent('ordered', { detail: { orderId } }));
    } catch (err) { toast(err.message, 'err'); go.disabled = false; go.textContent = 'Заказать'; }
  };
  return dlg;
}

// Быстрая правка цены и текста объявления: mode 'admin' (статус не меняется) или 'owner' (уходит на модерацию)
export function editListingDialog(l, mode = 'owner', onSaved = () => {}) {
  let dlg = document.getElementById('edit-dlg');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'edit-dlg'; dlg.className = 'edit-dlg'; document.body.append(dlg); }
  const admin = mode === 'admin';
  const brand = brandName(l);
  const opt = (arr, v) => arr.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const warn = admin
    ? `<p class="hint" style="margin:0 0 12px">Вы правите как администратор — статус объявления («${esc(api.STATUSES[l.status] || l.status)}») не изменится.</p>`
    : ['approved', 'expired'].includes(l.status)
      ? '<p class="warn-box" style="margin:0 0 12px">⚠ После изменения объявление снова уйдёт на модерацию и будет скрыто из каталога, пока модератор его не одобрит.</p>'
      : l.status === 'pending' ? '<p class="hint" style="margin:0 0 12px">Объявление уже на модерации — модератор увидит новую версию.</p>' : '';
  dlg.innerHTML = `<form method="dialog" novalidate>
    <h3>Редактировать объявление <small style="font-weight:600;color:var(--muted)">№ ${l.id}</small></h3>
    ${warn}
    <div class="field"><label for="ed-model">Модель${brand ? ` <span class="hint">(название: «${esc(brand)} + модель»)</span>` : ''}</label>
      <input id="ed-model" name="model" maxlength="120" required value="${esc(l.model || '')}"></div>
    <div class="row">
      <div class="field"><label for="ed-price">Цена</label><input id="ed-price" name="price" type="number" inputmode="numeric" min="0" step="1" required value="${esc(l.price != null ? Math.round(Number(l.price)) : '')}"></div>
      <div class="field"><label for="ed-cur">Валюта</label><select id="ed-cur" name="currency">${opt(api.CURRENCIES, l.currency || 'KZT')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label for="ed-cond">Состояние</label><select id="ed-cond" name="condition">${Object.entries(api.CONDITIONS).map(([k, v]) => `<option value="${k}"${k === l.condition ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="ed-year">Год</label><input id="ed-year" name="year" type="number" inputmode="numeric" min="1950" max="2100" value="${esc(l.year || '')}"></div>
    </div>
    ${l.category === 'bike' ? `<div class="field"><label for="ed-type">Тип велосипеда</label><select id="ed-type" name="bike_type">${opt(api.BIKE_TYPES, l.bike_type)}</select></div>` : ''}
    <div class="row">
      <div class="field"><label for="ed-frame">Размер рамы</label><input id="ed-frame" name="frame_size" maxlength="20" value="${esc(l.frame_size || '')}"></div>
      <div class="field"><label for="ed-wheel">Размер колёс</label><input id="ed-wheel" name="wheel_size" maxlength="20" value="${esc(l.wheel_size || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label for="ed-city">Город</label><input id="ed-city" name="city" maxlength="80" required value="${esc(l.city || '')}"></div>
      <div class="field"><label for="ed-country">Страна</label><select id="ed-country" name="country">${opt(api.COUNTRIES.includes(l.country) ? api.COUNTRIES : [l.country, ...api.COUNTRIES], l.country)}</select></div>
    </div>
    <div class="field"><label for="ed-desc">Описание</label><textarea id="ed-desc" name="description" maxlength="5000">${esc(l.description || '')}</textarea></div>
    ${admin ? '' : `<p class="hint" style="margin:-6px 0 0">Фото и серийный номер — в <a href="new.html?id=${l.id}">полной форме</a>.</p>`}
    <div class="ed-err reason" hidden></div>
    <div class="btns"><button value="cancel" class="btn btn-ghost" formnovalidate>Отмена</button>
      <button value="ok" class="btn ${admin ? 'btn-primary' : 'btn-accent'}" id="ed-save">${admin || !['approved', 'expired'].includes(l.status) ? 'Сохранить' : 'Сохранить и отправить на модерацию'}</button></div>
  </form>`;
  dlg.showModal();
  const f = dlg.querySelector('form'); const btn = dlg.querySelector('#ed-save'); const err = dlg.querySelector('.ed-err');
  const fail = (m) => { err.hidden = false; err.textContent = m; };
  btn.onclick = async (e) => {
    e.preventDefault(); err.hidden = true;
    const v = (n) => f.elements[n]?.value.trim();
    if (!v('model')) return fail('Укажите модель');
    if (v('price') === '' || !(Number(v('price')) >= 0)) return fail('Укажите цену (число, 0 или больше)');
    if (v('year') && !(Number(v('year')) >= 1950 && Number(v('year')) <= 2100)) return fail('Год — от 1950 до 2100');
    if (!v('city')) return fail('Укажите город');
    const fields = { model: v('model'), price: Number(v('price')), currency: v('currency'), condition: v('condition'),
      year: v('year') ? Number(v('year')) : null, frame_size: v('frame_size'), wheel_size: v('wheel_size'),
      city: v('city'), country: v('country'), description: v('description') };
    if (l.category === 'bike') fields.bike_type = v('bike_type');
    btn.disabled = true; const t = btn.textContent; btn.textContent = 'Сохраняем…';
    try {
      const res = await api.quickEditListing(l.id, fields);
      dlg.close('saved');
      onSaved(res);
      toast(!admin && res.status === 'pending' ? 'Сохранено. Статус: «На модерации»' : 'Изменения сохранены');
    } catch (ex) { fail(ex.message); btn.disabled = false; btn.textContent = t; }
  };
  return dlg;
}
