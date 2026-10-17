import * as api from '../api.js';
import { CONFIG } from '../config.js';
import { $, layout, params, toast } from '../ui.js';

const me = await layout();
const next = (() => {
  const n = params().next || '';
  try { const u = new URL(n, location.href); return u.origin === location.origin ? u.href : 'my.html'; } catch { return 'my.html'; }
})();
if (me) location.replace(next);

const box = $('#tg-widget');
if (api.IS_DEMO) {
  box.innerHTML = `<div class="demo-logins" style="width:100%">
    <button class="btn btn-tg" data-role="user">Войти как демо-пользователь</button>
    <button class="btn btn-ghost" data-role="admin">Войти как демо-админ (модерация)</button></div>`;
  $('#login-msg').innerHTML = 'Сейчас включён демо-режим. Настоящий вход через Telegram заработает, когда в <code>js/config.js</code> будут ключи Supabase и имя бота.';
  box.addEventListener('click', (e) => {
    const r = e.target.dataset.role; if (!r) return;
    api.demoLogin(r); location.href = r === 'admin' ? 'admin.html' : next;
  });
} else if (!CONFIG.TELEGRAM_BOT_USERNAME) {
  $('#login-msg').textContent = 'Не указано имя бота (TELEGRAM_BOT_USERNAME в js/config.js).';
} else {
  window.onTelegramAuth = async (user) => {
    $('#login-msg').textContent = 'Проверяем вход…';
    try { await api.loginWithTelegram(user); toast('Вы вошли!'); location.replace(next); }
    catch (e) { $('#login-msg').textContent = e.message; toast(e.message, 'err'); }
  };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://telegram.org/js/telegram-widget.js?22';
  s.dataset.telegramLogin = CONFIG.TELEGRAM_BOT_USERNAME;
  s.dataset.size = 'large';
  s.dataset.radius = '12';
  s.dataset.userpic = 'true';
  s.dataset.requestAccess = 'write';
  s.dataset.onauth = 'onTelegramAuth(user)';
  box.append(s);
}
