# Family Mode (MVP foundation)

## Что добавлено
- D1 schema: семьи, участники, инвайты, weekly_menus, weekly_menu_portions
- API:
  - GET/POST `/api/family`
  - POST `/api/family/invite`
  - POST `/api/family/join`
  - GET `/api/family/menu?week=YYYY-MM-DD`
  - POST `/api/family/menu/generate?week=YYYY-MM-DD` (только owner)

## Настройка D1
1) Создайте D1 базу и примените `db/schema.sql`.
2) Привяжите базу к Pages Functions как binding `DB`.
3) В `wrangler.toml` замените `REPLACE_WITH_YOUR_D1_ID`.

## Примечание
Порции (граммовки) пока считаются на клиенте Meal Engine и сохраняются в `weekly_menu_portions` на следующем шаге.


## B2C улучшения (v1)
- Server-side portions/totals: `/api/family/menu/generate` теперь вычисляет недельные totals для всех активных членов семьи (по цели LOSS/MAINTAIN) и сохраняет:
  - `weekly_menu_portions` (JSON)
  - `weekly_menu_items` (на каждого члена семьи, с `family_id`), чтобы Shopping List работал сразу на всех устройствах.
- Добавлен endpoint `PATCH /api/family/member` для сохранения цели и параметров участника.

