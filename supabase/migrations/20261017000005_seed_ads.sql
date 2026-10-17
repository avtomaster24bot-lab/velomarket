-- VeloMarket: несколько стартовых рекламных баннеров (можно удалить в admin.html → «Реклама»).
-- Картинки лежат на сайте в assets/ads/. Замените SITE на адрес своего сайта, если он другой.
insert into public.ads (slot, title, image_url, url, position)
select * from (values
  ('home_top',     'Velopark.kz — японский электровелосипед Panasonic',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/velopark-wide.svg',
     'https://avtomaster24bot-lab.github.io/velopark-panasonic/', 1),
  ('home_top',     'Ваша реклама здесь',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/your-ad-wide.svg',
     'https://t.me/GrifRift555', 2),
  ('list_inline',  'Чек-лист покупки б/у велосипеда',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/checklist-inline.svg',
     'https://avtomaster24bot-lab.github.io/bike-checklist/', 1),
  ('listing_side', 'Ваша реклама здесь',
     'https://avtomaster24bot-lab.github.io/velomarket/assets/ads/your-ad-side.svg',
     'https://t.me/GrifRift555', 1)
) as v(slot, title, image_url, url, position)
where not exists (select 1 from public.ads);
