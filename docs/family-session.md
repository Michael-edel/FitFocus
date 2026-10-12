# Сессия семейных запросов

Сверено: 12.10.2026. Код:
[`9c44c2118749275cbb8ecaa11c520c43e4220000`](https://github.com/Michael-edel/FitFocus/commit/9c44c2118749275cbb8ecaa11c520c43e4220000),
ветка `fix/durable-outbox`. Это компонент P0.4–P0.6; семейный CAS,
постоянная доставка меню и общая приёмка остаются открытыми.

## Исправленная гонка

Прежде `useFamilyCloud` отправлял запрос с cookie на момент fetch, затем
применял ответ без привязки к исходному входу. Ответ старой загрузки мог
восстановить UI после logout; приглашение могло уйти от другого входа того
же аккаунта. Ошибка отметки покупки также могла оставить необработанный Promise.

Теперь `App` передаёт исходный `loginReadGuard` из hydration и функцию
проверки login attempt. Клиент не подбирает proof по текущему IDB/cookie-входу.
Каждый HTTP-запрос обновляет proof через `/me` с предыдущим guard, требует
`familySync: { protocol: 1, guard: 1 }`, проверяет IDB epoch/auth-fence и
публичную account/session-привязку ответа. Другая сессия того же аккаунта
не принимается за исходную.

## Серверный и клиентский охват

| Путь | Методы | Защита |
|---|---|---|
| `/api/family` | GET, POST | Scope до чтения/создания семьи |
| `/api/family/invite` | POST | Scope до создания приглашения |
| `/api/family/join` | POST | Scope до расходования кода |
| `/api/family/member` | PATCH | Scope до изменения участника |
| `/api/family/menu` | GET, POST | Scope до чтения/сохранения меню |
| `/api/family/menu/generate` | POST | Scope до серверной генерации |
| `/api/shopping/list` | GET | Scope до чтения покупок |
| `/api/shopping/check` | PATCH, POST | Scope до изменения отметки |

Handlers используют `requireStateUser` перед прикладными эффектами.
Несовпадение account/session возвращает 401. Ответы, включая ошибки,
содержат `X-FitFocus-Family-Protocol: 1`, `X-FitFocus-Family-Guard: 1`
и переданную публичную привязку. Приватный sid не возвращается.
Запросы прежних клиентов без scope продолжают прежний путь; этот guard
их не останавливает и не заменяет проверку членства/тарифа.

В `useFamilyCloud` подключены загрузка семьи/меню/покупок, создание,
приглашение, присоединение, смена цели, серверная генерация меню и отметки.
GET семьи и меню выполняются параллельно с отдельной проверкой каждого ответа.
Неверные family/week или повреждённые данные отклоняются; ошибка загрузки
не очищает уже показанный снимок. При отказе отметки UI восстанавливает
прежнее значение и показывает ошибку.

## Lifetime и транспорт

`FamilyActionScope` допускает независимые действия одновременно и отменяет
предыдущую попытку того же вида. Logout, cleanup и pagehide отменяют старые
controllers. Pageshow активирует новое поколение и снимает оставшийся loading;
старые попытки не оживают. Завершение старой попытки не удаляет новую.

Состояние и возвращённые React-setters принадлежат своему scope. Данные
покупок дополнительно принадлежат familyId; старый setter не может изменить
состояние нового входа или другой семьи. Последующий шаг mutation-chain
проверяет исходную попытку перед загрузкой и перед возвратом результата.

Транспорт ограничивает запрос вместе с телом ответа: по умолчанию 12 секунд
и 1 MiB. HTTP мутации не повторяются автоматически. Таймаут отдельного
request controller сохраняет page lifetime для явного повтора. Перед каждым
запросом выполняется новый `/me`; его безопасное GET-чтение имеет собственный
ограниченный retry. Поздний proof не снимает новую auth-паузу.

## Проверки

До поправки 14 новых server regression tests падали. После неё прошли
1009 unit-тестов / 189 файлов, три typecheck, admin/auth/API guards,
schema (22 миграции / 31 таблица), privacy (28 таблиц), audit: 0.
Проверены смена аккаунта и same-account login, неполный scope, capability,
ответ с другой привязкой, auth-пауза во время proof, поздний ответ после
IDB invalidation, таймаут, конкурентные actions и target family/week.

На локальном workerd/D1 прошли 23 HTTP-запроса: capability, десять отказов
неверного scope до эффектов, отсутствие случайного создания семьи,
create/invite/join/member, save/generate/read и общий shopping/check двух
синтетических аккаунтов на одном origin и в одной базе. Cookie участника
с account/session владельца получает 401; приватные sid не возвращаются.

Пять первоначальных Chromium-сценариев прошли до последующего усиления
валидации данных. Полная production browser matrix `9c44c21` с workers=3,
retries=0 завершилась: 272 passed / 6 failed / 9 skips. Все 42 семейных
сценария прошли. Диагностический прогон этих шести сценариев на обоих
iPhone-проектах прошёл: 12 passed (workers=1, retries=0), без изменения кода.
Замедленные операции в трассировках указывают на возможную нагрузку локального
хоста; это предположение, а не доказанная ошибка продукта. Затем
[полный CI `3baac01`](https://github.com/Michael-edel/FitFocus/actions/runs/38200234936)
завершился success: 1009 unit / 189 файлов, 278 browser passed / 9 skips,
семь проектов, workers=2, без flaky в итоговом summary (10,4 мин browser).
Код и timeouts после диагностического прогона не менялись. Это проверка
указанного опубликованного SHA; последующие HEAD проверяются отдельно.
Подробности и последующие проверки — в [журнале](stabilization-progress.md).

Browser plugin not available: используется repository Playwright,
`http://127.0.0.1:4173` и mock API. События pagehide/pageshow в тесте
не доказывают реальный BFCache на устройстве. Эти проверки не подтверждают
OAuth, production D1, staging, merge или deploy.

## Следующие обязательные этапы

- Подключить отдельный AI-сценарий `useFamilyMenu`: сейчас он использует
  прежний profile snapshot и два прямых writer. Его `saveFamilyMenu` и
  `saveFamilyShoppingItems` явно остаются на `legacyApiFetch`.
- Определить family/week CAS, версию своей мутации и атомарное соответствие
  меню/порций/покупок для всех writers, включая серверную генерацию.
- Передавать и проверять явную целевую семью для мутаций. Guard входа
  не фиксирует членство: invite/member/generate пока выбирают текущую семью
  аккаунта на сервере; смена членства в том же login требует отдельного контракта.
- Доставлять семейное намерение через единственную IDB-outbox с сохранением
  конфликта/ошибки после reload. Отмена fetch не отменяет уже принятую SQL-запись.
- Пройти прежний/новый bundles, реальный lifecycle, staging и совместимый выпуск.

Сессионный guard не устанавливает порядок конкурирующих menu/items writers
и не превращает временный HTTP-вызов в постоянную операцию.
[Общий план](../TASKS.md), [матрица P0](verification-matrix.md).

Исходники:
[hook](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/useFamilyCloud.ts),
[транспорт](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/services/familySession.ts),
[API](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/features/family/familyApi.ts),
[scope](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/features/family/actionScope.ts),
[E2E](https://github.com/Michael-edel/FitFocus/blob/9c44c2118749275cbb8ecaa11c520c43e4220000/e2e/family-session.spec.ts).
