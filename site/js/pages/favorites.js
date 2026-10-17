import * as api from '../api.js';
import { $, layout, cardHTML, bindFavs, toast } from '../ui.js';

const me = await layout('fav');
const grid = $('#fav-grid');
if (!me && !api.IS_DEMO) {
  grid.outerHTML = `<div class="empty"><p>Войдите через Telegram, чтобы сохранять объявления.</p><a class="btn btn-primary" href="login.html?next=favorites.html">Войти</a></div>`;
} else {
  try {
    const items = await api.listFavorites();
    const favs = new Set(items.map((l) => l.id));
    grid.innerHTML = items.length ? items.map((l) => cardHTML(l, favs)).join('')
      : `<div class="empty" style="grid-column:1/-1"><h2>Пока пусто</h2><p>Нажмите ♥ на карточке, чтобы сохранить объявление.</p><a class="btn btn-primary" href="list.html">Смотреть объявления</a></div>`;
    bindFavs(grid, favs);
  } catch (e) { toast(e.message, 'err'); }
}
