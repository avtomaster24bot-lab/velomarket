import * as api from '../api.js';
import { $, esc, layout, ICON, fmtKZT } from '../ui.js';
import { CONFIG } from '../config.js';

await layout();
const services = await api.listServices();
const ads = services.filter((s) => s.kind === 'ad' && s.active);
const promo = services.filter((s) => s.kind !== 'ad' && s.active);
const settings = await api.getSettings();
const PREVIEW = { ad_home_top: 'assets/ads/velopark-wide.svg', ad_list_inline: 'assets/ads/checklist-inline.svg', ad_listing_side: 'assets/ads/your-ad-side.svg', ad_gallery_end: 'assets/ads/velopark-gallery.svg' };
const WHERE = { ad_home_top: 'Первое, что видят на главной. До 3 баннеров меняются каждые 6 секунд.', ad_list_inline: 'Показывается в каталоге после 6-го объявления — в любом разделе и поиске.',
  ad_listing_side: 'На странице каждого объявления рядом с ценой и кнопкой «Написать продавцу». На телефоне — под описанием.', ad_gallery_end: 'Последний слайд, когда покупатель листает фото велосипеда (и в полноэкранном просмотре). Весь слайд — ссылка на ваш сайт.' };
const tgAd = (s) => {
  const text = `Здравствуйте! Хочу рекламу на VeloMarket: «${s.title}» (${s.description}) — ${fmtKZT(s.price_kzt)}${s.duration_days ? ` за ${s.duration_days} дн.` : ''}.\nМой сайт/Telegram: \nКартинку пришлю (или сделайте за меня).`;
  return `https://t.me/${encodeURIComponent(CONFIG.PAY_TELEGRAM || CONFIG.SUPPORT_TELEGRAM)}?text=${encodeURIComponent(text)}`;
};
$('#adv-root').innerHTML = `
  <h1>Реклама на VeloMarket</h1>
  <p class="hint" style="font-size:15px;max-width:760px">Аудитория — люди, которые прямо сейчас покупают или продают велосипед и запчасти. Подходит для веломагазинов, сервисов, проката, школ и брендов.
  Оплата — Kaspi-переводом, без договора. Нажмите «Заказать в Telegram» — откроется чат с готовым текстом. После оплаты баннер ставим в течение дня. Если нет картинки — подскажем или сделаем.</p>
  <div class="slots">${ads.map((s) => `<div class="slot-card"><div class="prev"><img src="${esc(PREVIEW[s.code] || 'assets/ads/your-ad-wide.svg')}" alt="Пример: ${esc(s.title)}" loading="lazy"></div>
    <div class="b"><h3 style="margin:0">${esc(s.title)}</h3><div class="hint" style="margin:0">${esc(s.description)}</div><p style="margin:0;font-size:14px">${esc(WHERE[s.code] || '')}</p>
      <div class="price">${fmtKZT(s.price_kzt)} <small style="font-size:13px;color:var(--muted);font-weight:600">${s.duration_days ? `/ ${s.duration_days} дней` : ''}</small></div>
      <a class="btn btn-tg btn-block" href="${esc(tgAd(s))}" target="_blank" rel="noopener">${ICON.tg} Заказать в Telegram</a></div></div>`).join('')}</div>

  <h2 style="margin-top:30px" id="services">Платные услуги для продавцов</h2>
  <p class="hint" style="max-width:760px">Размещение объявления — бесплатно${settings.free_listing_limit ? ` (до ${settings.free_listing_limit} активных)` : ''}, срок показа ${settings.listing_days} дней, потом можно бесплатно продлить. Чтобы продать быстрее — закажите продвижение в разделе <a href="my.html">«Мои объявления»</a>: кнопка «Продвинуть» под каждым объявлением.</p>
  <div class="scroll-x"><table class="price-table"><tr><th>Услуга</th><th>Что даёт</th><th>Срок</th><th>Цена</th></tr>
  ${promo.filter((s) => s.code !== 'extra_listing' || settings.free_listing_limit).map((s) => `<tr><td><b>${esc(s.title)}</b></td><td>${esc(s.description)}</td><td>${s.duration_days ? `${s.duration_days} дн.` : 'разово'}</td><td class="p">${fmtKZT(s.price_kzt)}</td></tr>`).join('')}</table></div>
  <div class="panel" style="margin-top:18px"><h2>Как оплатить</h2><ol class="pay-steps" style="font-size:15px">
    <li>Выберите услугу («Мои объявления» → «Продвинуть», или «Заказать в Telegram» выше).</li>
    <li>Откроется чат с менеджером в Telegram с готовым сообщением: услуга, номер объявления, цена и номер заказа.</li>
    <li>Оплатите Kaspi-переводом по реквизитам, которые пришлёт администратор.</li>
    <li>Администратор включит услугу — вы увидите срок в «Мои объявления».</li></ol></div>`;
