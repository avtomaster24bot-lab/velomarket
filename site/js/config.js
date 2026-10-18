// ============================================================
//  НАСТРОЙКИ САЙТА — меняйте только этот файл
// ============================================================
// Пока SUPABASE_URL пустой, сайт работает в ДЕМО-режиме с ненастоящими объявлениями.
// Здесь только ПУБЛИЧНЫЕ ключи. service_role и токен бота сюда НЕ вставлять никогда!
export const CONFIG = {
  SITE_NAME: 'VeloMarket',
  SITE_TAGLINE: 'Велосипеды и запчасти только оригинальных брендов',

  // Supabase → Project Settings → API (или Data API)
  SUPABASE_URL: 'https://wzhwnffdylhkmapijkrn.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6aHduZmZkeWxoa21hcGlqa3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNDg3NjEsImV4cCI6MjA5MTkyNDc2MX0.G7Ieq0C-FECBFaC5y5ks5tv5KApUqY_S7pH-P8sHXCs', // anon (публичный)

  // Имя бота без @, созданного в @BotFather (для кнопки «Войти через Telegram»)
  TELEGRAM_BOT_USERNAME: 'VeloMaster24bot',

  // Контакт администрации (жалобы, реклама)
  SUPPORT_TELEGRAM: 'GrifRift555',

  DEFAULT_CURRENCY: 'KZT',
  PAGE_SIZE: 24,

  // Оплата платных услуг: без эквайринга. Пользователь жмёт «Заказать» → открывается Telegram
  // с готовым текстом (услуга, № объявления, цена, № заказа) → оплачивает Kaspi-переводом →
  // админ в admin.html → «Заказы» нажимает «Оплачено, включить».
  PAY_TELEGRAM: 'GrifRift555',
  PAY_HOW: 'Kaspi-перевод по номеру, который пришлёт администратор в Telegram',

  // Цены по умолчанию (₸). Настоящие цены админ меняет в admin.html → «Услуги и цены»
  // (они хранятся в таблице services). Эти значения — запасные, пока миграция 07 не применена.
  SERVICES_FALLBACK: [
    { code: 'top', kind: 'listing', title: 'Топ', description: 'Вверху каталога и на главной со значком «Топ»', price_kzt: 1500, duration_days: 7, active: true, sort: 10 },
    { code: 'auto_renew', kind: 'listing', title: 'Автопродление', description: 'Не снимается по сроку и само поднимается в начало каждые 3 дня', price_kzt: 2000, duration_days: 30, active: true, sort: 20 },
    { code: 'bump', kind: 'listing', title: 'Поднять', description: 'Разово поднять объявление в начало списка', price_kzt: 300, duration_days: 0, active: true, sort: 30 },
    { code: 'highlight', kind: 'listing', title: 'Выделить цветом', description: 'Карточка выделена цветом в каталоге', price_kzt: 700, duration_days: 7, active: true, sort: 40 },
    { code: 'urgent', kind: 'listing', title: 'Срочно', description: 'Значок «Срочно» на карточке и в объявлении', price_kzt: 500, duration_days: 7, active: true, sort: 50 },
    { code: 'extra_listing', kind: 'listing', title: 'Доп. объявление', description: 'Место сверх бесплатного лимита (если лимит включён)', price_kzt: 1000, duration_days: 30, active: true, sort: 60 },
    { code: 'shop', kind: 'account', title: 'Магазин', description: 'Название магазина, значок «Магазин», своя страница со всеми объявлениями, больше объявлений', price_kzt: 5000, duration_days: 30, active: true, sort: 70 },
    { code: 'ad_home_top', kind: 'ad', title: 'Баннер на главной', description: '1200×240, вверху главной страницы, ротация', price_kzt: 15000, duration_days: 30, active: true, sort: 80 },
    { code: 'ad_list_inline', kind: 'ad', title: 'Баннер в каталоге', description: '1200×240, между объявлениями в списке', price_kzt: 10000, duration_days: 30, active: true, sort: 81 },
    { code: 'ad_listing_side', kind: 'ad', title: 'Баннер на странице объявления', description: '360×600, сбоку от описания (на телефоне — ниже)', price_kzt: 8000, duration_days: 30, active: true, sort: 82 },
    { code: 'ad_gallery_end', kind: 'ad', title: 'Слайд в галерее фото', description: '1200×900 (4:3), последний слайд при листании фото', price_kzt: 10000, duration_days: 30, active: true, sort: 83 },
  ],
  SETTINGS_FALLBACK: { listing_days: 30, renew_window_days: 3, auto_bump_days: 3, cleanup_after_days: 30, free_listing_limit: null, shop_listing_limit: null },
};
