import * as api from '../api.js';
import { $, esc, layout, cardHTML, bindFavs, renderAds, ICON, toast } from '../ui.js';

await layout();
$('.trust').innerHTML = `<span>${ICON.shield} Ручная модерация каждого объявления</span><span>${ICON.check} Фото серийного номера рамы</span><span>${ICON.tg} Вход и связь через Telegram</span>`;

const CATS = [
  ['list.html?category=bike&type=горный', 'Горные', 'bike-mtb'], ['list.html?category=bike&type=шоссейный', 'Шоссейные', 'bike-road'],
  ['list.html?category=bike&type=электро', 'Электро', 'bike-ebike'], ['list.html?category=bike&type=городской', 'Городские', 'bike-city'],
  ['list.html?category=part', 'Запчасти', 'part-fork'], ['list.html?category=accessory', 'Аксессуары', 'acc-helmet'],
];
$('#cats').innerHTML = CATS.map(([href, name, img]) => `<a class="cat" href="${href}"><img src="assets/demo/${img}.svg" alt=""><span>${name}<small>смотреть</small></span></a>`).join('');

renderAds($('#ad-home-top'), 'home_top');

const favs = await api.favoriteIds().catch(() => new Set());
const skel = (n) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
$('#featured').innerHTML = skel(4); $('#fresh').innerHTML = skel(8);
bindFavs($('#featured'), favs); bindFavs($('#fresh'), favs);

try {
  const [feat, fresh, brands] = await Promise.all([
    api.searchListings({ featured: 1, pageSize: 4 }),
    api.searchListings({ pageSize: 12 }),
    api.listBrands(),
  ]);
  if (feat.items.length) $('#featured').innerHTML = feat.items.map((l) => cardHTML(l, favs)).join('');
  else $('#featured-block').hidden = true;
  $('#fresh').innerHTML = fresh.items.length ? fresh.items.map((l) => cardHTML(l, favs)).join('')
    : `<div class="empty" style="grid-column:1/-1"><h2>Пока нет объявлений</h2><p>Станьте первым!</p><a class="btn btn-accent" href="new.html">Подать объявление</a></div>`;
  $('#brands').innerHTML = brands.filter((b) => b.is_popular).map((b) =>
    `<a href="list.html?brand=${b.id}">${esc(b.name)}<small>${esc(b.country)}</small></a>`).join('');
} catch (e) { toast(e.message, 'err'); }
