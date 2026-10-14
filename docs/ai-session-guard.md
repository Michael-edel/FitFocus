# Привязка AI и списка покупок к сессии

Сверено: 12.10.2026. Серверный компонент:
[`16d3c34fb3c659c2b51a1473d241bfc438c46291`](https://github.com/Michael-edel/FitFocus/tree/16d3c34fb3c659c2b51a1473d241bfc438c46291),
ветка `fix/durable-outbox`. Сервер входит в опубликованный `8fc0b1b`;
персональный клиент подключён на [`f4b4eee`](https://github.com/Michael-edel/FitFocus/commit/f4b4eee1e577292019481b711b097941df27558e) и проверен локально.
Весь P0.5 этим компонентом не закрыт. [Очередь задач](../TASKS.md).

## Причина изменения

Ранее `/api/ai` и `/api/weekly_menu/items` учитывали только cookie на момент
запроса. Они не сверяли переданные клиентом исходный аккаунт и сессию.
Меню генерируется асинхронно, а затем `generateWeeklyMenu` дополнительно
записывает нормализованный список покупок на сервере. Поэтому одного запрета
обновлять React после logout недостаточно: нужна проверка каждого HTTP writer.

Клиент опубликованной ревизии `8fc0b1b` вызывает эти endpoints без scope
headers. Последующий персональный menu-сценарий уже передаёт scope и
проверен локально. В текущем рабочем дереве недельный AI-отчёт и его retry
также используют свежий scope и durable guard; локальные результаты и границы
приведены в [отдельном контракте](weekly-ai-report-session.md). Остальные AI
retry и family callbacks, а также полная приёмка остаются открытыми. Этот
документ разделяет серверный контракт, клиентские компоненты и условия
дальнейшего завершения.

## Контракт сервера

`GET /api/me` возвращает дополнительные capabilities:

```json
{
  "aiSync": { "protocol": 1, "guard": 1 },
  "weeklyMenuSync": { "protocol": 1, "guard": 1 }
}
```

Публичные `accountId` и `sessionId` берутся из `stateSync` того же проверенного
ответа. `sessionId` — SHA-256 от назначения, аккаунта и серверного sid;
cookie и сырой sid не возвращаются. Повторный вход в тот же аккаунт меняет
привязку, если изменилась серверная сессия.

Оба POST поддерживают парные заголовки:

```text
X-FitFocus-State-Account: <accountId>
X-FitFocus-State-Session: <public sessionId>
```

Если передан хотя бы один заголовок, оба должны точно соответствовать
аутентифицированному пользователю и его текущей сессии. Неполная пара,
другой аккаунт, другой вход того же аккаунта и неверный proof дают 401.
Проверка следует после обычной аутентификации и предшествует:

- для AI — проверке доступа, лимитам, dedup/cache, провайдеру и его побочным эффектам;
- для списка покупок — `ensureUserRow`, обработке payload и сохранению items.

Обычная проверка cookie может читать таблицы сессий и пользователей.
Тестовое утверждение об отсутствии прикладных DB-вызовов не означает,
что аутентификация обходится без чтения D1.

Ответы `/api/ai` содержат `X-FitFocus-AI-Protocol: 1` и
`X-FitFocus-AI-Guard: 1`; ответы items — `X-FitFocus-Weekly-Menu-Protocol: 1`
и `X-FitFocus-Weekly-Menu-Guard: 1`. Переданные scope headers возвращаются
в ответе. Они присутствуют также при ошибке и сами по себе не доказывают
успех: новый клиент обязан проверить HTTP-статус, протокол, scope и актуальность
исходной сессии до применения результата.

Запрос без обоих заголовков обслуживается как прежний. Это сохраняет старый
протокол, но не защищает такой запрос от смены cookie. Наличие capability
не останавливает старые writers и не делает текущие callbacks безопасными.

## Проверенная граница

Регрессионные тесты запускают HTTP handlers и проверяют смену аккаунта,
повторный вход того же аккаунта, отсутствие каждого заголовка по отдельности,
неверный proof, правильный scope и прежние запросы без scope. Для AI успешная
проверка привязки доходит до отдельного отказа доступа, не вызывая провайдера;
для items проверяется вызов сохранения с аутентифицированным владельцем.
Публичные заголовки и `/me` не раскрывают исходный серверный sid.

До исправления целевой набор дал 13 failed / 7 passed. После — 22 passed
в трёх файлах; полный unit-набор — 860 passed / 179 файлов. Три typecheck,
guards, schema/privacy, build и audit прошли. Это локальные результаты
`16d3c34`; CI итогового опубликованного HEAD проверяется отдельно.
Реальный OAuth, staging и deploy этим набором не подтверждены.

Исходники: [guard](https://github.com/Michael-edel/FitFocus/blob/16d3c34fb3c659c2b51a1473d241bfc438c46291/functions/api/_lib/state_session.ts),
[AI handler](https://github.com/Michael-edel/FitFocus/blob/16d3c34fb3c659c2b51a1473d241bfc438c46291/functions/api/_lib/ai_request_handler.ts),
[items handler](https://github.com/Michael-edel/FitFocus/blob/16d3c34fb3c659c2b51a1473d241bfc438c46291/functions/api/weekly_menu/items.ts),
[HTTP-тесты](../tests/ai_menu_session_guard.test.ts),
[/me и state-тесты](../tests/state_session_guard.test.ts).

## Клиентское подключение в работе

Персональное недельное меню подключено на [`f4b4eee`](https://github.com/Michael-edel/FitFocus/commit/f4b4eee1e577292019481b711b097941df27558e). Остальные writers пока
не переведены, весь P0.5 остаётся открытым. Последовательность действия:

1. `prepareAiSession` читает исходную IDB-сессию и проверяет свежий `/me`,
   обе capabilities, account и server session. Другая cookie-сессия не
   усваивается старой попыткой. Scope копируется до первого ожидания.
2. AI POST использует этот scope и ограниченный transport, включая body,
   без скрытого повтора мутации. Ответ проверяется по protocol/guard/scope,
   HTTP-статусу и актуальному auth-fence. Нет fallback к незащищённому HTTP.
3. Lifetime попытки включает login/page/generation. Logout, новая попытка,
   pagehide и unmount останавливают прежнюю; pageshow создаёт новую,
   не оживляя старую. Старый finally не сбрасывает loading нового действия.
4. `StateEditor.commitGenerated` получает functional patch текущего профиля.
   В одной readwrite-транзакции outbox проверяются session, epoch, auth-fence
   и актуальность правки перед записью value/операции. Копия proof не позволяет
   вызывающей стороне заменить его во время ожидания. Обычные offline edits
   не требуют этой HTTP-сессии. UI получает generated value после commit.
5. Только pending profile commit разрешает achievement и явный items POST.
   Quota, конфликт, устаревший редактор и закрытая попытка не выдают успешное
   меню и не отправляют items. Независимая правка сохраняется.
6. Ошибка items показывает «Меню сохранено на устройстве. Список покупок
   не отправлен на сервер». Таймаут запроса отменяет request-controller,
   сохраняя lifetime действия для error/finally; loading снимается и доступен
   повтор. Явная отмена действия по-прежнему прекращает transport.

Отмена во время `/me` классифицируется как смена действия, а не транспортная
недоступность для local fallback. Таймаут самого `/me` остаётся ограниченной
транспортной ошибкой. В интерфейсе desktop-панель теперь прокручивается;
«Настройки» и logout доступны в окне высотой 720 px.

Локальные проверки: **900 unit / 183 файла**, три typecheck,
admin/auth/API guards, schema/privacy, audit и production build прошли.
Полная браузерная матрица: **200 passed / 1 failed / 9 skips**, workers=4, retries=0;
49 новых проверок меню прошли в семи проектах. Они проверяют commit до items,
quota, logout, независимую правку, отказ items, pagehide/pageshow и timeout/retry.
Обработчики lifecycle проверены синтетическими событиями, а не реальным
BFCache браузера. Unit проверяет смену аккаунта/повторный вход и две IDB
connections; старые и новые bundles на одном origin этим не проверены.

Browser plugin not available: использован repository Playwright с mock API,
`http://127.0.0.1:4173`. Проверяются URL/title входа, содержимое, overlay,
ошибки браузера, viewport и реальные клики. Разрешена только внесённая 503
resource-ошибка отдельного items-сценария; фильтра CORS/pageerror нет.
История red/fixed проверок — [в журнале](stabilization-progress.md).
На снимке `f4b4eee` итоговый CI проверялся отдельно. Поздний PR CI для
ветки `fix/durable-outbox`, HEAD `6c6feca`, завершился success
([run 38550243769](https://github.com/Michael-edel/FitFocus/actions/runs/38550243769)).
Mock API и локальные результаты не подтверждают настоящий OAuth, реальные
устройства или staging.

Личный список покупок больше не отправляется отдельным items-запросом:
profile CAS атомарно обновляет SQL-проекцию, а клиент использует одну durable
profile-операцию. Семейное меню, порции и покупки сохраняются как единое
family/week-поколение через `familyMenu` outbox и серверный CAS. Эти контракты
закрывают порядок указанных menu/items writes; они не задают глобальный порядок
между несвязанными writers. Остальные AI/retry writers, family callbacks,
staging и старые сборки остаются открытыми.

Исходники и проверки: [AI transport](../services/aiSession.ts),
[scope](../features/ai/actionScope.ts), [menu use case](../features/ai/useWeeklyMenuGeneration.ts),
[commit tests](../tests/generated_result_commit.test.ts),
[HTTP tests](../tests/ai_session_transport.test.ts),
[lifetime tests](../tests/weekly_menu_lifetime.test.ts),
[scope tests](../tests/ai_action_scope.test.ts),
[browser tests](../e2e/weekly-menu-durability.spec.ts).

## Исторический этап клиентской интеграции на f4b4eee

Следующие пункты описывают последовательность первоначального guarded-menu
компонента. После него личный items POST был заменён profile CAS-проекцией;
текущее поведение и проверки записаны в
[контракте личных покупок](personal-menu-projection.md).

- [x] Проверять переданную привязку в обоих серверных handlers и объявлять capabilities.
- [x] Для персонального меню получать свежий proof исходного аккаунта, проверять capability
  нужного endpoint и передавать парные headers; отсутствие capability не заменять
  обычным запросом с текущей cookie.
- [x] Для персонального меню останавливать запросы и применение старого результата после logout,
  другого входа, pagehide и unmount; возврат BFCache не оживляет прежнюю попытку.
- [x] Сохранять меню через текущий profile editor, ожидать постоянный commit,
  сохранять независимые изменения профиля и учитывать конфликт/отказ хранения.
- [x] Убрать скрытый items writer из стадии вычисления меню; явно определить
  порядок сохранения и поведение при отказе вторичной записи.
- [x] Убрать отдельный личный items writer: принятый profile CAS обновляет
  покупки одной SQL-проекцией; семейное меню и покупки используют свою
  `familyMenu` outbox-операцию и family/week CAS.
  [Личный контракт](personal-menu-projection.md),
  [семейный контракт](family-menu-state.md).
- [x] Для недельного AI-отчёта и его retry получать свежий proof, связывать
  попытку с исходной сессией и защищать durable commit; локальные проверки
  описаны в [отдельном контракте](weekly-ai-report-session.md).
- [ ] Перевести оставшиеся retry-сценарии и family callbacks; проверить два
  аккаунта, повторный вход, независимую правку и поздний ответ в браузере.
- [ ] Подтвердить серверные capabilities на staging до выпуска нового клиента.

Контракты данных и выпуска: [API](../API_CONTRACTS.md),
[профиль](profile-persistence.md), [release checklist](../RELEASE_CHECKLIST.md).

Отдельный writer — достижения: после успешного commit меню вызывает
`checkAchievements`. На снимке `f4b4eee` проверка menu use case до вызова
не защищала последующий HTTP при смене cookie. Компонент `57da2cf` добавляет
[собственные server/client guard, очередь и lifetime](achievement-session.md).
Profile CAS для личных покупок и family/week CAS для семейного меню реализованы.
Остальные producers и побочные эффекты меню требуют отдельной проверки; staging
и полная lifecycle-приёмка не подтверждены.

На предыдущем снимке `f4b4eee` полная приёмка оставалась открытой:
200 passed / 1 failed / 9 skips. Старый profile reload на desktop WebKit воспроизвёл native сообщение
`/api/me due to access control checks` после успешных функциональных проверок.
Трасса указывает на `verify` sender через `requestJson` во время reload.
Последующее исправление этого callback описано ниже; остальные lifecycle
сценарии остаются открытыми. Сообщение не скрыто.

Последующая полная локальная матрица на [`f3930ec`](https://github.com/Michael-edel/FitFocus/commit/f3930ec64f7fa74f3aad352246aa18b92d2542b7) прошла: 201 passed / 9 skips,
без retries; 905 unit / 183 файла. Исправлен отдельный profile debounce,
который запускал `/me` при reload. [Контракт](state-sender.md#автоматическая-отправка-и-ручная-проверка-сессии).
Сам profile-компонент не закрывает achievement HTTP; он подключён позднее
в [отдельном `57da2cf`](achievement-session.md). Остальные AI writers и настоящий
BFCache/staging остаются открытыми. CI `bf01d87` для profile-компонента прошёл:
905 unit, 201 browser passed / 9 skips, без flaky; новые изменения проверяются отдельно.


## Последующий компонент 4736ff5: личные покупки

Прежний явный личный items POST после IDB commit заменён SQL-проекцией
принятого profile CAS. Используется одна постоянная profile-операция;
генерация и sender дополнительно требуют projection capability.
Scoped личный POST отклоняется кодом PERSONAL_MENU_PROFILE_REQUIRED,
семейный путь остаётся отдельным. Исторические результаты этого документа
не переносятся на новый код. [Текущий контракт и свидетельства](personal-menu-projection.md).

Клиентские
Клиентские AI callbacks, которые ещё не подключены к этому протоколу, описаны
в [отдельном контракте coach/plan/plateau](ai-callback-sessions.md); требования
к недельному отчёту находятся в [его контракте](weekly-ai-report-session.md).
