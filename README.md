# bez-mezh-site — статична копія bez-mezh.com.ua (UK)

Живий сайт: https://bez-mezh.pp.ua/

Статична копія української версії https://bez-mezh.com.ua/:
дизайн, тексти, зображення, стилі та скрипти збережено 1-в-1,
WordPress-динаміка адаптована під статику (відносні посилання,
oembed/API прибрано, пошук і форми — наступний крок).

## Структура

- `index.html` — головна
- `reys/` — рейси (поки 3 зразки: kyiv-miunkhen, miunkhen-kyiv, kyiv-dortmund;
  решта ~1270 генеруються з шаблону — див. нижче)
- `kategorіja_rejsu/` — 5 категорій напрямків
- `transfer/`, `o-nas/`, `klientam/`, `chasti-pytannia/`, `avtopark-2/`,
  `novyny/`, `kontakty/`, `karta-sajta/`, `politika-konfidencialnosti/`,
  `diakuiemo/` — контентні сторінки
- 5 статей: `porady-.../`, `pravila-.../`, `prybuttia-.../`,
  `informatsiia-.../`, `bizhentsi-.../`
- `wp-content/`, `wp-includes/` — стилі, скрипти, шрифти, зображення оригіналу
- `cdn.jsdelivr.net/`, `code.jquery.com/` — локальні копії CDN-ресурсів
- `data/` — дані тарифного рушія (копія логіки з `site`, сам `site` не чіпати!)
- `src/` — скрипти збірки: `normalize_pages.py`, `normalize_links.py`
- `bot/`, `docs/` — не деплояться (бот, документація)

## Деплой

Push у `main` → `.github/workflows/deploy.yml` → GitHub Pages.
Бот-воркфлоу вимкнено (потребує secrets).

## Статус посилань

- 0 втеч за корінь, 0 відсутніх файлів (HTML src/href/srcset + CSS url()).
- Тимчасово ведуть у нікуди (буде згенеровано): `/reys/*` (~1270 маршрутів),
  `page/2` пагінація категорій.
- Поза скоупом (UK-копія): `/ru/*`, `/category/*`, архіви дат, `novosti-2`.
