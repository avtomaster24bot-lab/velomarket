import * as api from '../api.js';
import { $, $$, esc, layout, params, toast, needLogin } from '../ui.js';
import { compressImage } from '../image.js';

const me = await layout();
const root = $('#new-root');
const editId = Number(params().id) || null;
if (!api.IS_DEMO && needLogin(me)) await new Promise(() => {});

const NO_USERNAME = !api.IS_DEMO && !me?.username;
const brands = await api.listBrands().catch(() => []);
let L = null;
if (editId) {
  L = await api.getListingForEdit(editId).catch((e) => { toast(e.message, 'err'); return null; });
  if (!L || (!api.IS_DEMO && L.user_id !== me.id)) { root.innerHTML = '<div class="empty"><h1>Объявление не найдено</h1></div>'; await new Promise(() => {}); }
}
const WHEELS = ['12"', '14"', '16"', '18"', '20"', '24"', '26"', '27.5"', '28" / 700c', '29"'];
const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t ?? v)}</option>`;
const year = new Date().getFullYear();

root.innerHTML = `
<h1>${editId ? 'Редактирование объявления' : 'Подать объявление'}</h1>
${editId && L.status === 'approved' ? '<p class="warn-box">После сохранения объявление снова пройдёт модерацию.</p>' : ''}
${editId && L.rejection_reason ? `<p class="reason">Отклонено модератором: ${esc(L.rejection_reason)}</p>` : ''}
${NO_USERNAME ? `<div class="reason" style="margin-bottom:14px;padding:14px;font-size:15px"><b>Укажите username в настройках Telegram, чтобы покупатели могли вам написать.</b><br>Telegram → Настройки → Изменить профиль → Имя пользователя. Затем на сайте нажмите «Выйти» в кабинете и войдите снова.</div>` : ''}
<div class="rules-box" style="margin-bottom:14px"><b>Только оригинал.</b> Запрещены реплики, копии и «ноунейм под бренд». Каждое объявление проверяет модератор по фото и серийному номеру. <a href="rules.html">Правила</a></div>
<form id="nf" novalidate>
  <div class="panel"><h2><b>1</b> Что продаёте</h2>
    <div class="row">
      <div class="field"><label for="category">Категория *</label><select id="category" name="category" required>
        ${Object.entries(api.CATEGORIES).map(([k, v]) => opt(k, v, L?.category === k)).join('')}</select></div>
      <div class="field"><label for="condition">Состояние *</label><select id="condition" name="condition">
        ${Object.entries(api.CONDITIONS).map(([k, v]) => opt(k, v, (L?.condition || 'used') === k)).join('')}</select></div>
    </div>
    <div class="field"><label for="brand_id">Бренд *</label><select id="brand_id" name="brand_id" required></select>
      <div class="hint">Выберите из справочника реальных брендов. Нет в списке — «Другой бренд» (усиленная проверка).</div></div>
    <div class="field" id="other-field" hidden><label for="brand_other">Название бренда *</label><input id="brand_other" name="brand_other" maxlength="60" value="${esc(L?.brand_other || '')}"></div>
    <div class="field"><label for="model">Модель *</label><input id="model" name="model" maxlength="120" required placeholder="Например: Marlin 7 Gen 3 / Fox 34 Rhythm" value="${esc(L?.model || '')}"></div>
  </div>

  <div class="panel"><h2><b>2</b> Характеристики</h2>
    <div class="row">
      <div class="field"><label for="year">Год</label><input id="year" name="year" type="number" min="1950" max="${year + 1}" inputmode="numeric" value="${esc(L?.year || '')}"></div>
      <div class="field" id="type-wrap"><label for="bike_type">Тип велосипеда *</label><select id="bike_type" name="bike_type"><option value="">—</option>${api.BIKE_TYPES.map((t) => opt(t, t, L?.bike_type === t)).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label for="frame_size">Размер рамы</label><input id="frame_size" name="frame_size" maxlength="20" placeholder='M, L, 54, 19"' value="${esc(L?.frame_size || '')}"></div>
      <div class="field"><label for="wheel_size">Диаметр колёс</label><select id="wheel_size" name="wheel_size"><option value="">—</option>${WHEELS.map((w) => opt(w, w, L?.wheel_size === w)).join('')}</select></div>
    </div>
    <div class="field"><label for="description">Описание</label><textarea id="description" name="description" maxlength="5000" placeholder="Состояние, что меняли, комплектация, причина продажи, торг…">${esc(L?.description || '')}</textarea>
      <div class="hint">Не пишите телефон, адрес и документы — покупатели напишут вам в Telegram. Если укажете такие данные сами (в тексте или на фото), вы публикуете их добровольно и отвечаете за них; модератор может их удалить. <a href="rules.html#responsibility">Правила</a></div></div>
  </div>

  <div class="panel"><h2><b>3</b> Цена и место</h2>
    <div class="row">
      <div class="field"><label for="price">Цена *</label><input id="price" name="price" type="number" min="0" step="1" inputmode="numeric" required value="${esc(L?.price ?? '')}"></div>
      <div class="field"><label for="currency">Валюта</label><select id="currency" name="currency">${api.CURRENCIES.map((c) => opt(c, c, (L?.currency || 'KZT') === c)).join('')}</select></div>
    </div>
    <div class="row">
      <div class="field"><label for="country">Страна *</label><select id="country" name="country">${api.COUNTRIES.map((c) => opt(c, c, (L?.country || 'Казахстан') === c)).join('')}</select></div>
      <div class="field"><label for="city">Город *</label><input id="city" name="city" list="cities" maxlength="80" required value="${esc(L?.city || '')}"><datalist id="cities">${api.KZ_CITIES.map((c) => `<option value="${c}">`).join('')}</datalist></div>
    </div>
  </div>

  <div class="panel"><h2><b>4</b> Фото и проверка подлинности</h2>
    <div class="field"><label>Общие фото * <span class="hint">(минимум 3, до 12; первое — обложка)</span></label>
      <div class="photo-drop"><input type="file" id="gen-input" accept="image/*" multiple><strong>+ Добавить фото</strong>Велосипед целиком с двух сторон, детали, дефекты</div>
      <div class="thumbs" id="gen-thumbs"></div></div>
    <div class="req-grid">
      <div class="field"><label>Фото логотипа / надписи бренда *</label>
        <div class="photo-drop"><input type="file" id="brand-input" accept="image/*"><strong>+ Фото логотипа</strong>Крупно: надпись бренда на раме или детали</div>
        <div class="thumbs" id="brand-thumbs"></div></div>
      <div class="field"><label>Фото серийного номера * <span class="private">🔒 видит только модератор</span></label>
        <div class="photo-drop"><input type="file" id="serial-input" accept="image/*"><strong>+ Фото номера рамы</strong>Обычно снизу каретки. Для запчастей — серийник / маркировка</div>
        <div class="thumbs" id="serial-thumbs"></div></div>
    </div>
    <div class="field"><label for="serial_number">Серийный номер рамы / детали * <span class="private">🔒 не публикуется</span></label>
      <input id="serial_number" maxlength="64" required autocomplete="off" placeholder="Например: WTU123C4567D" value="${esc(L?.verification?.serial_number || '')}"></div>
  </div>

  <div class="panel">
    <label class="check"><input type="checkbox" id="agree" ${editId ? 'checked' : ''}> Подтверждаю, что товар оригинальный, не реплика и не «ноунейм под бренд», номер рамы не перебит, фото сделаны мной.</label>
    <div class="err-text" id="form-err"></div>
    <button class="btn btn-accent btn-block" style="margin-top:14px" id="submit-btn"${NO_USERNAME ? ' disabled' : ''}>${editId ? 'Сохранить и отправить на модерацию' : 'Отправить на модерацию'}</button>
    <div class="progress" id="prog" hidden><i></i></div>
    <p class="hint" id="prog-text"></p>
  </div>
</form>`;

const form = $('#nf');
// бренды: сначала подходящие для категории
function fillBrands() {
  const cat = form.category.value;
  const forBike = (b) => b.kind !== 'parts';
  const forParts = (b) => b.kind !== 'bike';
  const main = brands.filter(cat === 'bike' ? forBike : forParts);
  const rest = brands.filter((b) => !main.includes(b));
  const sel = form.brand_id.value || (L ? (L.brand_id ? String(L.brand_id) : 'other') : '');
  const o = (b) => opt(b.id, `${b.name} — ${b.country}`, String(b.id) === sel);
  form.brand_id.innerHTML = `<option value="">Выберите бренд…</option>`
    + `<optgroup label="${cat === 'bike' ? 'Велосипедные бренды' : 'Бренды запчастей и аксессуаров'}">${main.map(o).join('')}</optgroup>`
    + (rest.length ? `<optgroup label="${cat === 'bike' ? 'Бренды запчастей' : 'Велосипедные бренды'}">${rest.map(o).join('')}</optgroup>` : '')
    + `<optgroup label="Нет в списке">${opt('other', 'Другой бренд (усиленная проверка)', sel === 'other')}</optgroup>`;
  syncOther();
}
const syncOther = () => { $('#other-field').hidden = form.brand_id.value !== 'other'; };
const syncType = () => { $('#type-wrap').style.visibility = form.category.value === 'bike' ? '' : 'hidden'; };
form.category.addEventListener('change', () => { fillBrands(); syncType(); });
form.brand_id.addEventListener('change', syncOther);
fillBrands(); syncType();

// ---- фото ----
const state = {
  existing: (L?.listing_photos || []).filter((p) => p.kind === 'general'),
  existingBrand: (L?.listing_photos || []).find((p) => p.kind === 'brand') || null,
  removed: [], gen: [], brand: null, serial: null,
  serialOld: L?.verification?.serial_photo_path || null,
};
const urlOf = (f) => (f._url ||= URL.createObjectURL(f));
function drawThumbs() {
  const gen = [...state.existing.map((p) => ({ src: api.photoUrl(p.path), ex: p })), ...state.gen.map((f) => ({ src: urlOf(f), f }))];
  $('#gen-thumbs').innerHTML = gen.map((g, i) => `<div class="thumb"><img src="${esc(g.src)}" alt=""><span class="n">${i ? i + 1 : 'обложка'}</span><button type="button" data-rm="${i}" aria-label="Удалить">×</button></div>`).join('');
  const b = state.brand ? urlOf(state.brand) : state.existingBrand ? api.photoUrl(state.existingBrand.path) : null;
  $('#brand-thumbs').innerHTML = b ? `<div class="thumb"><img src="${esc(b)}" alt=""></div>` : '';
  $('#serial-thumbs').innerHTML = state.serial ? `<div class="thumb"><img src="${esc(urlOf(state.serial))}" alt=""></div>`
    : state.serialOld ? '<div class="hint">✓ Фото серийника уже загружено (можно заменить)</div>' : '';
  $$('#gen-thumbs [data-rm]').forEach((btn) => btn.onclick = () => {
    const i = +btn.dataset.rm;
    if (i < state.existing.length) state.removed.push(...state.existing.splice(i, 1));
    else state.gen.splice(i - state.existing.length, 1);
    drawThumbs();
  });
}
const okImg = (f) => /^image\//.test(f.type) || toast(`${f.name}: это не изображение`, 'err');
$('#gen-input').onchange = (e) => {
  const files = [...e.target.files].filter(okImg);
  const room = 12 - state.existing.length - state.gen.length;
  if (files.length > room) toast(`Максимум 12 фото — добавлено ${Math.max(room, 0)}`, 'err');
  state.gen.push(...files.slice(0, Math.max(room, 0))); e.target.value = ''; drawThumbs();
};
$('#brand-input').onchange = (e) => { const f = e.target.files[0]; if (f && okImg(f)) state.brand = f; e.target.value = ''; drawThumbs(); };
$('#serial-input').onchange = (e) => { const f = e.target.files[0]; if (f && okImg(f)) state.serial = f; e.target.value = ''; drawThumbs(); };
$$('.photo-drop').forEach((d) => {
  d.addEventListener('dragover', () => d.classList.add('drag'));
  ['dragleave', 'drop'].forEach((ev) => d.addEventListener(ev, () => d.classList.remove('drag')));
});
drawThumbs();

// ---- отправка ----
function validate() {
  const f = form;
  const errs = [];
  if (NO_USERNAME) errs.push('укажите username в настройках Telegram, чтобы покупатели могли вам написать');
  if (!f.brand_id.value) errs.push('выберите бренд');
  if (f.brand_id.value === 'other' && f.brand_other.value.trim().length < 2) errs.push('укажите название бренда');
  if (!f.model.value.trim()) errs.push('укажите модель');
  if (f.category.value === 'bike' && !f.bike_type.value) errs.push('выберите тип велосипеда');
  if (f.price.value === '' || +f.price.value < 0) errs.push('укажите цену');
  if (!f.city.value.trim()) errs.push('укажите город');
  if (f.year.value && (+f.year.value < 1950 || +f.year.value > year + 1)) errs.push('проверьте год');
  if (state.existing.length + state.gen.length < 3) errs.push('добавьте минимум 3 общих фото');
  if (!state.brand && !state.existingBrand) errs.push('добавьте фото логотипа');
  if (!state.serial && !state.serialOld) errs.push('добавьте фото серийного номера');
  if ($('#serial_number').value.trim().length < 3) errs.push('укажите серийный номер');
  if (!$('#agree').checked) errs.push('подтвердите оригинальность товара');
  return errs;
}
const prog = (done, total, text) => { $('#prog').hidden = false; $('#prog i').style.width = `${Math.round(done / total * 100)}%`; $('#prog-text').textContent = text; };

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errs = validate();
  $('#form-err').textContent = errs.length ? 'Нужно: ' + errs.join(', ') + '.' : '';
  if (errs.length) return;
  if (api.IS_DEMO) { toast('Демо-режим: объявление не сохраняется. Подключите Supabase.', 'err'); return; }
  const btn = $('#submit-btn'); btn.disabled = true;
  const f = form;
  const fields = {
    category: f.category.value, condition: f.condition.value,
    brand_id: f.brand_id.value === 'other' ? null : Number(f.brand_id.value),
    brand_other: f.brand_id.value === 'other' ? f.brand_other.value.trim() : null,
    model: f.model.value.trim(), year: f.year.value ? Number(f.year.value) : null,
    bike_type: f.category.value === 'bike' ? f.bike_type.value : null,
    frame_size: f.frame_size.value.trim(), wheel_size: f.wheel_size.value,
    description: f.description.value.trim(), price: Number(f.price.value), currency: f.currency.value,
    country: f.country.value, city: f.city.value.trim(),
  };
  const total = state.gen.length + (state.brand ? 1 : 0) + (state.serial ? 1 : 0) + state.removed.length + 3;
  let done = 0; const step = (t) => prog(++done, total, t);
  let id = editId;
  try {
    if (id) await api.updateListing(id, fields); else id = await api.createListing(fields);
    step('Объявление сохранено');
    for (const p of state.removed) { await api.deleteListingPhoto(p); step('Удаляем лишние фото…'); }
    let pos = state.existing.length ? Math.max(...state.existing.map((p) => p.position)) + 1 : 0;
    for (const file of state.gen) {
      const { blob, ext } = await compressImage(file);
      await api.uploadListingPhoto(id, blob, ext, 'general', pos++);
      step(`Загружаем фото ${done}/${total}…`);
    }
    if (state.brand) {
      const { blob, ext } = await compressImage(state.brand);
      await api.uploadListingPhoto(id, blob, ext, 'brand', 100);
      if (state.existingBrand) await api.deleteListingPhoto(state.existingBrand);
      step('Фото логотипа загружено');
    }
    let sblob = null, sext = null;
    if (state.serial) ({ blob: sblob, ext: sext } = await compressImage(state.serial, { maxSide: 2000, quality: 0.88 }));
    await api.saveVerification(id, $('#serial_number').value.trim(), sblob, sext, state.serialOld);
    step('Серийный номер сохранён');
    await api.submitListing(id);
    step('Отправлено на модерацию');
    location.href = `my.html?sent=${id}`;
  } catch (err) {
    console.error(err);
    $('#form-err').textContent = err.message;
    toast(err.message, 'err');
    btn.disabled = false;
    if (id && !editId) setTimeout(() => location.replace(`new.html?id=${id}`), 2500); // черновик уже создан — продолжим редактирование
  }
});
