import * as api from '../api.js';
import { CONFIG } from '../config.js';
import { $, $$, esc, layout, fmtPrice, timeAgo, renderAds, params, ICON, toast, brandName } from '../ui.js';

const me = await layout();
const id = Number(params().id);
const root = $('#lst-root');
let l = null;
try { l = id ? await api.getListing(id) : null; } catch (e) { toast(e.message, 'err'); }
if (!l) {
  root.innerHTML = `<div class="empty"><h1>Объявление не найдено</h1><p>Возможно, оно снято с продажи или ещё на модерации.</p><a class="btn btn-primary" href="list.html">Все объявления</a></div>`;
} else render();

async function render() {
  document.title = `${l.title} — ${fmtPrice(l.price, l.currency)} — ${CONFIG.SITE_NAME}`;
  const photos = l.listing_photos?.length ? l.listing_photos : [{ path: l.cover_path }];
  const own = me && (me.id === l.user_id);
  const spec = [
    ['Категория', api.CATEGORIES[l.category]], ['Бренд', brandName(l) + (l.known_brands?.country ? ` (${l.known_brands.country})` : '')],
    ['Модель', l.model], ['Год', l.year], ['Тип', l.bike_type], ['Размер рамы', l.frame_size], ['Колёса', l.wheel_size],
    ['Состояние', api.CONDITIONS[l.condition]], ['Город', `${l.city}, ${l.country}`],
  ].filter(([, v]) => v);
  const statusNote = l.status !== 'approved' ? `<div class="warn-box" style="margin-bottom:12px">Статус: <b>${api.STATUSES[l.status]}</b>${l.rejection_reason ? ` — ${esc(l.rejection_reason)}` : ''}. ${l.status === 'sold' ? '' : 'Покупатели пока не видят это объявление.'}</div>` : '';

  root.innerHTML = `
  <div class="crumbs"><a href="index.html">Главная</a> › <a href="list.html?category=${l.category}">${api.CATEGORIES[l.category]}</a>${l.brand_id ? ` › <a href="list.html?brand=${l.brand_id}">${esc(brandName(l))}</a>` : ''}</div>
  <div class="lst">
    <div>
      <div class="gallery">
        <div class="g-main" id="g-main"><img id="g-img" src="${esc(api.photoUrl(photos[0].path))}" alt="${esc(l.title)}">
          ${photos.length > 1 ? '<button class="g-nav g-prev" aria-label="Назад">‹</button><button class="g-nav g-next" aria-label="Вперёд">›</button>' : ''}
          <span class="g-count" id="g-count">1 / ${photos.length}</span></div>
        ${photos.length > 1 ? `<div class="g-thumbs">${photos.map((p, i) => `<img src="${esc(api.photoUrl(p.path))}" data-i="${i}" class="${i ? '' : 'on'}" alt="" loading="lazy">`).join('')}</div>` : ''}
      </div>
      <div class="panel" style="margin-top:14px"><h2>Характеристики</h2>
        <dl class="specs">${spec.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>
      <div class="panel"><h2>Описание</h2><div class="desc">${esc(l.description || 'Продавец не добавил описание.')}</div>
        <div class="stats"><span>${ICON.eye} ${l.views || 0} просмотров</span><span>Опубликовано ${timeAgo(l.published_at || l.created_at)}</span><span>№ ${l.id}</span></div></div>
    </div>
    <aside>
      <div class="panel">
        ${statusNote}
        <div class="badges" style="position:static;margin-bottom:6px">${l.featured ? `<span class="badge hot">${ICON.star} Топ</span>` : ''}${l.condition === 'new' ? '<span class="badge new">Новый</span>' : ''}${l.status === 'sold' ? '<span class="badge sold">Продано</span>' : ''}</div>
        <h1 class="l-title">${esc(l.title)}</h1>
        <div class="l-price">${fmtPrice(l.price, l.currency)}${l.currency !== 'KZT' ? `<small>≈ ${fmtPrice(l.price_kzt, 'KZT')} по курсу площадки</small>` : ''}</div>
        ${l.verified ? `<div class="verified-box">${ICON.shield}<div><b>Проверено модератором</b><br>Серийный номер и фото бренда сверены.</div></div>`
          : `<div class="verified-box" style="background:#f3f6f8;color:var(--ink2)">${ICON.shield}<div>Прошло модерацию. Значок «Проверено» не ставился — осмотрите номер рамы при встрече.</div></div>`}
        <div class="seller" id="seller"></div>
        <div class="actions">
          <a class="btn btn-tg btn-block" id="tg-btn" href="#" target="_blank" rel="noopener">${ICON.tg} Написать продавцу в Telegram</a>
          <button class="btn btn-ghost btn-block" id="fav-btn">${ICON.heart} В избранное</button>
          ${own ? `<a class="btn btn-primary btn-block" href="new.html?id=${l.id}">Редактировать</a>` : `<button class="btn btn-danger btn-block btn-sm" id="report-btn">Пожаловаться</button>`}
        </div>
      </div>
      <div class="panel warn-box" style="margin-top:14px"><b>Безопасная сделка:</b> осмотрите велосипед лично, сверьте номер рамы, не вносите предоплату незнакомцам.</div>
      <div class="ad-slot" id="ad-side" style="margin-top:14px"></div>
    </aside>
  </div>`;

  // галерея
  let cur = 0;
  const show = (i) => { cur = (i + photos.length) % photos.length; $('#g-img').src = api.photoUrl(photos[cur].path); $('#g-count').textContent = `${cur + 1} / ${photos.length}`; $$('.g-thumbs img').forEach((t, j) => t.classList.toggle('on', j === cur)); };
  $('.g-prev')?.addEventListener('click', (e) => { e.stopPropagation(); show(cur - 1); });
  $('.g-next')?.addEventListener('click', (e) => { e.stopPropagation(); show(cur + 1); });
  $('.g-thumbs')?.addEventListener('click', (e) => { if (e.target.dataset.i) show(+e.target.dataset.i); });
  let x0 = null;
  $('#g-main').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  $('#g-main').addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
  $('#g-main').addEventListener('click', () => {
    const lb = document.createElement('div'); lb.className = 'lightbox';
    lb.innerHTML = `<img src="${esc(api.photoUrl(photos[cur].path))}" alt=""><button aria-label="Закрыть">×</button>`;
    lb.onclick = () => lb.remove(); document.body.append(lb);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); if (e.key === 'Escape') $('.lightbox')?.remove(); });

  // продавец
  const seller = await api.getSeller(l.id).catch(() => null);
  if (seller) {
    $('#seller').innerHTML = `<div class="ava">${esc((seller.first_name || seller.username || '?')[0])}</div>
      <div><b>${esc(seller.first_name || 'Продавец')}</b><small>${seller.username ? '@' + esc(seller.username) + ' · ' : ''}на сайте с ${new Date(seller.member_since).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</small></div>`;
  }
  const tg = $('#tg-btn');
  if (seller?.username) {
    tg.href = `https://t.me/${encodeURIComponent(seller.username)}`;
  } else {
    tg.classList.add('btn-ghost'); tg.classList.remove('btn-tg'); tg.removeAttribute('target');
    tg.innerHTML = 'Продавец сейчас недоступен в Telegram';
    tg.onclick = (e) => e.preventDefault();
  }
  const favs = await api.favoriteIds().catch(() => new Set());
  const fb = $('#fav-btn');
  const syncFav = () => { fb.innerHTML = `${ICON.heart} ${favs.has(l.id) ? 'В избранном' : 'В избранное'}`; fb.style.color = favs.has(l.id) ? '#ff3d68' : ''; };
  syncFav();
  fb.onclick = async () => {
    const on = !favs.has(l.id);
    try { await api.toggleFavorite(l.id, on); on ? favs.add(l.id) : favs.delete(l.id); syncFav(); }
    catch (err) { toast(err.message, 'err'); if (/Войдите/.test(err.message)) location.href = 'login.html?next=' + encodeURIComponent(location.href); }
  };

  // жалоба
  const dlg = $('#report-dlg');
  $('#r-reason').innerHTML = Object.entries(api.REPORT_REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#report-btn')?.addEventListener('click', () => {
    if (!me) { location.href = 'login.html?next=' + encodeURIComponent(location.href); return; }
    dlg.showModal();
  });
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'send') return;
    try { await api.sendReport(l.id, $('#r-reason').value, $('#r-comment').value.trim()); toast('Спасибо! Модератор проверит объявление.'); }
    catch (err) { toast(err.message, 'err'); }
  });

  renderAds($('#ad-side'), 'listing_side');
  api.incrementView(l.id).catch(() => {});
}
