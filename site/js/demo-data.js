// ДЕМО-данные: НЕНАСТОЯЩИЕ объявления для показа дизайна, пока не подключён Supabase.
// Картинки — иллюстрации, не фото реальных велосипедов.
import { BRANDS } from './brands-data.js';

const b = (name) => BRANDS.find((x) => x.name === name)?.id ?? null;
const img = (n) => `assets/demo/${n}.svg`;
const day = 86400000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();

const RAW = [
  ['bike', 'Trek', 'Marlin 7 (демо)', 2022, 'горный', 'L', '29"', 'used', 420000, 'KZT', 'Казахстан', 'Алматы', 'bike-mtb', true, true],
  ['bike', 'Specialized', 'Allez Sport (демо)', 2021, 'шоссейный', '54', '28"', 'used', 1150, 'USD', 'Казахстан', 'Астана', 'bike-road', true, false],
  ['bike', 'Panasonic', 'Электро ситибайк (демо)', 2019, 'электро', '—', '26"', 'used', 380000, 'KZT', 'Казахстан', 'Алматы', 'bike-ebike', true, true],
  ['bike', 'Giant', 'Escape 3 (демо)', 2023, 'городской', 'M', '28"', 'new', 310000, 'KZT', 'Казахстан', 'Шымкент', 'bike-city', false, false],
  ['bike', 'Canyon', 'Grizl 7 (демо)', 2023, 'гравийный', 'M', '28"', 'used', 1650, 'EUR', 'Германия', 'Берлин', 'bike-gravel', true, false],
  ['bike', 'Haro', 'Downtown (демо)', 2020, 'BMX', '20.5"', '20"', 'used', 95000, 'KZT', 'Казахстан', 'Караганда', 'bike-bmx', false, false],
  ['bike', 'Woom', 'woom 4 (демо)', 2022, 'детский', '—', '20"', 'used', 210000, 'KZT', 'Казахстан', 'Алматы', 'bike-kids', true, false],
  ['bike', 'Surly', 'Ice Cream Truck (демо)', 2019, 'фэтбайк', 'L', '26"', 'used', 145000, 'RUB', 'Россия', 'Новосибирск', 'bike-fat', false, false],
  ['bike', 'Merida', 'Big.Nine 300 (демо)', 2022, 'горный', 'M', '29"', 'used', 260000, 'KZT', 'Казахстан', 'Усть-Каменогорск', 'bike-mtb', false, false],
  ['bike', 'Bianchi', 'Via Nirone 7 (демо)', 2020, 'шоссейный', '55', '28"', 'used', 690000, 'KZT', 'Узбекистан', 'Ташкент', 'bike-road', true, false],
  ['part', 'Fox', 'Вилка 34 Rhythm 140 мм (демо)', 2021, null, null, '29"', 'used', 160000, 'KZT', 'Казахстан', 'Алматы', 'part-fork', true, false],
  ['part', 'DT Swiss', 'Колесо X 1900 (демо)', 2022, null, null, '29"', 'new', 95000, 'KZT', 'Казахстан', 'Астана', 'part-wheel', false, false],
  ['part', 'Shimano', 'Шатуны Deore M6100 (демо)', 2023, null, null, null, 'new', 38000, 'KZT', 'Кыргызстан', 'Бишкек', 'part-crank', false, false],
  ['accessory', 'Giro', 'Шлем Fixture MIPS (демо)', 2023, null, null, null, 'new', 32000, 'KZT', 'Казахстан', 'Алматы', 'acc-helmet', false, false],
];
const RATES = { KZT: 1, RUB: 6, USD: 520, EUR: 600, UZS: 0.042, KGS: 6, BYN: 160, CNY: 72, GBP: 690, JPY: 3.5 };

export const DEMO_USER = { id: 'demo-user', tg_id: 1, username: 'demo_user', first_name: 'Демо', is_admin: false };
export const DEMO_ADMIN = { ...DEMO_USER, id: 'demo-admin', username: 'demo_admin', first_name: 'Демо-админ', is_admin: true };

export function buildDemoListings() {
  return RAW.map((r, i) => {
    const [category, brand, model, year, bike_type, frame_size, wheel_size, condition, price, currency, country, city, pic, verified, featured] = r;
    const photos = [pic, pic, pic].map((p, j) => ({ id: i * 10 + j, path: img(p), kind: 'general', position: j }));
    photos.push({ id: i * 10 + 9, path: img(pic), kind: 'brand', position: 9 });
    return {
      id: 1000 + i, user_id: i % 3 === 0 ? 'demo-user' : 'demo-seller', category, brand_id: b(brand), brand_other: null,
      known_brands: { name: brand, country: BRANDS.find((x) => x.name === brand)?.country },
      title: `${brand} ${model}`, model, year, bike_type, frame_size, wheel_size, condition, price, currency,
      price_kzt: price * RATES[currency], country, city,
      description: 'ДЕМО-ОБЪЯВЛЕНИЕ. Это ненастоящий товар — пример того, как будет выглядеть карточка. '
        + 'Здесь продавец описывает состояние, пробег, что меняли, комплектацию и причину продажи.',
      cover_path: img(pic), status: i === 8 ? 'pending' : i === 12 ? 'rejected' : 'approved',
      rejection_reason: i === 12 ? 'Нет фото серийного номера' : null,
      verified, featured, views: 40 + ((i * 37) % 300), created_at: ago(i * 0.7 + 0.2), published_at: ago(i * 0.7 + 0.1),
      listing_photos: photos, needs_close_review: false,
      _serial: `DEMO${100000 + i * 7919}`, _seller: { username: 'demo_seller', first_name: 'Демо-продавец', member_since: ago(200), active_listings: 3 },
    };
  });
}
export const DEMO_RATES = Object.entries(RATES).map(([code, rate_to_kzt]) => ({ code, rate_to_kzt }));
export const DEMO_ADS = [
  { id: 1, slot: 'home_top', title: 'Velopark.kz', image_url: 'assets/ads/velopark-wide.svg', url: 'https://avtomaster24bot-lab.github.io/velopark-panasonic/', active: true, position: 1 },
  { id: 2, slot: 'home_top', title: 'Ваша реклама', image_url: 'assets/ads/your-ad-wide.svg', url: 'https://t.me/GrifRift555', active: true, position: 2 },
  { id: 3, slot: 'list_inline', title: 'Чек-лист', image_url: 'assets/ads/checklist-inline.svg', url: 'https://avtomaster24bot-lab.github.io/bike-checklist/', active: true, position: 1 },
  { id: 4, slot: 'listing_side', title: 'Ваша реклама', image_url: 'assets/ads/your-ad-side.svg', url: 'https://t.me/GrifRift555', active: true, position: 1 },
];
