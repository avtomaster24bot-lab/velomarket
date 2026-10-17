// ============================================================
//  НАСТРОЙКИ САЙТА — меняйте только этот файл
// ============================================================
// Пока SUPABASE_URL пустой, сайт работает в ДЕМО-режиме с ненастоящими объявлениями.
// Здесь только ПУБЛИЧНЫЕ ключи. service_role и токен бота сюда НЕ вставлять никогда!
export const CONFIG = {
  SITE_NAME: 'VeloMarket',
  SITE_TAGLINE: 'Велосипеды и запчасти только оригинальных брендов',

  // Supabase → Project Settings → API (или Data API)
  SUPABASE_URL: '',        // например 'https://abcdefgh.supabase.co'
  SUPABASE_ANON_KEY: '',   // anon / publishable key (публичный)

  // Имя бота без @, созданного в @BotFather (для кнопки «Войти через Telegram»)
  TELEGRAM_BOT_USERNAME: '',

  // Контакт администрации (жалобы, реклама)
  SUPPORT_TELEGRAM: 'GrifRift555',

  DEFAULT_CURRENCY: 'KZT',
  PAGE_SIZE: 24,
};
