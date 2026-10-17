import * as api from '../api.js';
import { $, $$, esc, layout, fmtPrice, timeAgo, toast, brandName, needLogin } from '../ui.js';

const me = await layout('admin');
const root = $('#admin-root');
if (needLogin(me)) await new Promise(() => {});
if (!me.is_admin) {
  root.innerHTML = `<div class="empty"><h1>Доступ только для администратора</h1><p>Чтобы стать админом, выполните SQL из README (раздел «Сделать себя админом»).</p></div>`;
  await new Promise(() => {});
}
const TABS = { queue: 'Очередь модерации', all: 'Все объявления', reports: 'Жалобы', ads: 'Реклама', brands: 'Бренды', rates: 'Курсы валют' };
root.innerHTML = `<h1 style="margin-top:18px">Модерация</h1><div class="tabs" id="tabs">${Object.entries(TABS).map(([k, v]) => `<button data-tab="${k}">${v}</button>`).join('')}</div><div id="pane"></div>`;
const pane = $('#pane');
let tab = location.hash.slice(1) in TABS ? location.hash.slice(1) : 'queue';
$('#tabs').onclick = (e) => { const t = e.target.closest('[data-tab]')?.dataset.tab; if (t) { tab = t; location.hash = t; show(); } };

async function counts() {
  const [q, r] = await Promise.all([api.adminListings('pending').catch(() => []), api.adminReports().catch(() => [])]);
  const set = (k, n) => { const b = $(`[data-tab="${k}"]`); b.querySelector('.cnt')?.remove(); if (n) b.insertAdjacentHTML('beforeend', `<span class="cnt">${n}</span>`); };
  set('queue', q.length); set('reports', r.filter((x) => x.status === 'open').length);
}
function show() {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  pane.innerHTML = '<div class="skeleton" style="aspect-ratio:auto;height:160px"></div>';
  ({ queue, all, reports, ads, brands, rates })[tab]().catch((e) => { pane.innerHTML = ''; toast(e.message, 'err'); });
}

function photoStrip(l) {
  const ph = (l.listing_photos || []).map((p) => `<a href="${esc(api.photoUrl(p.path))}" target="_blank" rel="noopener"><img src="${esc(api.photoUrl(p.path))}" alt=""><span class="tag">${p.kind === 'brand' ? 'ЛОГОТИП' : 'фото'}</span></a>`).join('');
  const s = l.verification?.signed_url ? `<a href="${esc(l.verification.signed_url)}" target="_blank" rel="noopener"><img src="${esc(l.verification.signed_url)}" alt=""><span class="tag serial">СЕРИЙНИК 🔒</span></a>` : '';
  return `<div class="mod-photos">${s}${ph}</div>`;
}
function modCard(l, full) {
  const seller = l.seller ? `${esc(l.seller.first_name || '')} ${l.seller.username ? `<a href="https://t.me/${esc(l.seller.username)}" target="_blank" rel="noopener">@${esc(l.seller.username)}</a>` : '(без username)'} · tg_id ${esc(l.seller.tg_id)}` : '';
  return `<div class="mod" data-id="${l.id}">
    <div class="mod-head"><div>
      <span class="badge st-${l.status}">${api.STATUSES[l.status]}</span> ${l.verified ? '<span class="badge ok">✓ Проверено</span>' : ''} ${l.featured ? '<span class="badge hot">Топ</span>' : ''}
      <h3 style="margin:6px 0 2px"><a href="listing.html?id=${l.id}" target="_blank">${esc(l.title)}</a> · ${fmtPrice(l.price, l.currency)}</h3>
      <div class="meta">${api.CATEGORIES[l.category]}${l.bike_type ? ' · ' + esc(l.bike_type) : ''}${l.year ? ' · ' + l.year : ''} · ${esc(l.city)}, ${esc(l.country)} · №${l.id} · ${timeAgo(l.updated_at || l.created_at)}</div>
      <div class="meta">Продавец: ${seller}</div></div>
      <div style="text-align:right"><div class="hint">Серийный номер</div><span class="serial">${esc(l.verification?.serial_number || '— нет —')}</span>
        ${l.verification?.serial_number ? `<div><button class="btn btn-ghost btn-sm" data-act="dup" style="margin-top:6px">Искать дубли номера</button></div>` : ''}</div>
    </div>
    ${!l.brand_id ? `<div class="close-review" style="margin-top:8px">⚠ Бренд не из справочника: «${esc(l.brand_other)}» — усиленная проверка</div>` : `<div class="hint">Бренд: ${esc(brandName(l))} (${esc(l.known_brands?.country || '')})</div>`}
    ${photoStrip(l)}
    <details><summary class="hint" style="cursor:pointer">Описание</summary><div class="desc">${esc(l.description || '—')}</div></details>
    <div class="mod-actions">
      ${l.status !== 'approved' ? '<button class="btn btn-primary btn-sm" data-act="approve">Одобрить</button><button class="btn btn-primary btn-sm" data-act="approve-v">Одобрить + ✓ Проверено</button>' : ''}
      ${l.status !== 'rejected' ? '<button class="btn btn-danger btn-sm" data-act="reject">Отклонить…</button>' : ''}
      ${full ? `<button class="btn btn-ghost btn-sm" data-act="verified">${l.verified ? 'Снять «Проверено»' : 'Поставить «Проверено»'}</button>
        <button class="btn btn-ghost btn-sm" data-act="featured">${l.featured ? 'Убрать из Топа' : '★ Продвигать (Топ)'}</button>` : ''}
    </div></div>`;
}
let rows = [];
function bindMod(reload) {
  pane.onclick = async (e) => {
    const act = e.target.dataset.act; if (!act) return;
    const id = +e.target.closest('[data-id]').dataset.id; const l = rows.find((r) => r.id === id);
    try {
      if (act === 'approve') await api.adminUpdateListing(id, { status: 'approved', rejection_reason: null });
      if (act === 'approve-v') await api.adminUpdateListing(id, { status: 'approved', verified: true, rejection_reason: null });
      if (act === 'verified') await api.adminUpdateListing(id, { verified: !l.verified });
      if (act === 'featured') await api.adminUpdateListing(id, { featured: !l.featured });
      if (act === 'dup') {
        const d = (await api.adminSerialSearch(l.verification.serial_number)).filter((x) => x.listing_id !== id);
        toast(d.length ? `Этот номер есть ещё в объявлениях: ${d.map((x) => '№' + x.listing_id).join(', ')}` : 'Дублей номера нет'); return;
      }
      if (act === 'reject') {
        const reason = await askReason(); if (!reason) return;
        await api.adminUpdateListing(id, { status: 'rejected', verified: false, featured: false, rejection_reason: reason });
      }
      toast('Готово'); reload(); counts();
    } catch (err) { toast(err.message, 'err'); }
  };
}
function askReason() {
  const dlg = $('#reject-dlg'); $('#rj-text').value = '';
  dlg.showModal();
  return new Promise((res) => dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return res(null);
    res([$('#rj-preset').value, $('#rj-text').value.trim()].filter(Boolean).join('. ') || 'Не прошло модерацию');
  }, { once: true }));
}
async function queue() {
  rows = await api.adminListings('pending');
  pane.innerHTML = rows.length ? `<p class="hint">Сначала самые старые. Сверьте: серийник на фото = указанному, логотип и детали соответствуют бренду, фото не из интернета.<br><b>Личные данные:</b> если в тексте или на фото есть телефон, адрес, документы — отклоните с просьбой убрать их (контакт только через Telegram).</p>` + rows.map((l) => modCard(l, false)).join('')
    : '<div class="empty"><h2>Очередь пуста 🎉</h2><p>Все объявления проверены.</p></div>';
  bindMod(queue);
}
async function all() {
  const st = sessionStorage.getItem('adm-st') ?? 'approved';
  rows = await api.adminListings(st || undefined);
  pane.innerHTML = `<div class="field" style="max-width:260px"><select id="st-filter"><option value="">Все статусы</option>${Object.entries(api.STATUSES).map(([k, v]) => `<option value="${k}"${k === st ? ' selected' : ''}>${v}</option>`).join('')}</select></div>`
    + (rows.length ? rows.map((l) => modCard(l, true)).join('') : '<div class="empty">Нет объявлений</div>');
  $('#st-filter').onchange = (e) => { sessionStorage.setItem('adm-st', e.target.value); all(); };
  bindMod(all);
}
async function reports() {
  const r = await api.adminReports();
  pane.innerHTML = r.length ? `<div class="scroll-x"><table class="t"><tr><th>Когда</th><th>Объявление</th><th>Причина</th><th>Комментарий</th><th>Статус</th><th></th></tr>
    ${r.map((x) => `<tr><td>${timeAgo(x.created_at)}</td><td><a href="listing.html?id=${x.listing_id}" target="_blank">${esc(x.listings?.title || '№' + x.listing_id)}</a></td>
      <td>${api.REPORT_REASONS[x.reason]}</td><td>${esc(x.comment || '')}</td><td>${{ open: '🔴 новая', resolved: '✅ решена', dismissed: '— отклонена' }[x.status]}</td>
      <td style="white-space:nowrap">${x.status === 'open' ? `<button class="btn btn-danger btn-sm" data-hide="${x.listing_id}" data-r="${x.id}">Снять объявление</button> <button class="btn btn-ghost btn-sm" data-dismiss="${x.id}">Отклонить жалобу</button>` : ''}</td></tr>`).join('')}</table></div>`
    : '<div class="empty"><h2>Жалоб нет</h2></div>';
  pane.onclick = async (e) => {
    const t = e.target.dataset;
    try {
      if (t.hide) { await api.adminUpdateListing(+t.hide, { status: 'rejected', verified: false, featured: false, rejection_reason: 'Снято по жалобе после проверки модератором' }); await api.adminSetReport(+t.r, 'resolved'); }
      else if (t.dismiss) await api.adminSetReport(+t.dismiss, 'dismissed'); else return;
      toast('Готово'); reports(); counts();
    } catch (err) { toast(err.message, 'err'); }
  };
}
const SLOTS = { home_top: 'Главная, сверху (1200×240)', list_inline: 'В списке объявлений (1200×240)', listing_side: 'Страница объявления, сбоку (360×600)' };
async function ads() {
  const list = await api.adminAds();
  const dt = (v) => v ? v.slice(0, 16) : '';
  pane.innerHTML = `<div class="panel"><h2>Добавить / изменить баннер</h2><form id="ad-form">
      <input type="hidden" name="id">
      <div class="row"><div class="field"><label>Место</label><select name="slot">${Object.entries(SLOTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Название (для себя)</label><input name="title" maxlength="120"></div></div>
      <div class="field"><label>Ссылка при клике *</label><input name="url" type="url" required placeholder="https://"></div>
      <div class="row"><div class="field"><label>Картинка с компьютера/телефона</label><input type="file" id="ad-file" accept="image/jpeg,image/png,image/webp,image/gif">
          <p class="hint" id="ad-size-hint">Рекомендуемый размер: 1200×240 (широкий баннер). Фото сожмётся автоматически и загрузится в хранилище.</p></div>
        <div class="field"><label>…или ссылка на картинку</label><input name="image_url" placeholder="https://…"></div></div>
      <div class="ad-preview" id="ad-preview" hidden><img alt="Предпросмотр баннера"></div>
      <div class="row"><div class="field"><label>Показывать с</label><input name="starts_at" type="datetime-local"></div><div class="field"><label>по</label><input name="ends_at" type="datetime-local"></div></div>
      <div class="row"><div class="field"><label>Порядок</label><input name="position" type="number" value="0"></div><div class="field"><label class="check" style="margin-top:28px"><input type="checkbox" name="active" checked> Активен</label></div></div>
      <button class="btn btn-primary">Сохранить баннер</button> <button type="reset" class="btn btn-ghost">Очистить</button>
    </form></div>
    <div class="scroll-x" style="margin-top:14px"><table class="t"><tr><th>Баннер</th><th>Место</th><th>Ссылка</th><th>Период</th><th>Статус</th><th></th></tr>
    ${list.map((a) => `<tr><td><img src="${esc(a.image_url)}" alt=""></td><td>${SLOTS[a.slot]}</td><td><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title || a.url)}</a></td>
      <td>${a.starts_at ? new Date(a.starts_at).toLocaleDateString('ru-RU') : '—'} – ${a.ends_at ? new Date(a.ends_at).toLocaleDateString('ru-RU') : '∞'}</td><td>${a.active ? '🟢 активен' : '⚪ выключен'}</td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-edit="${a.id}">Изменить</button> <button class="btn btn-danger btn-sm" data-del="${a.id}">Удалить</button></td></tr>`).join('')}</table></div>`;
  const f = $('#ad-form');
  const prev = $('#ad-preview'), sizeHint = $('#ad-size-hint');
  const showPrev = (src) => { prev.hidden = !src; if (src) prev.querySelector('img').src = src; prev.classList.toggle('side', f.slot.value === 'listing_side'); };
  const setHint = () => { sizeHint.textContent = `Рекомендуемый размер: ${f.slot.value === 'listing_side' ? '360×600 (вертикальный)' : '1200×240 (широкий баннер)'}. Фото сожмётся автоматически и загрузится в хранилище.`; prev.classList.toggle('side', f.slot.value === 'listing_side'); };
  f.slot.onchange = setHint;
  $('#ad-file').onchange = (e) => { const file = e.target.files[0]; showPrev(file ? URL.createObjectURL(file) : f.image_url.value.trim()); };
  f.image_url.oninput = () => { if (!$('#ad-file').files[0]) showPrev(f.image_url.value.trim()); };
  f.onreset = () => setTimeout(() => { showPrev(''); setHint(); });
  pane.onclick = async (e) => {
    const t = e.target.dataset;
    if (t.edit) { const a = list.find((x) => x.id === +t.edit); for (const k of ['id', 'slot', 'title', 'url', 'image_url', 'position']) f[k].value = a[k] ?? ''; f.starts_at.value = dt(a.starts_at); f.ends_at.value = dt(a.ends_at); f.active.checked = a.active; $('#ad-file').value = ''; setHint(); showPrev(a.image_url); scrollTo({ top: 0, behavior: 'smooth' }); }
    if (t.del && confirm('Удалить баннер?')) { try { await api.adminDeleteAd(+t.del); ads(); } catch (err) { toast(err.message, 'err'); } }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const file = $('#ad-file').files[0];
      const btn = f.querySelector('button.btn-primary'); btn.disabled = true; btn.textContent = file ? 'Загружаем картинку…' : 'Сохраняем…';
      const image_url = file ? await api.adminUploadAdImage(file) : f.image_url.value.trim();
      if (!image_url) throw new Error('Добавьте картинку');
      if (!/^https?:\/\//.test(f.url.value)) throw new Error('Ссылка должна начинаться с https://');
      await api.adminSaveAd({ id: f.id.value, slot: f.slot.value, title: f.title.value, url: f.url.value.trim(), image_url,
        starts_at: f.starts_at.value ? new Date(f.starts_at.value).toISOString() : null, ends_at: f.ends_at.value ? new Date(f.ends_at.value).toISOString() : null,
        position: f.position.value, active: f.active.checked });
      toast('Баннер сохранён'); ads();
    } catch (err) { toast(err.message, 'err'); const btn = f.querySelector('button.btn-primary'); btn.disabled = false; btn.textContent = 'Сохранить баннер'; }
  };
}
async function brands() {
  const list = await api.listBrands();
  pane.innerHTML = `<div class="panel"><h2>Добавить бренд в справочник</h2><p class="hint">Только реальные производители. Объявления с брендами из справочника не помечаются для усиленной проверки.</p>
    <form id="br-form" class="row" style="grid-template-columns:2fr 1.4fr 1fr auto;align-items:end">
      <div class="field"><label>Название</label><input name="name" required maxlength="60"></div>
      <div class="field"><label>Страна</label><input name="country" required maxlength="40"></div>
      <div class="field"><label>Тип</label><select name="kind"><option value="bike">Велосипеды</option><option value="parts">Запчасти</option><option value="both">Оба</option></select></div>
      <div class="field"><button class="btn btn-primary">Добавить</button></div></form></div>
    <p class="hint" style="margin-top:14px">В справочнике ${list.length} брендов.</p>
    <div class="brands">${list.map((b) => `<a href="list.html?brand=${b.id}" target="_blank">${esc(b.name)}<small>${esc(b.country)}</small></a>`).join('')}</div>`;
  $('#br-form').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    try { await api.adminAddBrand(f.name.value.trim(), f.country.value.trim(), f.kind.value); toast('Бренд добавлен'); brands(); } catch (err) { toast(err.message, 'err'); }
  };
}
async function rates() {
  const list = await api.listRates();
  pane.innerHTML = `<div class="panel" style="max-width:520px"><h2>Курсы к тенге</h2><p class="hint">Нужны только для сортировки и фильтра по цене в ₸ между валютами. Цена в объявлении показывается в валюте продавца.</p>
    <form id="rt-form">${list.map((r) => `<div class="row" style="grid-template-columns:80px 1fr;align-items:center;margin-bottom:8px"><b>1 ${r.code} =</b><input name="${r.code}" type="number" step="0.0001" min="0.0001" value="${r.rate_to_kzt}"></div>`).join('')}
    <button class="btn btn-primary">Сохранить курсы</button></form>
    <p class="hint">После сохранения цены в ₸ у всех объявлений пересчитываются автоматически.</p></div>`;
  $('#rt-form').onsubmit = async (e) => {
    e.preventDefault();
    try { for (const r of list) { const v = e.target[r.code].value; if (Number(v) !== Number(r.rate_to_kzt)) await api.adminSetRate(r.code, v); } toast('Курсы сохранены'); } catch (err) { toast(err.message, 'err'); }
  };
}
show(); counts();
