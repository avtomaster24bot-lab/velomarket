import * as api from '../api.js';
import { $, esc, layout, fmtPrice, timeAgo, params, toast, needLogin } from '../ui.js';

const me = await layout('my');
const root = $('#my-root');
if (!needLogin(me)) {
  const sent = params().sent;
  root.innerHTML = `
    ${sent ? `<div class="verified-box" style="margin-bottom:14px"><b>Объявление отправлено на модерацию.</b>&nbsp;Обычно проверка занимает до 24 часов. После одобрения оно появится в каталоге.</div>` : ''}
    <div class="panel profile-card">
      <div class="seller" style="margin:0;flex:1;min-width:220px"><div class="ava">${esc((me.first_name || me.username || '?')[0])}</div>
        <div><b>${esc(me.first_name || '')}</b><small>${me.username ? '@' + esc(me.username) + ' · покупатели пишут вам в Telegram' : '⚠ нет username в Telegram'}</small></div></div>
      ${me.is_admin ? '<a class="btn btn-primary btn-sm" href="admin.html">Модерация</a>' : ''}
      <button class="btn btn-ghost btn-sm" id="logout">Выйти</button>
    </div>
    ${!me.username ? `<div class="reason" style="margin-top:12px;padding:12px">Укажите username в настройках Telegram, чтобы покупатели могли вам написать (Настройки → Изменить профиль → Имя пользователя). Затем нажмите «Выйти» и войдите снова — без username подать объявление нельзя.</div>` : ''}
    <div class="list-top" style="margin-top:20px"><h1>Мои объявления</h1><a class="btn btn-accent" href="new.html">+ Подать объявление</a></div>
    <div id="my-list"><div class="skeleton" style="aspect-ratio:auto;height:96px"></div></div>`;

  $('#logout').onclick = async () => { await api.logout(); location.href = 'index.html'; };

  async function load() {
    const items = await api.myListings().catch((e) => { toast(e.message, 'err'); return []; });
    $('#my-list').innerHTML = items.length ? items.map((l) => `
      <div class="my-item">
        <a href="listing.html?id=${l.id}"><img src="${esc(api.photoUrl(l.cover_path))}" alt=""></a>
        <div><span class="badge st-${l.status}">${api.STATUSES[l.status]}</span>${l.verified ? ' <span class="badge ok">✓ Проверено</span>' : ''}${l.featured ? ' <span class="badge hot">Топ</span>' : ''}
          <h3><a href="listing.html?id=${l.id}" style="color:inherit">${esc(l.title)}</a></h3>
          <div class="price" style="font-size:15px">${fmtPrice(l.price, l.currency)}</div>
          <div class="meta">${l.views || 0} просмотров · создано ${timeAgo(l.created_at)}</div>
          ${l.rejection_reason && l.status === 'rejected' ? `<div class="reason">Причина: ${esc(l.rejection_reason)}</div>` : ''}
          ${l.status === 'draft' ? '<div class="reason" style="background:#eef1f4;color:var(--ink2)">Черновик: допишите и отправьте на модерацию</div>' : ''}</div>
        <div class="btns">
          ${l.status !== 'sold' ? `<a class="btn btn-ghost btn-sm" href="new.html?id=${l.id}">${l.status === 'draft' || l.status === 'rejected' ? 'Исправить и отправить' : 'Редактировать'}</a>` : ''}
          ${l.status === 'approved' ? `<button class="btn btn-ghost btn-sm" data-sold="${l.id}">Отметить «Продано»</button>` : ''}
          <button class="btn btn-danger btn-sm" data-del="${l.id}">Удалить</button>
        </div>
      </div>`).join('')
      : `<div class="empty"><h2>У вас пока нет объявлений</h2><p>Разместите велосипед или запчасть — это бесплатно.</p></div>`;
  }
  $('#my-list').addEventListener('click', async (e) => {
    const s = e.target.dataset.sold, d = e.target.dataset.del;
    try {
      if (s && confirm('Отметить как проданное? Объявление уйдёт из каталога.')) { await api.markSold(s); toast('Отмечено как проданное'); load(); }
      if (d && confirm('Удалить объявление навсегда вместе с фото?')) { await api.deleteListing(d); toast('Удалено'); load(); }
    } catch (err) { toast(err.message, 'err'); }
  });
  load();
}
