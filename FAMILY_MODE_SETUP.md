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
