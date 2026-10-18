import * as api from '../api.js';
import { $, esc, layout, cardHTML, bindFavs, params, toast, pager, ICON } from '../ui.js';
import { CONFIG } from '../config.js';

await layout();
const root = $('#shop-root');
const u = (params().u || '').replace(/^@/, '').trim();
const shop = u ? await api.getShop(u).catch(() => null) : null;
if (!shop) {
  root.innerHTML = `<div class="empty"><h1>Продавец не найден</h1><p>${api.V2 ? 'Возможно, у него сейчас нет активных объявлений.' : 'Страницы продавцов скоро заработают.'}</p><a class="btn btn-primary" href="list.html">Все объявления</a></div>`;
} else {
  const name = shop.is_shop && shop.shop_name ? shop.shop_name : (shop.first_name || shop.username);
  document.title = `${name} — ${CONFIG.SITE_NAME}`;
  root.innerHTML = `<div class="seller shop-head"><div class="ava">${shop.is_shop ? '🏪' : esc((name || '?')[0])}</div>
      <div style="flex:1"><h1 style="margin:0;font-size:22px">${esc(name)} ${shop.is_shop ? '<span class="badge shop" style="vertical-align:middle">🏪 Магазин</span>' : ''}</h1>
        <small>@${esc(shop.username)} · на сайте с ${new Date(shop.member_since).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} · активных объявлений: ${shop.active_listings}</small></div>
      <a class="btn btn-tg" href="https://t.me/${encodeURIComponent(shop.username)}" target="_blank" rel="noopener">${ICON.tg} Написать</a></div>
    <div class="grid" id="shop-grid"></div><div id="pager"></div>`;
  const favs = await api.favoriteIds().catch(() => new Set());
  bindFavs($('#shop-grid'), favs);
  const load = async (page = 1) => {
    try {
      const { items, total } = await api.searchListings({ user: shop.user_id, page });
      $('#shop-grid').innerHTML = items.length ? items.map((l) => cardHTML(l, favs)).join('') : '<div class="empty" style="grid-column:1/-1"><h2>Сейчас нет активных объявлений</h2></div>';
      $('#pager').innerHTML = pager(total, page, CONFIG.PAGE_SIZE);
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#pager').addEventListener('click', (e) => { const a = e.target.closest('[data-page]'); if (!a) return; e.preventDefault(); load(+a.dataset.page); scrollTo({ top: 0, behavior: 'smooth' }); });
  load();
}
