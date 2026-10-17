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
};
