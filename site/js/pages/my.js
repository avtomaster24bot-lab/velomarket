import * as api from '../api.js';
import { $, esc, layout, fmtPrice, timeAgo, params, toast, needLogin, orderDialog, fmtKZT } from '../ui.js';

const me = await layout('my');
const root = $('#my-root');
if (!needLogin(me)) {
  const sent = params().sent;
  const [services, settings] = await Promise.all([api.listServices(), api.getSettings()]);
  const svc = Object.fromEntries(services.map((s) => [s.code, s]));
  const shopSvc = svc.shop?.active ? svc.shop : null;
  const isShop = api.isOn(me.shop_until);
  root.innerHTML = `
    ${sent ? `<div class="verified-box" style="margin-bottom:14px"><b>Объявление отправлено на модерацию.</b>&nbsp;Обычно проверка занимает до 24 часов. После одобрения оно появится в каталоге.</div>` : ''}
    <div class="panel profile-card">
      <div class="seller" style="margin:0;flex:1;min-width:220px"><div class="ava">${esc((me.first_name || me.username || '?')[0])}</div>
        <div><b>${esc(me.first_name || '')}${isShop && me.shop_name ? ` · 🏪 ${esc(me.shop_name)}` : ''}</b><small>${me.username ? '@' + esc(me.username) + ' · покупатели пишут вам в Telegram' : '⚠ нет username в Telegram'}</small></div></div>
      ${me.username ? `<a class="btn btn-ghost btn-sm" href="shop.html?u=${encodeURIComponent(me.username)}">Моя страница</a>` : ''}
      ${me.is_admin ? '<a class="btn btn-primary btn-sm" href="admin.html">Модерация</a>' : ''}
      <button class="btn btn-ghost btn-sm" id="logout">Выйти</button>
    </div>
    ${!me.username ? `<div class="reason" style="margin-top:12px;padding:12px">Укажите username в настройках Telegram, чтобы покупатели могли вам написать (Настройки → Изменить профиль → Имя пользователя). Затем нажмите «Выйти» и войдите снова — без username подать объявление нельзя.</div>` : ''}
    ${api.V2 && shopSvc ? `<div class="panel" style="margin-top:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px"><b>🏪 Магазин</b> ${isShop ? `<span class="badge st-approved">активен ещё ${api.daysLeft(me.shop_until)} дн.</span>` : ''}
        <div class="hint" style="margin:2px 0 0">${esc(shopSvc.description)}. ${fmtKZT(shopSvc.price_kzt)} / ${shopSvc.duration_days} дн.</div></div>
      <button class="btn ${isShop ? 'btn-ghost' : 'btn-accent'} btn-sm" id="shop-btn">${isShop ? 'Продлить магазин' : 'Открыть магазин'}</button></div>` : ''}
    <div class="list-top" style="margin-top:20px"><h1>Мои объявления</h1><a class="btn btn-accent" href="new.html">+ Подать объявление</a></div>
    ${api.V2 ? `<p class="hint" style="margin-top:-6px">Объявление показывается ${settings.listing_days} дней. Потом его можно бесплатно продлить кнопкой «Продлить» (за ${settings.renew_window_days} дн. до конца срока или после).${settings.free_listing_limit ? ` Бесплатно — до ${settings.free_listing_limit} активных объявлений.` : ''}</p>` : ''}
    <div id="my-list"><div class="skeleton" style="aspect-ratio:auto;height:96px"></div></div>
    <div id="my-orders"></div>`;

  $('#logout').onclick = async () => { await api.logout(); location.href = 'index.html'; };
  $('#shop-btn')?.addEventListener('click', async () => {
    const d = await orderDialog({ service: shopSvc, askNote: { label: 'Название магазина', placeholder: 'Например: ВелоМастер Алматы', value: me.shop_name || '', required: true, max: 60 } });
    d.addEventListener('ordered', () => loadOrders(), { once: true });
  });

  const PROMO = ['top', 'auto_renew', 'bump', 'highlight', 'urgent', 'extra_listing'];
  const UNTIL = { top: 'featured_until', auto_renew: 'auto_renew_until', highlight: 'highlight_until', urgent: 'urgent_until', extra_listing: 'paid_slot_until' };
  let items = [], orders = [];

  function expiryLine(l) {
    if (!api.V2 || !['approved', 'expired'].includes(l.status)) return '';
    if (api.isOn(l.auto_renew_until)) return `<div class="exp">🔄 Автопродление ещё ${api.daysLeft(l.auto_renew_until)} дн. — объявление не снимется по сроку</div>`;
    if (l.status === 'expired' || !api.isOn(l.expires_at)) return `<div class="exp bad">Срок показа истёк — объявление скрыто из каталога. Нажмите «Продлить» (бесплатно).</div>`;
    const d = api.daysLeft(l.expires_at);
    return `<div class="exp${d <= settings.renew_window_days ? ' warn' : ''}">В каталоге до ${new Date(l.expires_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} · осталось ${d} дн.</div>`;
  }
  const canRenew = (l) => api.V2 && ['approved', 'expired'].includes(l.status) && !api.isOn(l.auto_renew_until)
    && (!l.expires_at || api.daysLeft(l.expires_at) <= settings.renew_window_days || l.status === 'expired');
  function promoBlock(l) {
    if (!api.V2 || ['sold', 'rejected'].includes(l.status)) return '';
    const list = PROMO.map((c) => svc[c]).filter((s) => s?.active && (s.code !== 'extra_listing' || settings.free_listing_limit));
    if (!list.length) return '';
    return `<div class="promo"><div class="promo-h">Продвинуть${l.status !== 'approved' ? ' · включится после публикации' : ''}</div><div class="promo-btns">${list.map((s) => {
      const until = UNTIL[s.code] && l[UNTIL[s.code]];
      const wait = orders.find((o) => o.listing_id === l.id && o.service === s.code && ['requested', 'paid'].includes(o.status));
      if (api.isOn(until)) return `<button class="on" data-promo="${s.code}" data-id="${l.id}" title="Продлить">${esc(s.title)} <small>ещё ${api.daysLeft(until)} дн. · продлить</small></button>`;
      if (wait) return `<button class="wait" data-promo="${s.code}" data-id="${l.id}" title="Заявка ждёт оплаты">${esc(s.title)} <small>заявка № ${wait.id} ждёт оплаты</small></button>`;
      return `<button data-promo="${s.code}" data-id="${l.id}">${esc(s.title)} <small>${fmtKZT(s.price_kzt)}${s.duration_days ? ` / ${s.duration_days} дн.` : ''}</small></button>`;
    }).join('')}</div></div>`;
  }

  async function load() {
    [items, orders] = await Promise.all([api.myListings().catch((e) => { toast(e.message, 'err'); return []; }), api.myOrders().catch(() => [])]);
    $('#my-list').innerHTML = items.length ? items.map((l) => `
      <div class="my-item">
        <a href="listing.html?id=${l.id}"><img src="${esc(api.photoUrl(l.cover_path))}" alt=""></a>
        <div><span class="badge st-${l.status === 'approved' && api.V2 && l.expires_at && !api.isOn(l.expires_at) ? 'expired' : l.status}">${api.STATUSES[l.status === 'approved' && api.V2 && l.expires_at && !api.isOn(l.expires_at) ? 'expired' : l.status]}</span>${l.verified ? ' <span class="badge ok">✓ Проверено</span>' : ''}${l.featured && (!l.featured_until || api.isOn(l.featured_until)) ? ' <span class="badge hot">Топ</span>' : ''}${api.isOn(l.urgent_until) ? ' <span class="badge urgent">Срочно</span>' : ''}
          <h3><a href="listing.html?id=${l.id}" style="color:inherit">${esc(l.title)}</a></h3>
          <div class="price" style="font-size:15px">${fmtPrice(l.price, l.currency)}</div>
          <div class="meta">${l.views || 0} просмотров · создано ${timeAgo(l.created_at)} · № ${l.id}</div>
          ${expiryLine(l)}
          ${l.rejection_reason && l.status === 'rejected' ? `<div class="reason">Причина: ${esc(l.rejection_reason)}</div>` : ''}
          ${l.status === 'draft' ? '<div class="reason" style="background:#eef1f4;color:var(--ink2)">Черновик: допишите и отправьте на модерацию</div>' : ''}</div>
        <div class="btns">
          ${canRenew(l) ? `<button class="btn btn-primary btn-sm" data-renew="${l.id}">Продлить на ${settings.listing_days} дней — бесплатно</button>` : ''}
          ${l.status !== 'sold' ? `<a class="btn btn-ghost btn-sm" href="new.html?id=${l.id}">${l.status === 'draft' || l.status === 'rejected' ? 'Исправить и отправить' : 'Редактировать'}</a>` : ''}
          ${['approved', 'expired'].includes(l.status) ? `<button class="btn btn-ghost btn-sm" data-sold="${l.id}">Отметить «Продано»</button>` : ''}
          <button class="btn btn-danger btn-sm" data-del="${l.id}">Удалить</button>
        </div>
        ${promoBlock(l)}
      </div>`).join('')
      : `<div class="empty"><h2>У вас пока нет объявлений</h2><p>Разместите велосипед или запчасть — это бесплатно.</p></div>`;
    renderOrders();
  }
  function renderOrders() {
    if (!orders.length) { $('#my-orders').innerHTML = ''; return; }
    const ST = { requested: '⏳ ждёт оплаты', paid: '💳 оплачено', active: '✅ включено', cancelled: '— отменено' };
    $('#my-orders').innerHTML = `<h2 style="margin-top:22px">Мои заявки на услуги</h2><div class="scroll-x"><table class="t"><tr><th>№</th><th>Услуга</th><th>Объявление</th><th>Сумма</th><th>Статус</th><th></th></tr>
      ${orders.map((o) => { const s = svc[o.service] || { title: o.service, code: o.service, duration_days: o.days, price_kzt: o.price_kzt };
        const l = items.find((x) => x.id === o.listing_id);
        return `<tr><td>${o.id}</td><td>${esc(s.title)}${o.days ? ` · ${o.days} дн.` : ''}${o.note ? `<br><small>${esc(o.note)}</small>` : ''}</td><td>${o.listing_id ? `<a href="listing.html?id=${o.listing_id}">№ ${o.listing_id}</a>` : '—'}</td>
          <td>${fmtKZT(o.price_kzt)}</td><td>${ST[o.status] || o.status}</td>
          <td>${o.status === 'requested' ? `<a class="btn btn-tg btn-sm" target="_blank" rel="noopener" href="${esc(api.payLink({ orderId: o.id, service: s, listing: l, price: o.price_kzt, note: o.note }).url)}">Оплатить в Telegram</a>` : ''}</td></tr>`; }).join('')}</table></div>`;
  }
  $('#my-list').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-sold],[data-del],[data-renew],[data-promo]'); if (!t) return;
    const { sold: s, del: d, renew: r, promo: p } = t.dataset;
    try {
      if (s && confirm('Отметить как проданное? Объявление уйдёт из каталога.')) { await api.markSold(s); toast('Отмечено как проданное'); load(); }
      if (d && confirm('Удалить объявление навсегда вместе с фото?')) { await api.deleteListing(d); toast('Удалено'); load(); }
      if (r) { const until = await api.renewListing(r); toast(`Продлено до ${new Date(until).toLocaleDateString('ru-RU')}`); load(); }
      if (p) {
        const l = items.find((x) => x.id === +t.dataset.id);
        const dlg = await orderDialog({ service: svc[p], listing: l });
        dlg.addEventListener('ordered', () => load(), { once: true });
      }
    } catch (err) { toast(err.message, 'err'); }
  });
  async function loadOrders() { orders = await api.myOrders().catch(() => []); load(); }
  load();
}
