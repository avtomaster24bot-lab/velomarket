import * as api from '../api.js';
import { CONFIG } from '../config.js';
import { $, $$, esc, layout, fmtPrice, timeAgo, renderAds, params, ICON, toast, brandName } from '../ui.js';

const me = await layout();
const id = Number(params().id);
const root = $('#lst-root');
let l = null;
try { l = id ? await api.getListing(id) : null; } catch (e) { toast(e.message, 'err'); }
if (!l) {
  root.innerHTML = `<div class="empty"><h1>Объявление не найдено</h1><p>Возможно, оно продано и снято, у него закончился срок показа или оно ещё на модерации.</p><a class="btn btn-primary" href="list.html">Все объявления</a></div>`;
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
  const expired = l.status === 'expired' || (l.status === 'approved' && l.expires_at && !api.isOn(l.expires_at));
  const statusNote = expired ? `<div class="warn-box" style="margin-bottom:12px">Срок показа истёк — покупатели не видят объявление. ${own ? '<a href="my.html">Продлить бесплатно в «Мои объявления»</a>' : ''}</div>`
    : l.status !== 'approved' ? `<div class="warn-box" style="margin-bottom:12px">Статус: <b>${api.STATUSES[l.status]}</b>${l.rejection_reason ? ` — ${esc(l.rejection_reason)}` : ''}. ${l.status === 'sold' ? '' : 'Покупатели пока не видят это объявление.'}</div>` : '';
  const top = l.featured && (!l.featured_until || api.isOn(l.featured_until));

  root.innerHTML = `
  <div class="crumbs"><a href="index.html">Главная</a> › <a href="list.html?category=${l.category}">${api.CATEGORIES[l.category]}</a>${l.brand_id ? ` › <a href="list.html?brand=${l.brand_id}">${esc(brandName(l))}</a>` : ''}</div>
  <div class="lst">
    <div>
      <div class="gallery">
        <div class="g-main" id="g-main"><img id="g-img" src="${esc(api.photoUrl(photos[0].path))}" alt="${esc(l.title)}">
          <button class="g-nav g-prev" aria-label="Назад"${photos.length > 1 ? '' : ' hidden'}>‹</button><button class="g-nav g-next" aria-label="Вперёд"${photos.length > 1 ? '' : ' hidden'}>›</button>
          <span class="g-count" id="g-count">1 / ${photos.length}</span></div>
        <div class="g-thumbs"${photos.length > 1 ? '' : ' hidden'}>${photos.map((p, i) => `<img src="${esc(api.photoUrl(p.path))}" data-i="${i}" class="${i ? '' : 'on'}" alt="" loading="lazy">`).join('')}</div>
      </div>
      <div class="panel" style="margin-top:14px"><h2>Характеристики</h2>
        <dl class="specs">${spec.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>
      <div class="panel"><h2>Описание</h2><div class="desc">${esc(l.description || 'Продавец не добавил описание.')}</div>
        <div class="stats"><span>${ICON.eye} ${l.views || 0} просмотров</span><span>Опубликовано ${timeAgo(l.published_at || l.created_at)}</span><span>№ ${l.id}</span></div></div>
    </div>
    <aside>
      <div class="panel">
        ${statusNote}
        <div class="badges" style="position:static;margin-bottom:6px">${top ? `<span class="badge hot">${ICON.star} Топ</span>` : ''}${api.isOn(l.urgent_until) ? '<span class="badge urgent">⚡ Срочно</span>' : ''}${api.isOn(l.shop_until) ? '<span class="badge shop">🏪 Магазин</span>' : ''}${l.condition === 'new' ? '<span class="badge new">Новый</span>' : ''}${l.status === 'sold' ? '<span class="badge sold">Продано</span>' : ''}</div>
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

  // галерея: фото + (если есть) последний слайд — реклама gallery_end (случайная из активных)
  const ads = await api.getAds('gallery_end').catch(() => []);
  const ad = ads.length ? ads[Math.floor(Math.random() * ads.length)] : null;
  const N = photos.length, total = N + (ad ? 1 : 0);
  const main = $('#g-main');
  if (ad) {
    $('.g-prev').hidden = false; $('.g-next').hidden = false;
    const th = $('.g-thumbs'); th.hidden = false;
    th.insertAdjacentHTML('beforeend', `<span class="g-thumb-ad" data-i="${N}" title="Реклама">Реклама</span>`);
  }
  const adHTML = (cls) => `<a class="${cls}" href="${esc(ad.url)}" target="_blank" rel="sponsored noopener" title="${esc(ad.title || 'Реклама')}"><img src="${esc(ad.image_url)}" alt="${esc(ad.title || 'Реклама')}"><span class="ad-label">Реклама</span></a>`;
  let cur = 0;
  const show = (i) => {
    cur = (i + total) % total;
    main.querySelector('.g-ad')?.remove();
    if (ad && cur === N) { main.insertAdjacentHTML('beforeend', adHTML('g-ad')); $('#g-count').hidden = true; }
    else { $('#g-img').src = api.photoUrl(photos[cur].path); $('#g-count').hidden = false; $('#g-count').textContent = `${cur + 1} / ${N}`; }
    main.querySelector('.g-ad') && main.append(...main.querySelectorAll('.g-nav, .g-count'));   // стрелки поверх рекламы
    $$('.g-thumbs [data-i]').forEach((t) => t.classList.toggle('on', +t.dataset.i === cur));
  };
  $('.g-prev').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); show(cur - 1); });
  $('.g-next').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); show(cur + 1); });
  $('.g-thumbs').addEventListener('click', (e) => { const t = e.target.closest('[data-i]'); if (t) show(+t.dataset.i); });
  const swipe = (el, go) => {
    let x0 = null;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) { el.dataset.swiped = '1'; setTimeout(() => delete el.dataset.swiped, 350); go(dx < 0 ? 1 : -1); } });
    el.addEventListener('click', (e) => { if (el.dataset.swiped) { e.preventDefault(); e.stopPropagation(); } }, true);
  };
  swipe(main, (d) => show(cur + d));
  // полноэкранный просмотр с листанием (реклама — тоже последним слайдом)
  let lb = null;
  const lbRender = () => {
    const isAd = ad && cur === N;
    lb.querySelector('.lb-body').innerHTML = isAd ? adHTML('lb-ad') : `<img src="${esc(api.photoUrl(photos[cur].path))}" alt="">`;
    lb.querySelector('.lb-count').textContent = isAd ? 'Реклама' : `${cur + 1} / ${N}`;
  };
  main.addEventListener('click', (e) => {
    if (e.target.closest('.g-ad, .g-nav')) return;
    lb = document.createElement('div'); lb.className = 'lightbox';
    lb.innerHTML = `<div class="lb-body"></div>${total > 1 ? '<button class="lb-nav lb-prev" aria-label="Назад">‹</button><button class="lb-nav lb-next" aria-label="Вперёд">›</button>' : ''}<span class="lb-count"></span><button class="lb-close" aria-label="Закрыть">×</button>`;
    lb.onclick = (ev) => {
      if (ev.target.closest('.lb-prev')) { show(cur - 1); lbRender(); return; }
      if (ev.target.closest('.lb-next')) { show(cur + 1); lbRender(); return; }
      if (ev.target.closest('a.lb-ad')) return;      // клик по рекламе — переход по ссылке
      lb.remove(); lb = null;
    };
    swipe(lb, (d) => { show(cur + d); lbRender(); });
    document.body.append(lb); lbRender();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { show(cur - 1); if (lb) lbRender(); }
    if (e.key === 'ArrowRight') { show(cur + 1); if (lb) lbRender(); }
    if (e.key === 'Escape' && lb) { lb.remove(); lb = null; }
  });

  // продавец
  const seller = await api.getSeller(l.id).catch(() => null);
  if (seller) {
    $('#seller').innerHTML = `<div class="ava">${esc((seller.first_name || seller.username || '?')[0])}</div>
      <div><b>${seller.is_shop && seller.shop_name ? `🏪 ${esc(seller.shop_name)}` : esc(seller.first_name || 'Продавец')}</b><small>${seller.username ? '@' + esc(seller.username) + ' · ' : ''}на сайте с ${new Date(seller.member_since).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</small>
        ${api.V2 && seller.username ? `<a class="seller-all" href="shop.html?u=${encodeURIComponent(seller.username)}">${seller.is_shop ? 'Все объявления магазина' : 'Все объявления продавца'}${seller.active_listings ? ` (${seller.active_listings})` : ''} →</a>` : ''}</div>`;
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
