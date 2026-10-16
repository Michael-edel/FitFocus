# Стабилизация и развитие FitFocus

Обновлено: 16.10.2026. PR [#93](https://github.com/Michael-edel/FitFocus/pull/93)
остаётся draft; ветка `fix/durable-outbox` проходит стабилизацию P0.8/P0.9.
Browser acceptance теперь проверяет все семь причин повреждения legacy-записей
на реальном old/new bundle migration, а удаление аккаунта вместе с глобальной
legacy evidence — отдельным unit lifecycle тестом. Локально прошли 7/7
browser/PWA-проектов, 132/132 targeted unit, typecheck и diff check.
Для объединённого HEAD необходим полный точный CI; staging, выпуск и интеграция
в защищённую `main` не подтверждены.
В плане остаются 34 пункта: 20 P0, 7 P1 и 7 следующих задач; ни один P0 пока
не закрыт полностью. Staging, выпуск и интеграция в защищённую `main` не
подтверждены.

Тестовые follow-up `ad89020` и `aa4073c` усиливают PWA update acceptance и
устраняют две flaky-проверки, замеченные в CI на `96937ea`. Локально прошли
rollback lifecycle 6/6 на desktop engines, `family-menu-durable.spec.ts` 39/39
на Chromium/Firefox/WebKit, `owned-state.spec.ts` 4/4 на Firefox и typecheck.
Точный CI `96937ea` завершился success, но отметил эти 2 flaky; CI нового HEAD
после push ещё ожидается.

В `TASKS.md` остаются 34 незакрытых checkbox: 20 P0, 7 P1 и 7 пунктов вне этих
приоритетных разделов, которые нужно сверить на дубли. Все P0 остаются открытыми
до остальных writers/callbacks, staging и полной приёмки lifecycle/release.
Подробности — в [журнале](docs/stabilization-progress.md) и
[матрице](docs/verification-matrix.md).

Последний полный CI без flaky ранее проверил source HEAD
[`455cb01`](https://github.com/Michael-edel/FitFocus/commit/455cb0160ee3c5fa3d8bb2b455f1aae385f7c5ae)
в [run 38656586334](https://github.com/Michael-edel/FitFocus/actions/runs/38656586334):
unit, audit, guards, три typecheck, build, E2E и rollback/CAS прошли.
Предыдущий run [38586274014](https://github.com/Michael-edel/FitFocus/actions/runs/38586274014)
на `23c8be6` также завершился штатно примерно за 33 минуты.
Кодовый follow-up [`37dc4b0`](https://github.com/Michael-edel/FitFocus/commit/37dc4b0c26326cb6f862ab7baa945a802a03990b)
переводит legacy migration readwrite callbacks на активные IDB request events.
В [`2c09825`](https://github.com/Michael-edel/FitFocus/commit/2c09825406d8f43c3cdaeaa1a02096a2573c7295)
добавлена проверка позднего family-menu preview, а follow-up
[`13e336d`](https://github.com/Michael-edel/FitFocus/commit/13e336d9e3c67025f166a0ffce37ff776c46cdfa)
проверяет отложенное чтение durable menu-state после смены аккаунта. Вся suite
прошла 39/39 на Chromium, Firefox и WebKit без retries; follow-up включён в
полный CI `455cb01` и завершился success.
Все P0 остаются открытыми до остальных writers/callbacks, staging и полной
приёмки lifecycle/release.

Кодовый commit [`eae1ce1`](https://github.com/Michael-edel/FitFocus/commit/eae1ce18567a967acf9c6e0a2812b48c2a9ef979)
добавляет account-switch acceptance для personal-plan retry: Chromium, Firefox
и WebKit прошли 3/3, `npm run typecheck` прошёл. Точный CI `c48ce1b` прошёл;
следующий commit `d5341a0` исправил flaky migration assertion: она сравнивает
стабильные fingerprint-поля без изменяемого `retryCount`. В CI `7c50f08` этот
тест больше не flaky; локально он прошёл 5/5 серийно, 3/3 параллельно и 7/7 в
browser/PWA-матрице. В CI `38435173387` остались 3 других flaky (weekly-menu
Firefox и Android PWA); следующий CI `38440675173` сообщил иной набор из 3
flaky. Их точечные локальные повторы прошли 5/5, 5/5 и 3/3, но первопричины
пока не установлены. P0.5 и P0.8 остаются открытыми до остальных
callbacks, общей lifecycle-приёмки и staging.
Подробные критерии — в разделах P0 ниже.

## Предыдущие результаты

Mock-фикстура опубликована в `085fcc1` и проверена полным CI `aefc463`.
Ранее подтверждённый [CI для tombstone-коммита `57e0a93`](https://github.com/Michael-edel/FitFocus/actions/runs/38340805337):
1082 unit / 197 файлов; browser — 390 passed / 9 skips, success, 21,1 мин.
Dependency audit сообщил 0 уязвимостей; rollback-check выполнил 23 HTTP/D1-запроса.
P0.8 остаётся открытым до полного lifecycle и общей приёмки. Полный
[CI run 38318876304](https://github.com/Michael-edel/FitFocus/actions/runs/38318876304)
на `c724bce` также завершился success. После него настоящий old/new bundle smoke
прошёл на семи Playwright-проектах и проверен полным [CI `00cd005`](https://github.com/Michael-edel/FitFocus/actions/runs/38324638965).
Последующий CI базового docs SHA `d987c846` тоже завершился success ([run
38330238660](https://github.com/Michael-edel/FitFocus/actions/runs/38330238660)).
Cleanup-компонент затем опубликован в [`b53a55e`](https://github.com/Michael-edel/FitFocus/commit/b53a55eaf272ca8ad6ba8653760f502b0e993b6b); его точный CI прошёл.
Исправление неиспользуемого Google SDK опубликовано в `98d4910`.
Компонент артефакта отката опубликован в `bd763ec`; поправка CI — в `5b90249`.
Полная приёмка проверяется отдельно;
[текущий статус](docs/project-status.md#рабочее-дерево--обновление-pwa).

Предыдущий компонент — [личные покупки](docs/personal-menu-projection.md)
`4736ff5` с серверной поправкой `830caf4`. Подготовительная версия и переход
0019 → 0020 → проекция описаны в [инструкции выпуска](docs/profile-cas-rollout.md).
История достижений, формы, прежних прогонов и исправлений сохранена
[в журнале](docs/stabilization-progress.md) и контрактах компонентов.

Пакет account-scoped cleanup опубликован в [`b53a55e`](https://github.com/Michael-edel/FitFocus/commit/b53a55eaf272ca8ad6ba8653760f502b0e993b6b).
Точный [CI run 38334411131](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131)
завершился success: 1079 unit / 197 файлов, 390 browser passed / 9 skipped,
20,1 мин; audit, guards, три typecheck, build и 23 HTTP/D1-запроса прошли.
Rollback-артефакт сохранён в [run](https://github.com/Michael-edel/FitFocus/actions/runs/38334411131/artifacts/11784907304).
Общий legacy-источник и снимки сохраняются, поэтому полное удаление локальных
копий не подтверждено. Контракт: [очистка данных аккаунта](docs/account-data-cleanup.md).

Полная область — в [карте документации](docs/README.md),
текущая работа — в [статусе проекта](docs/project-status.md). Этот файл — очередь реализации.
P0.8 подключён к runtime; реальная миграция pending legacy intent из старого
bundle проверена на семи Playwright-проектах и прошла CI на `00cd005`; cleanup
опубликован в `b53a55e` и прошёл точный CI. Ни один P0 целиком не закрыт.

## Подготовленный компонент — preview origin

- [x] Воспроизвести клиентский переход preview → production и убрать его
  из entry point; сохранить URL и относительные API выбранного origin.
- [x] Локально проверить три hostname на семи конфигурациях и native PWA-shell:
  28/28, workers=1/retries=0; typecheck и admin guards прошли.
- [x] Подтвердить [CI компонента `076f4ac`](https://github.com/Michael-edel/FitFocus/actions/runs/38261672999):
  success, 1053 unit / 194 файла, 383 browser passed / 9 skips, 20,3 мин;
  23 HTTP/D1-запроса прошли.
- [ ] Проверить фактический deployment, D1, APP_URL, OAuth и edge-правила.
  - [x] Проверить preview SHA `9c78726` только GET-запросами: bundle содержит
    полный SHA, публичная страница открывается на preview origin, анонимные API
    отказывают ожидаемо. Реальный OAuth start вернул `AUTH_UNAVAILABLE`;
    конфигурация OAuth в Pages и остальные staging gates остаются открытыми.

База компонента — `aefc463`; [контракт и история прогонов](docs/staging-origin.md).
Это локальная часть подготовки staging, а не закрытие P0 или выпуск.

## Порядок работы

CI `076f4ac` завершился success без flaky и proxy-ошибок; причины прежних native WebKit/Firefox сбоев ещё требуют отдельной диагностики. Два полных прогона rollback artifact `574de76`
дали 26 passed / 2 failed каждый; база содержит лишний Google SDK и не принята.
В `98d4910` SDK удалён из HTML. В новом компоненте обновлены закреплённый SHA
и workflow-пути, собран архив `98d4910`: 82 файла, 28 browser passed на семи
конфигурациях, workers=1/retries=0, 13,2 мин. HTTP/D1-переход `bd763ec`
→ архив `98d4910` прошёл 23 запроса. CI `5b90249` также прошёл 23 HTTP/D1
запроса и сохранил `.tar`; скачанный архив проверен. Ближайшие шаги —
разобрать Firefox IDB timeout и native WebKit sender error, затем пройти staging.
Тест восстановления pending теперь учитывает сохранённые `Retry-After`
и lease; проверяет время приёма на HTTP-фикстуре. Production backoff/claim
не изменены. Диагностика с Retry-After прошла 3/3 в desktop-движках.
Временная подмена внешнего SDK дала 4/4 Firefox/Android, но не устранила
ошибки полного повторного прогона; подмена удалена. История сохранена
в [журнале](docs/stabilization-progress.md).
- [x] Устранить выход mock API-запросов при WebKit teardown без фильтрации
  ошибок: общая фикстура выгружает документ до снятия маршрутов; полный CI
  `aefc463`/`076f4ac` прошёл без preview ECONNREFUSED/proxy errors.
Первый расширенный прогон — 97 passed / 1 failed на iPhone PWA. После отдельного
ожидания самого экрана перед семейными данными прошли 98/98 на семи конфигурациях,
workers=2/retries=0, без proxy-ошибок. Typecheck прошёл; полный CI mock-фикстуры
подтверждён на `aefc463`. [Доказательства и следующий шаг](docs/mock-api-lifecycle.md).
Текущий шаг P0.8 подключает runtime-импорт к свежему `/api/me` и требует
подтверждение build id от всех same-origin вкладок перед отправкой legacy-операций.
В unit/integration проверках покрыты владелец, карантин, отсутствие proof и закрытый
send gate; настоящий PWA update-тест проверяет fence и сохранность очереди/профиля.
Smoke настоящей legacy-записи между старой и новой сборками прошёл локально 7/7;
CI точного SHA `00cd005` завершился success в [run 38324638965](https://github.com/Michael-edel/FitFocus/actions/runs/38324638965).
Формат backup v3 для всех пяти IDB stores и атомарный restore реализованы и
опубликованы в [`2aff6c3`](https://github.com/Michael-edel/FitFocus/commit/2aff6c33d638052d9a084902895df822efb269e5).
Локально прошли 1073 unit / 196 файлов, три typecheck, production build и 7/7
тестов backup. [Полный CI PR-head `2aff6c3`](https://github.com/Michael-edel/FitFocus/actions/runs/38327323270)
завершился success: 1073 unit / 196 файлов, 390 browser passed / 9 skips
(15,7 мин), audit/typechecks/guards/schema/privacy/build и 23 HTTP/D1 rollback
проверки прошли. Далее — остальные callbacks P0.2–P0.6, полная lifecycle-
приёмка recovery UI и staging/rollback acceptance. Account-scoped cleanup
реализован; общее legacy evidence физически не удаляется.
Интеграция P0.1 и серверной части P0.7 в защищённую main остаётся открытой.
P0.9 пополняется тестами каждого исправления и завершается проверкой
всего жизненного цикла и выпуска. [Подробный статус](docs/project-status.md),
[матрица подтверждённых частей и открытых критериев](docs/verification-matrix.md).

Новые независимые ветки начинать от актуальной GitHub `origin/main`.
Если нужны изменения из PR #90, сначала выделить или интегрировать
необходимую зависимость и явно указать её в PR. Не отправлять локальную
`main` целиком: на дату снимка она опережает `origin/main` на 250 коммитов.

## Завершённый клиентский этап 11.10.2026

Список управляемых state-ключей расширен с 6 до 15, прежний sender удалён
из текущей сборки. [Граница реализации](docs/owned-state-writers.md).

- [x] Исправить ожидание `quota` / `STATE_STORAGE_QUOTA` в новом тесте
  отказа удаления; подтвердить rollback и сохранность видимого значения.
- [x] Проверить гонку удаления с новой правкой, раннюю правку до загрузки,
  привязку редактора и syncNow к исходному аккаунту.
- [x] Проверить в браузере отметки плана и очистку истории с reload;
  убедиться, что чтение не создаёт операций и legacy-источник сохранён.
- [x] Выполнить локальные проверки и обновить контракты по итоговой реализации.
  Код `31ec847` опубликован с документацией на `44e0c32`;
  [CI этой ревизии прошёл](https://github.com/Michael-edel/FitFocus/actions/runs/38150544608).
  SHA, результаты и ограничения — в [журнале](docs/stabilization-progress.md).

Дополнение `fc6bb82`: [редактор профиля](docs/profile-persistence.md)
использует единственную outbox, отдельный guarded HTTP и CAS; отказ commit
сохраняет dirty-форму. 790 unit-тестов прошли; результаты браузеров и
остальных проверок записаны [в журнале](docs/stabilization-progress.md).

Дополнение `2e41742`: [регистрация](docs/registration-persistence.md)
сохраняет canonical profile до AI, AI-update продолжает ту же цепочку;
quota оставляет форму открытой. Вход не угадывает владельца по email,
не переименовывает prefix и восстанавливает только own IDB-profile.
Invite redeem проверяет свежую session-привязку до расходования кода.
814 unit-тестов прошли; результаты браузеров — в журнале.

Исправление `b723b7d` останавливает sender при pagehide и заново проверяет
сессию при возврате из BFCache. После него прошли 816 unit-тестов,
117 браузерных сценариев и 9 явных skips; два Safari reload-сценария
дополнительно прошли 20 повторов. [Контракт](docs/state-sender.md#жизненный-цикл-страницы).

На `cb6e6cf` тест регистрации ожидает постоянную auth-паузу вместо точного
числа запросов до UI-проверки. 817 unit-тестов и 20 повторных сценариев
Firefox/iPhone PWA прошли; исходный flaky в CI и проверка нового HEAD —
[в журнале](docs/stabilization-progress.md).

Далее продолжить незакрытые P0 ниже. Отключение sender в новой сборке
не является доказательством остановки ранее открытых старых сборок.

## В работе — загрузка сессии и облачных данных

Контракт и результаты: [bootstrap/hydration](docs/bootstrap-hydration.md).
Код компонента — `dac2de2`; пункты P0.3–P0.6 остаются открытыми для остальных
writers/callbacks и приёмки. [CI `57f956d`](https://github.com/Michael-edel/FitFocus/actions/runs/38170218508)
прошёл: 846 unit, 145 browser passed / 9 skips, без flaky. CI опубликованного
исправления `45315d9` также прошёл: 846 unit, 152 browser passed / 9 skips,
без flaky; [запуск](https://github.com/Michael-edel/FitFocus/actions/runs/38172605267).
Предыдущее падение регистрации Safari на `ece4e7a` сохранено в журнале; успешный
следующий запуск сам по себе не устанавливает причину.

- [x] Останавливать вход при успешном `/me`, который не подтверждает аккаунт,
  доступ или capability, включая путь без входящего readGuard; добавить
  регрессионные тесты отдельно от восстановления при ошибке сети.
- [x] Не повышать revision при повторном чтении того же owned-снимка;
  независимые изменения и новая версия сервера по-прежнему дают конфликт.
- [x] Устранить гонку проверки очистки истории: pending и содержимое
  проверяются по одному снимку IDB. 15 повторов прошли без retries.
- [x] Стабилизировать область notice при удержанном profile Save (`3550cc8`). В диагностическом
  прогоне pointerdown попал в кнопку, а через 12 мс pointerup/click — в DIV;
  outbox и список PUT остались пустыми. Проверить изменение расположения формы
  при обновлении notice. До исправления регрессионный тест подтвердил сдвиг
  документа на 86/86/106 px в Chromium/Firefox/iPhone PWA; после прошёл во всех
  семи проектах. Исходный и новый сценарии прошли 20 повторов Safari/PWA.
  Проверено: удержать нажатие, завершить state-sync и отпустить указатель;
  кнопка остаётся целью, создаётся одна profile-операция, а 409 сохраняет её
  локальный payload и серверный снимок. Повторный клик не считается исправлением.
- [ ] Завершить диагностику остальных Safari reload sources, включая `/api/profile`.
  Источник profile debounce → `/api/me` установлен и исправлен на `f3930ec`;
  это не объясняет автоматически все исторические сообщения. На `45575d2`
  profile durability прошёл без retries: 8/8 desktop WebKit, 8/8 iPhone Safari,
  8/8 iPhone PWA; pageerror не возник. На HEAD `404b3da` те же три проекта
  повторно прошли 24/24 (`workers=1,retries=0`). На точном HEAD `62bd28c`
  конфликт профиля после 409 прошёл ещё 24/24 повторов на desktop WebKit,
  iPhone Safari и iPhone PWA (`workers=1,retries=0`); pageerror не возник.
  Историческая причина пока не установлена.
  Общий CORS-фильтр не добавлять.
- [x] Опубликовать компонент и проверить CI точного `ece4e7a`: success,
  846 unit-тестов, 144 browser passed / 1 flaky / 9 skips.
- [x] Проверить CI опубликованного исправления Save на точном `45315d9`:
  success, 846 unit-тестов, 152 browser passed / 9 skips, без flaky.
- [ ] После исправлений пройти полную матрицу без retries и проверить CI
  итогового HEAD. На `3550cc8`: 151 passed / 1 failed / 9 skips; падение —
  Safari page error на reload после успешного Save/409. Шесть диагностик
  с задержанными запросами и reload его не воспроизвели; общий фильтр ошибок
  не добавлен. CI `45315d9` прошёл, но локальное падение и его причина остаются
  частью исторической диагностики. В текущем profile follow-up `d6946af`
  исправлена только проверка viewport: поле настроек расположено ниже первого
  экрана на iPhone. Целевая матрица прошла 3/3, полная `profile-durability.spec.ts`
  — 63/63 на семи проектах при `workers=1,retries=0`. Это не закрывает полный
  E2E набора; точный CI `d6946af` ожидает push. В `playwright.config.ts` CI
  retries отключены, чтобы первый нестабильный запуск завершался ошибкой.
  [Подробные свидетельства](docs/stabilization-progress.md).

## Персональное недельное меню — реализация и открытая приёмка

Код [`f4b4eee`](https://github.com/Michael-edel/FitFocus/commit/f4b4eee1e577292019481b711b097941df27558e), [контракт и результаты](docs/ai-session-guard.md#клиентское-подключение-в-работе).

- [x] Подключить свежий proof исходного входа, обе capabilities и scope
  к AI/items HTTP; отсутствие capability не заменять обычным запросом.
- [x] Защитить action/page/login lifetime и поздние success/failure;
  проверить logout, независимую правку и синтетический pagehide/pageshow.
- [x] Проверять session/epoch/auth-fence и актуальность редактора внутри
  транзакции, ждать profile commit до публикации меню и вторичного writer.
- [x] Убрать скрытую отправку items из генерации; отдельно показывать её отказ.
  Quota/конфликт не создают items или achievement успешного меню.
- [x] Исправить desktop-панель: настройки доступны после обычной прокрутки.
  Убрать неверное ожидание hash при переключении React tabs в тесте.
- [x] Исправить классификацию отмены `/me` и отделить таймаут HTTP от lifetime
  попытки; проверить снятие loading и повтор генерации после таймаута.
- [x] Пройти 900 unit, три typecheck, guards/schema/privacy/audit/build.
- [x] Пройти последующую локальную матрицу на `f3930ec`: 201 browser passed / 9 skips, без retries.
  Это не закрывает реальный lifecycle/staging или CI нового HEAD.
- [x] Проверить workflow опубликованного компонента на `42ee434`: success,
  950 unit / 186 файлов, 229 browser passed / 9 skips.
- [x] Защитить achievement HTTP/очередь в `useAchievements.ts` и серверный
  handler: проверка menu use case до вызова не защищает последующий POST.
  Реализовано в `57da2cf` с поправками до `724ecf1`; локально прошли 950 unit
  и полная матрица 229 passed / 9 skips. CI `42ee434` подтверждён.
  Follow-up [`616f42c`](https://github.com/Michael-edel/FitFocus/commit/616f42ca2bb973cfb034f50112328843eaf837a4)
  требует proof также от legacy-запросов и отклоняет unscoped POST до разбора
  body. Локально прошли 1242 unit / 208 файлов, 18 профильных тестов, три
  typecheck, API/auth/schema/privacy guards и build. Старые bundles нужно
  обновить; точный CI, staging/BFCache остаются открытыми.
  Счётчики остаются best effort; staging/BFCache ещё открыты.
  [Контракт и границы](docs/achievement-session.md).
- [x] Личный список покупок переведён на profile CAS и SQL-проекцию без
  отдельного личного items POST; семейное меню, порции и покупки используют
  одну `familyMenu` outbox-операцию с CAS по семье и неделе.
  [Личный контракт](docs/personal-menu-projection.md),
  [семейный контракт](docs/family-menu-state.md).
- [ ] Проверить эти пути на staging и завершить реальные BFCache/OAuth-сценарии;
  остальные AI/report/retry/family writers и их общий lifecycle остаются открыты.
  Unit-проверка двух IDB connections не заменяет old/new bundles.

Ни весь P0.5, ни выпуск этим компонентом не закрыты.

## Последующее исправление автоматической синхронизации профиля

- [x] Установить callback native `/api/me`: debounce → `syncNow` → `verify`
  после `beforeunload`, до `pagehide`; baseline 3 failed / 13 passed.
- [x] Заменить автоматический вызов на `flushPending`; сохранить ручной свежий
  proof, auth-паузу, проверку владельца и защиту старого поколения.
- [x] Усилить E2E реальной auth-паузой, фактическими PUT/401 и тем же opId
  после reload; пройти 905 unit и полную матрицу без retries.
- [x] Не планировать flush для чистого профиля, сохранив cloud refresh и
  одноразовый suppress; проверить recovery и отсутствие ложной ошибки.
- [x] Подтвердить workflow последующего опубликованного `42ee434`.
- [ ] Завершить остальные lifecycle-сценарии и staging.
- [x] Подтвердить CI profile-компонента на `bf01d87`: 905 unit,
  201 browser passed / 9 skips, без flaky; последующие компоненты проверяются отдельно.

Реализация [`f3930ec`](https://github.com/Michael-edel/FitFocus/commit/f3930ec64f7fa74f3aad352246aa18b92d2542b7); [контракт](docs/state-sender.md#автоматическая-отправка-и-ручная-проверка-сессии),
[журнал](docs/stabilization-progress.md). Прежние падения и retries выше
сохраняются как история; общий CORS-фильтр не добавлен.

## Текущий компонент — личные покупки и profile CAS

Код [`4736ff5`](https://github.com/Michael-edel/FitFocus/commit/4736ff51b06f0062a6cb45a98169f4a4d0c39895),
[контракт и свидетельства](docs/personal-menu-projection.md),
[ADR-007](docs/adr/ADR-007-personal-menu-projection.md).

- [x] Сохранять покупки SQL-проекцией принятого profile CAS без второго
  личного POST; старый POST не меняет проекцию.
- [x] Разделить read/write-capabilities; без новой capability clean refresh
  доступен, а профиль остаётся pending с protocol-паузой.
- [x] Обновить menu E2E: ошибка сервера/reload восстанавливает тот же opId,
  личного items POST нет, capability проверяется до AI. 8 Chromium-сценариев прошли.
- [x] Пройти 976 unit / 187 файлов, typecheck/guards/schema/privacy, audit;
  проверить upgrade/изоляцию и 16 HTTP-запросов локального Worker/D1.
- [x] Пройти полную browser matrix `4736ff5`: 236 passed / 9 skips, без retries.
- [x] На `830caf4` возвращать постоянный отказ 422 для некорректного меню до
  persistence; сохранить версию и возможность явного удаления без угадывания недели.
- [x] Подтвердить CI `2d1f480`: 976 unit / 187 файлов,
  236 browser passed / 9 skips;
  [success](https://github.com/Michael-edel/FitFocus/actions/runs/38194485398).
- [x] Подготовить совместимый сервер `dde4c71` до 0020; пройти 952 unit,
  обязательные проверки/build и локальный переход на одной БД (30 HTTP).
  [Инструкция и границы](docs/profile-cas-rollout.md).
- [x] Подтвердить [CI подготовительного `c39904c`](https://github.com/Michael-edel/FitFocus/actions/runs/38196258543):
  952 unit, 229 browser passed / 9 skips, success.
- [ ] Подтвердить CI следующих release-ревизий.
- [ ] Проверить staging, реальные старый/новый bundles и совместимый откат;
  затем продолжить семейные writers и остальные callbacks.

P0.5, P0.8 и выпуск остаются открытыми. Это реализация существующего плана;
серверная атомарность личных покупок не закрывает семейный путь.

## P0 — сохранность данных и выпуск

Последующий компонент `9c44c21` — [сессии семейных запросов](docs/family-session.md):

- [x] Передавать исходный login guard из hydration в `useFamilyCloud`;
  требовать fresh proof и family capability перед каждым HTTP-запросом.
- [x] Проверять server scope до эффектов family/shopping handlers;
  late response, same-account login и pagehide не применяют старый результат.
- [x] Изолировать React-состояние/setters по login scope, покупки — также по familyId;
  отклонять неправильные family/week и повреждённые ответы.
- [x] Снимать необработанный Promise отметки, восстанавливать checkbox при отказе.
- [x] Пройти 1009 unit / 189 файлов, три typecheck, guards/schema/privacy и audit.
- [x] Пройти 23 HTTP-запроса локального workerd/D1 с двумя синтетическими аккаунтами.
- [x] Подтвердить полную browser matrix в CI `3baac01`: 278 passed / 9 skips,
  семь проектов, workers=2, без flaky в итоговом summary. Первый локальный
  прогон 272 passed / 6 failed / 9 skips и диагностика 12 passed сохранены в журнале.
- [x] Подтвердить [CI опубликованного `3baac01`](https://github.com/Michael-edel/FitFocus/actions/runs/38200234936).
- [x] Подтвердить последующий [CI `0eae743`](https://github.com/Michael-edel/FitFocus/actions/runs/38201311011):
  1009 unit / 189 файлов, 278 browser passed / 9 skips; без flaky в итоговом summary.
- [x] Подключить `useFamilyMenu` к durable `familyMenu` intent, family/week
  CAS и единой серверной записи меню/порций/покупок. Реализация `405238b`
  прошла CI; контракт и проверки — [здесь](docs/family-menu-state.md).
- [ ] Проверить реальные old/new bundles, PWA/Service Worker, staging и
  совместимый откат; это остаётся release gate.

[Точная граница семейного компонента](docs/project-status.md#текущая-работа--семейное-меню).
- [x] Подключить AI и server-preview к единственному familyMenu intent с исходным
  login guard, captured revision/baseVersion и guarded локальным commit.
- [x] Принимать family/week CAS одной SQL-записью, читать покупки из того же
  поколения и не восстанавливать legacy для empty/corrupt canonical.
- [x] Добавить 0021 SQL-барьер прежних writers и versioned IDB v3 opens;
  проверить preservation старых stores на fake IndexedDB.
- [x] Пройти 1039 unit, три typecheck, guards/schema/privacy/audit, 16 новых
  Chromium/iPhone browser-сценариев и 33 HTTP локального workerd/D1.
- [x] Пройти полную browser matrix и [CI точного опубликованного кода `405238b`](https://github.com/Michael-edel/FitFocus/actions/runs/38208076392):
  1039 unit / 191 файл, 334 browser passed / 9 skips, без flaky в итоговом summary.
- [x] Проверить настоящие v2/v3 bundles на одном origin локально: 2/2,
  pending/conflicted, старый reopen=VersionError, старые мутации=0,
  профиль/marker ledger/quarantine/auth-fence сохранены; mock API, SW отключён.
- [x] Локально проверить предложение обновления и сохранность profile/family
  intent с настоящими v2/v3 SW и native HTTP: 7/7 в составе 63 связанных
  сценариев на семи конфигурациях, workers=1/retries=0. [Контракт](docs/pwa-updates.md).
  Standalone эмулируется; это не staging и не установка на устройстве.
- [x] Проверить потерю первого SKIP_WAITING, deadline, сохранность черновика
  и успешный повтор: 7/7 real-SW/native HTTP; затем 1043 unit / 192 файла,
  три typecheck, guards/schema/privacy и audit (0).
- [x] Подтвердить [CI PWA `8d32f12`](https://github.com/Michael-edel/FitFocus/actions/runs/38224847501):
  1043 unit / 192 файла, 341 browser passed / 9 skips; success.
- [ ] Исследовать Firefox timeout в `pwa-update.spec.ts` на `saved(page)`
  до активации SW: CI `98d4910` прошёл этот сценарий только с retry.
  Установить причину по trace/IDB lifecycle и подтвердить без retries;
  не считать повтор или увеличение таймаута исправлением. На базе `076f4ac`
  локально воспроизведён 1 timeout / 3 повтора (`retries=0`); затем прошли
  17 попыток с IDB open/versionchange logging и одна с полной стадийной
  диагностикой. На опубликованной `47da77c` прошли 3+8 запусков с IDB-логами
  и 3+8 без instrumentation (временно восстановлены тест/helper `076f4ac`);
  все `workers=1,retries=0`. В `96937ea` test helper и failure-only probe
  используют уже открытую приложением IDB v3 connection вместо независимых
  `indexedDB.open()` запросов; trace связывает задержку с очередью наблюдателя
  на том же origin рядом с открытием legacy v2. Firefox прошёл ещё 10/10
  локальных повторов, а точный CI [`38729850933`](https://github.com/Michael-edel/FitFocus/actions/runs/38729850933)
  для `96937ea` завершился success. В том запуске были 2 flaky в других E2E;
  они исправлены в `aa4073c`. Точный CI нового HEAD ещё ожидается, поэтому пункт
  пока открыт. Working tree сохраняет IDB open/blocked/upgrade,
  versionchange/close и стадии transaction/read в failure attachment. На HEAD
  `404b3da` Firefox `pwa-update.spec.ts` прошёл ещё 5/5 последовательных
  запусков (`workers=1,retries=0`); timeout снова не воспроизведён, поэтому
  первопричина остаётся открытой.

- [x] Разобрать исторический native WebKit pageerror по trace CI `5b90249`:
  ошибка привязана к отмене семейного PUT при reload после `controllerchange`,
  когда rollback-клиент отправляет повтор после `503`. В точном bundle `98d4910`
  запрос проходит через `requestJson` и `try/catch` метода `StateSync.drain`;
  regression также подтверждает сохранение opId/payload. Это не доказывает
  потерю операции и не требует общего фильтра CORS-ошибок.
- [x] Разобрать CI run #1417 `38845192574`: audit, guards, unit, typecheck и
  build прошли; E2E завершился failure (27 failed, 706 passed, 247 skipped).
  В 12 callback-сценариях устаревшие вкладки ошибочно ждали UI прежнего
  аккаунта; multi-tab тест использовал mock-ответы без scope-заголовков;
  storage-тесты испытывали такой же mock-побочный эффект.
- [x] Уточнить локальные E2E: callback-тесты проверяют stale-session guard;
  multi-tab удерживает валидные ответы, storage/preview используют scoped
  responses. Проверки прошли: callback 12/12 на desktop engines, multi-tab
  7/7 browser/PWA проектов, storage 6/6 на WebKit/iPhone Safari/iPhone PWA,
  preview-origin 3/3 на WebKit. Отдельный family stale-read Safari тест прошёл
  локально и учитывает ограниченный WebKit abort message.
- [ ] Подтвердить точный CI исправленных тестов и PWA lifecycle:
  run #1418 для `e4ced68` поставлен в очередь; тест ждёт первый `503`, задерживает следующую
  попытку и активирует обновление при `sending`. Установка на устройстве и
  staging не проверялись.
- [x] Реализовать локальный прототип упаковки полного client/SW/Pages Worker из точного Git SHA,
  manifest SHA-256, проверки целостности и настоящий локальный HTTP/D1 smoke
  распакованного `.tar`. База `574de76`, кандидат `d3a9496`, 23 HTTP прошли;
  [контракт](docs/release-artifacts.md). Эти SHA различаются только документацией.
  Это исторический локальный результат, а не приёмка нового кандидата.
- [x] Перенести rollback pins на `98d4910`, собрать и проверить новый архив:
  82 файла, 28/28 fresh-install/rollback/forward на семи конфигурациях,
  workers=1/retries=0. Прежний архив `574de76` сохранён для диагностики.
- [x] Выполнить HTTP/D1-приёмку `bd763ec` → сохранённый архив `98d4910`:
  23 запроса на одном origin/D1 прошли. Server functions/migrations одинаковы.
- [ ] Завершить приёмку компонента отката: CI `5b90249` и сохранение архива
      подтверждены, flaky WebKit и staging остаются открытыми;
  затем проверить целевое окружение и принять отдельный staging gate.
- [x] Проверить old/new bundle smoke для настоящей pending legacy-записи на одном
  origin и в одном browser context: 7/7 Playwright-проектов, `workers=1/retries=0`.
  Остались полный lifecycle, staging и совместимый rollback artifact.

Клиент подключён; отказ старых menu/items writers, конфликт после reload
и локальная совместная работа настоящих v2/v3 bundles проверены. CI семейного
кода `405238b` и PWA `8d32f12` прошёл.
Локальный real-SW smoke добавлен; до закрытия нужны PWA на
устройствах/staging и совместимый откат. Явная семейная цель invite/member
и остальные callbacks также остаются открытыми.

Это не закрывает P0.4–P0.6 целиком. Прежние unscoped clients остаются совместимыми
и не защищены opt-in guard; отмена fetch не устанавливает порядок SQL-записей.

### P0.1 — восстановить CI: зависимости и проверка push

- [x] Подготовить исправление dependency audit для GitHub `main`, проверив
  совместимость обновлений. В [CI PR #91 на SHA 8b13b25](https://github.com/Michael-edel/FitFocus/actions/runs/37910803294)
  обнаружено 16 уязвимостей (1 low, 6 moderate, 9 high); последующие проверки
  пропущены. Документирующая ветка не меняла package.json/lockfile.
- [x] Убрать устаревшее требование наличия `signal: controller.signal`
  непосредственно в `push.ts` из `scripts/check-api-invariants.mjs`.
- [x] Проверять отмену зависшего запроса через реальный путь
  `sendPushNotification` → `fetchWithTimeout` → `fetch`.
- [x] Проверить успех, ошибку и timeout, отмену запроса и очистку таймера.
- [x] Получить зелёный CI исправления без отключения проверки:
  [4c16088 в PR #92](https://github.com/Michael-edel/FitFocus/actions/runs/37914508279).
- [ ] Интегрировать проверенное исправление в защищённую GitHub `main`.

Готово, когда audit проходит, тест падает при разрыве передачи сигнала в этом
пути, а существующие API-проверки, тесты и сборка проходят. Audit failure
наблюдался на базе GitHub main; устаревшая push-проверка относится к
интеграционной ревизии PR #90. Эти два состояния нельзя смешивать.

Реализация: [PR #92](https://github.com/Michael-edel/FitFocus/pull/92),
также перенесена в локальную интеграционную ветку. Проверены зависший
error body и фокус в forced-colors после обновления Tailwind.
Подробные результаты: [журнал стабилизации](docs/stabilization-progress.md).
P0.1 остаётся открытым до интеграции в GitHub main; CI ветки исправления прошёл.

### P0.2 — сохранить конфликт и ошибочную операцию

- [x] В sender шести ключей при 409 сохранить локальный payload, доступный
  серверный снимок и delete-intent; перевести в conflicted, не подтверждая отправку.
- [x] В этом sender неповторяемые 4xx хранить как failed, 408/429/5xx и сеть
  обрабатывать ограниченными повторами с backoff/Retry-After.
- [x] Подключить остальные управляемые state-ключи к этому sender;
  [граница 15 ключей](docs/owned-state-writers.md).
- [x] Перенести эти гарантии на редактор существующего profile и его sender:
  409 сохраняет локальную операцию и доступный проверенный снимок, без rebase.
- [x] Создавать профиль регистрации постоянной операцией с baseVersion=0;
  AI-update — причинный child, ошибки и конфликты не требуют raw profile PUT.
- [x] Пройти old/new migration smoke реального legacy intent; полный lifecycle
  остаётся отдельной открытой задачей P0.8.

Готово, когда update/delete-конфликты и failed-операции доступны после reload;
совпадение текущего локального значения с исходящей записью не скрывает конфликт.

### P0.3 — разделить локальную запись и паузу отправки

- [x] В новом sender после 401 сохранять новые операции, остановив отправку;
  после свежего подтверждения того же аккаунта возобновить его очередь.
- [x] В новом sender различать 403 `ACCESS_REQUIRED` и `FORBIDDEN_KEYSPACE`; повторный вход
  не считать универсальным исправлением 403.
- [x] Подключить операции редактора профиля к общей auth/access/protocol-паузе;
  отсутствие profile capability не удаляет локальные правки.
- [x] Сохранять регистрацию до сети/AI и восстанавливать own pending-профиль
  после reload без OAuth-маркера; bootstrap 401/403 не активирует локальный вход.
- [x] Проверять HTTP bootstrap/state-hydration и profile seed по proof сессии
  и атомарному auth-fence; подтверждённый отказ `/me` останавливает вход.
- [ ] Завершить auth-координацию legacy и остальных callbacks,
  затем приёмку выпуска. Серверные barriers обязательного proof добавлены для
  `/api/bootstrap`, `/api/state`, `/api/profile` и Support feedback; остаются
  остальные callbacks, старые bundles и staging.

Готово, когда изменения, сделанные во время auth-паузы, не теряются и
после входа отправляются только от подтверждённого владельца.

### P0.4 — защитить локальные изменения при загрузке облака

- [x] Для 15 managed-ключей и профиля перед cloud apply проверять pending/sending/conflicted
  операции и локальную ревизию для этого аккаунта и ключа.
- [x] Проверить `sessionHydration.ts`, profile refresh через stateSync и repository отдельно.
- [x] В этих путях не заменять локальный снимок и не менять baseVersion только потому,
  что пришла более новая облачная версия.
- [ ] Проверить остальные cloud callbacks и cache приложения по тем же гарантиям.
  Delayed durable family-menu state GET проверяет account switch без
  гидратации старых данных; задержка теперь управляется тем же mock API handler,
  без дополнительного route/fallback. Полный `family-menu-durable.spec.ts` после
  изменения прошёл 39/39 на трёх desktop engines. Точный CI `aa4073c` ожидается;
  `baba226` дополнительно изолирует локальный recipe-usage cache по accountId;
  unit suite 1295/1295 и целевые account-switch E2E 4 passed / 2 project skips.
  Коммит `64d14a4` скрывает состояние урока/викторины до гидратации ключа
  активного аккаунта; targeted unit — 3/3. Полный запуск выполнил 1297 тестов
  в 207 файлах; две suite столкнулись с Windows `EBUSY`, затем прошли отдельно
  последовательно (4/4 теста). Typecheck и production build прошли. Остальные
  cloud callbacks и cache остаются открытыми; P0.4 не закрыт. Follow-up
  [`32818d1`](https://github.com/Michael-edel/FitFocus/commit/32818d15e11e1b61cde267eff4050a9e9d4904d4)
  распространяет scope gate на черновик веса/PDF, поиск еды, выбранную дату,
  направление камеры и UI плана. `planScope` теперь также owner-bound. Старые
  setters отбрасываются после смены storage key. Полный unit: 1304/1304 в 210
  файлах; typecheck, production build и diff check прошли локально.
  Follow-up [`f814234`](https://github.com/Michael-edel/FitFocus/commit/f8142349291fd592c58a857ae88e0ee28c6b098e) применяет
  общий account/session render key к экрану прогресса: черновики замеров и импорта
  не переживают смену аккаунта или login-session; заполнение черновиков также
  отслеживает владельца и значение глюкозы. Unit 1305/1305, typecheck, build и
  diff check прошли локально. Account-switch UI E2E для этого экрана и остальные
  cloud callbacks/cache остаются открытыми; P0.4 не закрыт.
  [`cdc872b`](https://github.com/Michael-edel/FitFocus/commit/cdc872bae6cfef13642051d847b23cd03923a791)
  переносит тот же lifecycle key на остальные account-aware экраны: dashboard,
  plan, архив прогресса, питание, рецепты, семью, AI-совет и курс. Это сбрасывает
  несохранённый recipe editor и account UI cache при смене login scope. Unit
  1305/1305, typecheck и build прошли; recipe account-switch E2E — 3/3, семейное
  меню — 39/39 на desktop Chromium/Firefox/WebKit без retries. P0.4 остаётся
  открытым до завершения оставшихся browser acceptance и аудита callbacks/cache.
  Follow-up [`a67ed17`](https://github.com/Michael-edel/FitFocus/commit/a67ed177f7214bf41e02259f1602d2e72d8ddc9c)
  обнаружил и исправил production-сбой генерации ID черновика рецепта: вызов
  optional `crypto.randomUUID` превращался production-сборщиком в обращение к
  необъявленному `n`. Приёмка черновика перед сменой аккаунта теперь проходит
  3/3 на desktop Chromium/Firefox/WebKit; смена активной IndexedDB-сессии между
  вкладками обновляет render key через advisory BroadcastChannel с polling и
  visibility fallback. Общий P0.4 остаётся открытым: нужны проверки остальных
  переходов, cloud callbacks/cache и staging. Follow-up
  [`beedbee`](https://github.com/Michael-edel/FitFocus/commit/beedbeea594b8d501032ab10dfe80ad79f2f67fc)
  добавляет account-switch acceptance для черновика измерения прогресса:
  после активации account B во второй вкладке весовой черновик скрыт, профиль и
  outbox account A неизменны. Тест прошёл 3/3 на desktop Chromium/Firefox/WebKit
  без retries. Проверка выявила и предупреждения Recharts при первом измерении
  контейнера; графикам задан положительный initialDimension, повторный прогон
  чистый. Unit 1305/1305, три typecheck и production build прошли. Общий P0.4
  остаётся открытым до аудита остальных переходов, cloud callbacks/cache и staging.
  Follow-up `a8d20ee` добавляет account-scoped `nutrition.selected-day` в сброс UI;
  unit подтверждает, что очищается ключ только выбранного аккаунта, без удаления
  чужого ключа или профиля. Follow-up `02a12e2` не восстанавливает локальный
  черновик Settings в старой вкладке, пока IndexedDB активен другой аккаунт;
  черновик остаётся в account A cache и снова восстанавливается после обычного
  reload при активном account A. Follow-up `6c53b68` закрыл воспроизведённую
  утечку account-scoped UI cache в старой вкладке: restore и setters теперь
  разрешаются только после совпадения текущего профиля с активной IndexedDB
  session. Gate распространяется на dashboard weight/PDF, nutrition search и
  selected day, camera preference, plan controls и course UI; cache A остаётся
  нетронутым для возврата к A. Новый сценарий до исправления показывал черновик
  веса `98.765` после входа B в другой вкладке. После исправления draft matrix
  прошла 15/15 на desktop Chromium/Firefox/WebKit без retries, unit suite —
  1308/1308, три typecheck, production build и diff check прошли. P0.4 всё ещё
  открыт до остальных cloud callbacks/cache, staging и полного lifecycle.
  Follow-up [`2e2c1d1`](https://github.com/Michael-edel/FitFocus/commit/2e2c1d165e2d138d6d426052137b284e0500c381)
  распространяет тот же gate на экранные кэши графиков/разделов прогресса и
  fallback-отметки списка покупок. Расширенный progress account-switch E2E
  подтверждает, что выбранный account A показатель скрывается после входа B, а
  сохранённый A cache остаётся неизменным. Полная draft matrix повторно прошла
  15/15 на desktop Chromium/Firefox/WebKit без retries; unit 1308/1308, три
  typecheck, production build и diff check прошли. Остальные callbacks/cache,
  staging и полный P0.4 lifecycle остаются открытыми.
  Последующий локально проверенный follow-up привязывает root state
  множественного выбора блюд к `accountSessionRenderKey`: старые выбранные id
  скрываются, setters/bulk callbacks прежнего scope не меняют новый дневник.
  Пять новых unit-тестов; полный unit 1316/1316 в 212 файлах, три typecheck и
  production build прошли. Точный CI нового SHA ожидает push; общий аудит и
  приёмка P0.4 остаются открытыми.
  Последующий аудит `useCouncilChat` обнаружил, что временное состояние root
  сбрасывалось только по `userId`, поэтому повторный вход того же аккаунта с
  новым `sessionEpoch` мог сохранить старый черновик/этап/expanded state.
  Эти поля теперь изолированы `accountSessionRenderKey`, скрываются без
  подтверждённого UI cache и отклоняют setters прежнего scope; запросы также
  инвалидируются при смене session key. Полный unit 1318/1318, три typecheck,
  production build и существующий council late-response E2E 3/3 desktop прошли.
  Кодовый follow-up опубликован коммитом `2f6afdc`; PR-run #1397 для этого SHA
  pending без созданных jobs на момент проверки. Push-run #1396 отменён при
  замене дублирующим PR-событием по concurrency policy. Повторный-login E2E,
  остальные callbacks/cache и staging остаются открытыми; перед слиянием
  проверять CI для актуального exact HEAD.
  - [x] Защитить выбранный день личного недельного меню: restore, отображение,
    сохранение и setter теперь требуют разрешённого account cache и гидратации
    точного ключа аккаунта. Регрессия до исправления оставляла вторник A выбранным
    в старой вкладке после входа B; после исправления кэш A сохранён, но скрыт.
    [`c1f8180`](https://github.com/Michael-edel/FitFocus/commit/c1f818080c1554feaf36ce24f78b91145ea607ec): E2E 3/3 на desktop
    Chromium/Firefox/WebKit без retries, unit 1308/1308, typecheck, оба strict
    typecheck и production build прошли. Остальной аудит P0.4 не закрыт.
  - [x] Скрыть AI status badge и retry metadata до подтверждения активной
    IndexedDB-сессии. До исправления `AI: online` и `Retry: Coach` оставались
    видны в старой вкладке после входа B. [`ca49b0d`](https://github.com/Michael-edel/FitFocus/commit/ca49b0db8406a7ec124c05d90345402ba1a98d79): E2E 3/3 на desktop
    Chromium/Firefox/WebKit без retries, unit 1308/1308, typecheck, оба strict
    typecheck и production build прошли. P0.4 остаётся открытым для остальных
    callbacks и кэшей.
  - [x] Скрыть открытый разбор еды и редактор account A, если другая вкладка
    активировала B; также запретить открыть их из устаревшего экрана. До фикса
    модалки оставались видимыми после переключения. [`66a7362`](https://github.com/Michael-edel/FitFocus/commit/66a73623309d46d8ca5bcdc89a71068cf6004a9f): E2E 3/3 на desktop
    Chromium/Firefox/WebKit без retries, unit 1308/1308, typecheck, оба strict
    typecheck и production build прошли. Остальной P0.4 audit остаётся открытым.
  - [x] Скрывать account-зависимые экраны и root overlays/notice, пока
    IndexedDB-сессия не совпадает с аккаунтом UI; статические «Гид», «Политика»
    и «Обновления» остаются доступны. Регрессия воспроизводила одновременно
    приветствие профиля A и сохранённую историю AI-отчётов после входа B. После
    фикса account-данные и модальные поверхности старой вкладки скрыты, данные A
    сохраняются. Account-switch E2E — desktop Chromium/Firefox/WebKit без
    retries; typecheck и production build прошли. Остальной P0.4 audit остаётся
    открытым.
  - [x] Не восстанавливать настройки и другие root account-caches при
    несовпадении UI- и IndexedDB-аккаунта. До фикса старая вкладка сохраняла
    violet-тему A после входа B; теперь settings, plan marks, refeed/adaptation,
    favorites и invite code используют account scope только после проверки
    сессии. E2E с сохранённым отчётом и темой прошёл 3/3 desktop-браузера без
    retries; root, domain-strict и storage-strict typecheck и production build
    прошли. P0.4 остаётся открытым для остальных callbacks, кэшей и staging.
  - [x] Ограничить результат WIS-share исходной UI/session scope: notice hook
    теперь хранит поколение владельца; durable read guard проверяется перед
    внешней передачей PNG и снова после возврата системного share API, прежде
    чем обновлять уведомление, телеметрию или достижение. До
    фикса поздний callback после перехода A → B → A показывал успех старой
    операции в активном экране. Account-switch E2E прошёл 3/3 на desktop
    Chromium/Firefox/WebKit без retries; unit 1309/1309 в 210 файлах, общий и
    оба strict typecheck, production build и `git diff --check` прошли. CI нового
    SHA ожидает push. Остальной P0.4 audit, staging и полный lifecycle открыты.
  - [x] Проверить account-scoped кэш открытого урока и выбранного ответа
    викторины: после активации account B старая вкладка скрывает UI account A,
    исходный кэш A не меняется, а курс B не открывает чужой урок. Новый E2E
    прошёл 3/3 на desktop Chromium, Firefox и WebKit (`workers=1,retries=0`);
    typecheck и `git diff --check` прошли. Это приёмка одного cache-пути;
    остальной P0.4 audit и staging остаются открытыми.
  - [x] При повторном входе того же account сравнивать `authFence`, `accountId`,
    `serverSessionId` и `sessionEpoch`, а не только id аккаунта. До фикса старая
    вкладка сохраняла черновик AI Council и не показывала session notice;
    теперь несовпадающая сессия блокирует account UI, черновик скрыт, история
    не меняется. E2E прошёл 3/3 на desktop Chromium/Firefox/WebKit; 7 связанных
    account-switch сценариев прошли на Chromium. Unit 1318/1318, три typecheck,
    production build и `git diff --check` прошли. [`5042db8`](https://github.com/Michael-edel/FitFocus/commit/5042db8adca01a58bcaff9c044d516b3d15394fb).
  - [x] Проверить поздний GET семейного контекста при повторном входе того же
    account с новой server session: старая вкладка показывает session notice,
    удержанный ответ предыдущей сессии не возвращает старый экран семьи. Новый
    E2E прошёл 3/3 на desktop Chromium/Firefox/WebKit; четыре соседних callback
    сценария — 12/12 в тех же браузерах. Production-дефекта не выявлено; общий
    P0.4 audit, остальные callbacks/cache и staging остаются открытыми.
    [`88ca7e3`](https://github.com/Michael-edel/FitFocus/commit/88ca7e3d4e5c88383b1a9e88db2c2afca2f6964a).

Для шести ключей repository транзакционная managed hydration реализована
на `cfcc31b`; этап `31ec847` расширяет её до 15 ключей.
Для существующего profile guarded refresh и восстановление локального
снимка добавлены на `fc6bb82`; постоянная регистрация — на `2e41742`.
HTTP bootstrap/state-hydration и атомарный auth-fence добавлены на `dac2de2`;
[контракт и проверки](docs/bootstrap-hydration.md). Остальные callbacks открыты.
[Проверенная граница](docs/runtime-state.md).

Готово, когда повторный вход и восстановление сети сохраняют локальные
изменения; конфликтующие полные JSON-снимки не сливаются автоматически.

### P0.5 — защититься от запоздавших ответов

- [x] Для нового sender привязать ответ к opId, accountId, sessionEpoch,
  attemptId и ревизии; проверить scope/key/exists/protocol ответа.
- [x] Его принадлежность и операцию/версию проверять одной IDB-транзакцией.
- [x] Для bootstrap/state-чтения проверять HTTP scope и актуальный readGuard;
  hydrate/profile seed атомарно проверяют epoch и auth-fence (`dac2de2`).
- [x] В outbox передавать подтверждённую версию следующей операции только
  при доказанной причинной зависимости; независимую правку другой вкладки
  автоматически не перебазировать.
- [ ] Перевести и проверить оставшиеся сетевые writers и callbacks приложения.
  `3abb374` вводит обязательный серверный proof для всех `/api/state` и
  `/api/profile` handlers; `4edeb0a` закрыл такой же legacy-путь в
  `GET /api/export`, а `a396a30` добавил proof для чтения вложений поддержки.
  `d2cbb25` добавляет account-switch acceptance для недельного AI-отчёта:
  удержанный ответ A после входа B не меняет report value/outbox ни A, ни B;
  сценарий прошёл 3/3 на desktop Chromium/Firefox/WebKit, без retries.
  Компонент [`18af4ee`](https://github.com/Michael-edel/FitFocus/commit/18af4ee48cf1cde471dd85cea892715a04691d2d)
  привязывает retry metadata к `userId`: регистрация пишет действие в ключ
  нового аккаунта до смены ambient scope, а unscoped legacy action принимается
  только при совпадении владельца. AI activity hook читает явную область аккаунта
  и скрывает прежний снимок сразу при смене профиля. Unit suite прошёл
  1300/1300 в 209 файлах; root/domain/storage typecheck и production build
  прошли; Coach retry account-switch E2E — 3/3 на desktop Chromium/Firefox/WebKit,
  workers=1/retries=0. Точный CI этого коммита ожидает push.
  Follow-up [`0646e3d`](https://github.com/Michael-edel/FitFocus/commit/0646e3ddc699692d2f05e1bbe1b130e01b8cd8c0)
  передаёт accountId во все проверки последнего действия в Coach, Plateau и
  retry; 20 профильных unit, typecheck, production build и E2E 3/3 прошли
  локально. Полный CI точного HEAD запускается после push.
  Follow-up [`e7d5a5c`](https://github.com/Michael-edel/FitFocus/commit/e7d5a5c)
  привязывает все пять PDF download sites к действующей account/session и
  повторно проверяет session непосредственно перед `doc.save()`. Новый тест
  задерживает загрузку шрифта, меняет session и подтверждает отсутствие файла;
  также проверяется успешный экспорт при неизменной session. Полный unit suite
  прошёл 1311/1311 в 211 файлах, три typecheck и production build прошли.
  Точный CI ожидается; остальные callback-контракты, staging и lifecycle
  остаются открытыми.
  Остальные callback-контракты, точный CI, проверка внешних потребителей и
  staging остаются открытыми.
- [x] Привязать обычный logout к актуальному IDB guard; account delete требует
  обязательный парный scope на сервере и проверяет ответ перед очисткой. Чужой
  proof отклоняется до удаления, scoped logout не отзывает другую сессию и не
  очищает cookie поздним ответом. Проверки 1215 unit, три typecheck, build,
  auth/API/admin/privacy guards прошли локально на `956cf96`; точный CI после
  push ещё не подтверждён. Follow-up [`b2f6938`](https://github.com/Michael-edel/FitFocus/commit/b2f6938136c6ad6a82624b295c6eb7e2fdaf5ee6)
  требует полный proof для `/api/logout`; отсутствие или неполная пара дают 401
  до cookie lookup/revocation, а все ответы не меняют cookie. API/auth/admin
  guards и три typecheck прошли в изолированном контейнере; точный CI запускается
  после push. Старые bundles, device/staging и полный lifecycle остаются открытыми.
  [Контракт](docs/account-lifecycle-session.md).
- [x] Требовать парный account/session proof для расходования invite при
  регистрации; отсутствие и устаревший proof отклоняются до body/consume. Проверки
  invite guard и oversized body проходят. На `55bc09e`: полный unit suite
  1216/1216 в 208 файлах, typecheck, API invariants, production build и
  `git diff --check` прошли; точный CI ожидает push. Старые клиенты без proof
  получают 401. Общая приёмка registration и staging остаются открытыми.
- [x] Обязать парный scope для всех family/shopping HTTP endpoints, включая
  чтения, `family/menu/state`, корзину, CSV и старый bulk route. Отсутствующий
  или устаревший proof отклоняется до body/D1 side effects; transport нового
  клиента передаёт proof. Профильный suite прошёл 85/85. Старые сборки без proof
  получают 401; staging и общий family lifecycle остаются открытыми.
- [x] Привязать административную панель, CSV-аудит, admin support и `logout_all`
  к исходному account/session proof; сервер проверяет его до D1 role lookup и
  admin-session side effects. Локальные transport/server regression tests,
  общий unit suite, typechecks и build прошли; точный CI нового HEAD ожидает push.
  Follow-up [`c778515`](https://github.com/Michael-edel/FitFocus/commit/c778515db0fe8481d8fa1a767493a000334cb1f6)
  требует полный proof для destructive `/api/logout_all`; legacy no-scope и
  account-only запросы получают 401 до auth lookup, revocation и cookie clearing.
  API/auth/admin guards и три typecheck прошли в изолированном контейнере;
  follow-up [`90bd734`](https://github.com/Michael-edel/FitFocus/commit/90bd7347a1bbdea51f27737f530a5f4a8c562c46)
  требует proof для всех `/api/admin/*`; тесты покрывают оба guard overload,
  отсутствие/частичную пару до D1 lookup и guarded 401 middleware. API/auth/admin
  guards и три typecheck прошли в изолированном контейнере; точный CI после push.
  `f949842` добавляет scoped fetch и response markers для admin-вложений поддержки,
  которые браузерные media tags не могли загрузить с proof header. Follow-up
  `a396a30` требует proof и для всех attachment reads; SupportScreen и AdminScreen
  теперь получают media через scoped fetch и проверяют markers. [Контракт](docs/support-session.md).
  Browser E2E дополнительно проверяет ticket- и reply-вложения через paired proof
  и фактическое отображение Blob; точный CI нового HEAD ещё ожидается.
  Старые bundles требуют обновления.
  Предыдущий PR CI [`38706186324`](https://github.com/Michael-edel/FitFocus/actions/runs/38706186324)
  на `01bfa05` остановился на unit: 1263/1264 теста прошли, а единственная
  ошибка была в legacy fixture, который общий helper уже делал scoped. Follow-up
  [`478fc58`](https://github.com/Michael-edel/FitFocus/commit/478fc58) отключает
  scope именно в этом тесте; полный CI нового HEAD ожидает push.
  Остальные callbacks и общий lifecycle остаются открытыми.
- [x] Проверить выдачу мобильного bearer-токена из Settings: fresh
  account/session proof, server scope до mint, guarded no-store response,
  очистка токена/setup link при смене логина и delayed account-switch E2E.
  Все проверки включены в точный PR CI HEAD `08618e3`, run
  [38628487894](https://github.com/Michael-edel/FitFocus/actions/runs/38628487894),
  завершившийся success. Follow-up переводит выдачу токена на обязательный proof;
  legacy unscoped POST получает 401 до mint. На точном локальном SHA
  [`a1e79ac`](https://github.com/Michael-edel/FitFocus/commit/a1e79ac85d1f77c2112d121fd21deb3da03a5fdc)
  прошли 1244 unit / 208 файлов, 9 mobile/beta тестов, три typecheck,
  API/auth/admin/schema/privacy guards и build. CI, staging и устройство остаются
  открытыми.
  [Контракт](docs/wearable-sync.md).
- [x] Связать Huawei Health status, OAuth start/callback, sync и disconnect
  с исходными account/session proof; профиль фиксировать только через guarded
  outbox commit. `455cb01`: 26 профильных unit/API-тестов и 15/15 выбранных
  account-switch E2E на desktop Chromium/Firefox/WebKit без retries. Follow-up
  [`a127bf5`](https://github.com/Michael-edel/FitFocus/commit/a127bf5e6bb2f77fb83051d66b782bbc8baf8d6f)
  требует proof на status/start/sync/disconnect; запросы без полного scope
  получают 401 до body и route-specific D1/provider действий. Локальные API
  invariants, admin guard и три typecheck прошли в изолированном контейнере.
  Локальный Vitest не стартовал из-за Windows `node_modules` в Linux sandbox.
  `9782ef0` добавляет проверку частичной account-only пары.
  Точный PR CI [38703208009](https://github.com/Michael-edel/FitFocus/actions/runs/38703208009)
  на `a127bf5` подтвердил dependency/schema/privacy/auth/API checks, unit, три
  typecheck и build; E2E выполнялся на момент follow-up. Для `9782ef0` и
  документов точный CI запускается после push. Старые bundles нужно обновить.
  [Контракт](docs/huawei-health-session.md).
- [x] Подтвердить полный PR CI на точном SHA `455cb01`: run
  [38656586334](https://github.com/Michael-edel/FitFocus/actions/runs/38656586334)
  завершился success; E2E, unit, guards, typecheck, build и rollback/CAS прошли.
- [ ] Привязать операции Push в Settings и Service Worker к свежему `/api/me`
  proof, активной IDB-сессии и проверяемым server response markers. Проверить
  поздний status-ответ аккаунта A после входа B и восстановление подписки при
  смене сессии; сервер требует парный scope на status/subscribe/unsubscribe/test
  до body и прикладных эффектов; критерии — в [контракте](docs/push-session.md).
  Запросы старых открытых сборок без proof получают 401. Код реализован
  и закоммичен в `daec94d`: 1180 unit-тестов / 202 файла, общий и строгие
  typecheck, build/guards и весь account-switch spec (42/42 на трёх desktop
  engines, без retries) прошли.
  На рабочем дереве добавлен native HTTP E2E для настоящего собранного SW:
  `pushsubscriptionchange` отправил подписку со scope текущего аккаунта/сессии;
  после logout повторное событие не запросило `/api/me` и не отправило подписку.
  Сценарий прошёл 1/1 в Chromium; связанная PWA-регрессия — 6/6, typecheck прошёл.
  CI run `38679312640` для опубликованного SHA `45575d2` завершился с двумя
  flaky E2E после retry; локальный push test и assertion follow-up в commits
  `ba973c1`/`636d2c7` ожидают точного CI. На следующем follow-up обязательная
  серверная привязка для Push проверяется профильными API-тестами и полным CI
  точного SHA; staging, реальный provider и устройство остаются открытыми.
  В follow-up `04b61dd` добавлена native-SW проверка повторного входа с новым
  session id и unit-проверка свежего proof. Полный unit suite прошёл 1277/1277;
  delayed-status E2E прошёл 3/3 desktop-браузера, native SW — 1/1 Chromium,
  typecheck прошёл. Это синтетическая локальная сессия; staging, provider и
  устройство остаются обязательными. CI `04b61dd` ожидает push. На HEAD
  `404b3da` delayed-status account switch и native-SW recovery прошли 2/2 без
  retries на Chromium; полный CI этого HEAD ещё выполняет E2E.
  - [x] Удержать `/api/push/status` старой server session, повторно войти в тот
    же account с новым `serverSessionId` и проверить ответ новой сессии до и после
    освобождения старого. В Settings остаётся только новый delivery-status marker;
    проверены исходные account/session заголовки. Same-account и A → B сценарии
    прошли 6/6 на desktop Chromium/Firefox/WebKit без retries; typecheck и diff
    check прошли. Реальные provider/device/staging и точный CI остаются открытыми.
- [x] Привязать Stripe Checkout и административную смену тарифа к исходному
  account/session proof, серверному guard, response markers и
  no-store; не открывать поздний Checkout URL после смены аккаунта. Локально:
  18 профильных unit в трёх файлах, typecheck и API/auth/admin guards прошли;
  account-switch E2E — 3/3 на desktop Chromium, Firefox и WebKit без retries,
  4 не-desktop проекта штатно пропущены. Код закоммичен в `1b80734`; точный
  последующий HEAD `45575d2`, содержащий этот guard, прошёл CI с двумя flaky
  E2E после retry в
  [run 38679312640](https://github.com/Michael-edel/FitFocus/actions/runs/38679312640).
  Follow-up переводит оба route на обязательный proof; unscoped checkout и
  admin subscription получают 401 до body/прикладных эффектов. На точном
  локальном SHA [`28341ed`](https://github.com/Michael-edel/FitFocus/commit/28341ed27d399dbed61e3bf51b6d79ff61f8c590)
  прошли 1244 unit / 208 файлов, 16 billing/admin тестов, три typecheck,
  API/auth/admin/schema/privacy guards и build. Старые bundles нужно обновить;
  точный CI, staging и Stripe остаются открытыми.
  [Контракт](docs/billing-session.md).
- [ ] Проверить настоящий Huawei OAuth, BFCache/устройство и staging. Этот
  компонент не закрывает остальные writers и общий lifecycle P0.5. Дополнение
  [`6fd0bb0`](https://github.com/Michael-edel/FitFocus/commit/6fd0bb0459f989f7c04de087d83d49ff6b7739e7) закрывает локальную mock-проверку запоздавшего sync после повторного
  входа в тот же аккаунт с новым server session id: 3/3 desktop Chromium,
  Firefox и WebKit без retries; точный CI и реальные OAuth/BFCache/staging всё
  ещё открыты.
- [x] Перевести AI Совет на общий AiSession: все 14 запросов используют один
  account/session proof; поздний ответ после входа другого аккаунта проверяется
  browser acceptance.
- [x] Удержать ответ AI Совета при повторном входе того же account с новым
  `serverSessionId`: старый ответ не добавляется в историю и не создаёт durable
  write в новой сессии. Вместе с A → B delayed-answer acceptance прошёл 6/6 на
  desktop Chromium/Firefox/WebKit без retries. Production-код не менялся;
  точный CI follow-up ожидает push.
- [x] Подтвердить точным CI сохранение вопроса и очистки истории во время sender
  pause через session-bound local commit guard; ответы AI остаются под строгим
  read guard. 38619175535 выявил время фикстуры, исправлено в 0abb185; 38620253135
  прошёл unit и нашёл типизацию repository API, исправлено в 92ecaa3; 38621324053
  прошёл unit и нашёл отсутствующие imports, исправлено в ce7b60d. Точный PR CI
  прошёл на merge-ref `d805b1f` с исходным SHA `7458ea0`: 1153 unit / 199 файлов,
  576 browser passed / 95 skipped, один flaky migration test прошёл после retry,
  audit, guards, три typecheck, build и 23 rollback/CAS-запроса прошли
  ([run 38621962929](https://github.com/Michael-edel/FitFocus/actions/runs/38621962929)).
  [Контракт](docs/ai-council-session.md); общий P0.5 остаётся открытым.
- [x] Добавить серверную проверку account/session в AI и weekly-menu items
  до прикладных эффектов (`16d3c34`); capabilities и HTTP-регрессии проверены.
  Follow-up [`7240fec`](https://github.com/Michael-edel/FitFocus/commit/7240fece7d9d66020599c96c6aa15f9b548c81e4)
  запрещает также legacy-запросы без scope; тест проверяет 401 до разбора
  некорректного body. Полный unit suite 1240/1240, общий и два strict typecheck,
  API/auth/schema/privacy guards, build и diff check прошли локально. Старые
  bundles нужно обновить до rollout; точный CI и staging остаются открытыми.
  [Контракт](docs/ai-session-guard.md).
- [x] Защитить недельный AI-отчёт и его retry свежим session proof, lifecycle
  guard и durable commit; локальные профильные проверки описаны в
  [контракте](docs/weekly-ai-report-session.md). GitHub CI коммита `0b7062d`
  упал на E2E (343 failed из 476) в [run 38357547143](https://github.com/Michael-edel/FitFocus/actions/runs/38357547143);
  локальный follow-up прошёл 49/49 связанных тестов Chromium; последующий полный
  CI HEAD `9bdeb47` завершился success ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)).
- [x] Локально перевести coach, личный план и объяснение плато с повторами на
  общий `AiSession`/lifecycle guard; профиль и usage сохранять только через
  guarded commit. Unit-suite: 1115 passed / 198 файлов, typecheck и два strict
  typecheck прошли. Browser-приёмка регистрации, onboarding и weekly report
  прошла: 32 passed / 3 skipped на 7 browser/PWA-профилях. CI исходного SHA
  `75e4d35` завершился ошибкой weekly-menu Firefox E2E в [run 38379449644](https://github.com/Michael-edel/FitFocus/actions/runs/38379449644):
  mock не отвечал на фоновый `wis_text`; 463 E2E прошли, 9 пропущены, три flaky.
  После добавления fixture локально прошли весь weekly-menu spec Firefox 8/8
  и пять повторов падавшего сценария. Фикс закоммичен в `ec29f41`; точный [PR CI](https://github.com/Michael-edel/FitFocus/actions/runs/38385161995)
  завершился success: 466 browser passed / 9 skipped и один flaky в iPhone PWA
  preview-origin (`route.fetch: socket hang up`, retry прошёл; причина неизвестна).
- [x] Добавить browser acceptance позднего ответа coach/plateau и смены аккаунта:
  локально 6/6 в desktop Chromium, Firefox и WebKit на `9bc98ee`.
- [x] Подтвердить CI для точного SHA `9bc98ee`: [run 38410002498](https://github.com/Michael-edel/FitFocus/actions/runs/38410002498) завершился success.
- [x] Добавить browser acceptance задержанных family callbacks после входа B в
  соседней вкладке: приглашение не попадает в старую UI, AI-ответ не создаёт
  `familyMenu`-операцию. `f9c8425` и `bca2eda` прошли по 3/3 на desktop
  Chromium, Firefox и WebKit без retries.
- [x] Проверить задержанный повтор личного плана A после входа B в соседней
  вкладке: поздний ответ не меняет профиль, значения, outbox или success-effects
  обоих аккаунтов. Локально прошло 3/3 на desktop Chromium, Firefox и WebKit;
  `npm run typecheck` и точный CI прошли: сначала `c48ce1b` в [run 38429247879](https://github.com/Michael-edel/FitFocus/actions/runs/38429247879), затем полный HEAD `7c50f08` в [run 38435173387](https://github.com/Michael-edel/FitFocus/actions/runs/38435173387). В последнем run три других E2E были flaky и прошли retry.
- [x] Проверить поздний achievement unlock из аккаунта A после входа B в
  соседней вкладке: ответ A со старым scope не показывает toast ни старой, ни
  новой сессии; active session остаётся B. Commit `b44d46e`; 7/7 browser/PWA-профилей,
  `workers=3`, `retries=0`; `npm run typecheck` прошёл. Последующий полный CI
  `9bdeb47` завершился success ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)).
- [x] Закрепить invite и member mutations за явным `familyId`: `/api/me`
  объявляет `familySync.target`; старый сервер без capability блокируется до
  запроса. Сервер проверяет точное членство/владельца, UI отбрасывает поздний
  invite после смены семьи при том же login. `2bbec11`: 1128 unit / 198 файлов,
  27 family E2E на трёх desktop-браузерах, target-capability 7/7 проектов,
  typecheck/guards/schema/privacy/audit/build и 23 rollback/CAS HTTP прошли.
  Полный CI `9bdeb47` завершился success ([run 38459458051](https://github.com/Michael-edel/FitFocus/actions/runs/38459458051)); два unrelated E2E были flaky и прошли retry.
  Staging и реальные old/new bundle для этого изменения остаются открытыми.
- [x] Добавить late-response acceptance для family shopping check и member-goal
  mutation: после входа аккаунта B ответ shopping action из A не запускает
  `shopping_item_checked`, а ответ цели семьи A не применяется после загрузки
  другой семьи тем же login. Затем личная `ShoppingListCard` подключена к
  исходному login guard: GET/PATCH требуют свежий account/session proof,
  поздние ответы не меняют данные аккаунта B, а server/local React state
  ограничены аккаунтом и неделей. CSV теперь собирается из этого scoped snapshot
  и повторно проверяет guard перед скачиванием; серверный export endpoint также
  проверяет переданный proof. E2E при входе B запретил экспорт старого A и
  подтвердил CSV только со списком B (3/3 desktop engines). Затем проверены
  отложенные family join/create
  family-context GET и family-shopping GET: после входа B ответы A не очищают
  ввод, не появляются в UI B, не запускают повторную загрузку семьи и не
  вызывают `family_join_or_create`. Тестовые commits `69c739a`, `1b6444a`,
  `bb1866c` и `8f012e4`; полный callback spec прошёл 30/30, шесть новых
  acceptance-проверок — 18/18 на desktop Chromium/Firefox/WebKit,
  `workers=1/retries=0`. Также прошли 25 API unit-тестов и `npm run typecheck`.
  Это локальная приёмка; полный CI, другие callbacks и lifecycle остаются открыты.
- [x] Проверить поздний ответ личной генерации недельного меню A после входа B:
  профиль, outbox и success-effects обоих аккаунтов остаются без изменений.
  `562e20d`: новый сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit;
  полный `ai-callback-account-switch.spec.ts` — 15/15 без retries, typecheck
  прошёл. Полный CI для этого SHA прошёл: [run 38531646756](https://github.com/Michael-edel/FitFocus/actions/runs/38531646756).
  Другие AI/family callbacks и общий lifecycle остаются открыты.
- [x] Удержать ответ `weekly_menu`, повторно войти в тот же account с новым
  `serverSessionId` и отпустить ответ старой сессии: profile, durable outbox и
  achievement state новой сессии не меняются. Вместе с A → B acceptance проверка
  прошла 6/6 на desktop Chromium/Firefox/WebKit без retries; общий typecheck и
  `git diff --check` прошли. Production-код не менялся; точный CI follow-up
  ожидает push.
- [x] Проверить поздний ответ retry объяснения плато A после входа B во
  второй вкладке: профиль, values, outbox, active session и success-effects
  обоих аккаунтов не меняются. Целевой тест прошёл на Chromium, Firefox и
  WebKit; полный callback spec после поправки синхронизации прошёл 25/25
  выполненных проверок (2 штатных skip), `workers=1,retries=0`. Один Coach
  Firefox timeout в первом полном запуске не повторился: этот сценарий прошёл
  5/5, затем полный spec — 25 passed / 2 skipped. Связанные unit — 11/11,
  typecheck прошёл. Тест входит в полный CI `455cb01`, завершившийся success.
- [x] Привязать список, детали, создание тикета и ответ пользователя к исходной
  login-сессии. Все пользовательские и admin handlers требуют совпадающие
  account/session до разбора тела, проверки admin-роли и прикладных
  чтений/записей тикетов;
  клиент проверяет response markers, IDB auth-fence и не применяет поздний
  результат в другой сессии. `bc3e7c2`: профильные тесты 34/34, полный unit
  1249/1249, typechecks, guards и build прошли; старые bundles и staging остаются
  открытыми. [Контракт](docs/support-session.md).
- [x] Привязать фотоанализ дневника и рецепта к исходной AI-сессии и lifecycle;
  guarded diary/history commit, profile usage и успешный UI только для текущей
  попытки. `d93ff53`: unit 11/11, typecheck прошёл; delayed-response тесты прошли
  на Chromium/Firefox/WebKit, а success-path дневника/истории/usage — на Chromium.
  Полный account-switch spec прошёл 22 сценария / 2 project skips без retries;
  полный CI HEAD `a9e3096` завершился success в [run 38540109329](https://github.com/Michael-edel/FitFocus/actions/runs/38540109329)
  (1132 unit, 535 E2E passed / 79 skipped, два Firefox flaky прошли retry).
- [x] Разобрать и исправить Firefox-flaky в двух сценариях weekly-menu durability.
  Трассировка установила TransactionInactiveError в DurableOutbox.finish: запись
  выполнялась после async-продолжения, когда IndexedDB-транзакция уже была
  неактивна. Код исправлен в [cae28bd](https://github.com/Michael-edel/FitFocus/commit/cae28bd);
  unit 1132/1132, storage 37/37, два сценария повторены 20/20, полный
  weekly-menu spec прошёл 24/24 на Chromium, Firefox и WebKit. Typecheck и
  storage-strict typecheck прошли. Полный PR CI опубликованного HEAD `6c6feca`
  завершился success в [run 38550243769](https://github.com/Michael-edel/FitFocus/actions/runs/38550243769);
  новый plateau-retry сценарий добавлен после этого SHA и ожидает точного CI.
  Подробности: [журнал](docs/stabilization-progress.md).
- [ ] Завершить family callbacks и другие AI/state writers; для всего приложения
  серверный guard сам по себе недостаточен.
  - [x] Запретить незащищённый `/api/ai` из `callAiProxy`: помощник требует
    `AiSession`, а отсутствующий proof отклоняется до сети. Проверены 24 теста
    AI transport, полный unit suite (1188), typecheck, auth-scope и production
    build на follow-up поверх `1b80734`; точный CI этого follow-up ожидает push.
  Отдельно добавлена account-switch проверка позднего ответа
  `/api/family/menu/generate`: после входа другого аккаунта preview не создаёт
  menu outbox operation; delayed `/api/family/menu/state` GET также не гидратирует
  старое меню после смены аккаунта. Оба сценария прошли на трёх desktop engines;
  последующий `5d3e4d6` добавил поздний `PATCH /api/family/member` после входа B:
  Chromium, Firefox и WebKit прошли 3/3 без retries, callback не запускает новую
  загрузку семьи аккаунта A после ответа. Trace первого полного прогона показал,
  что более ранний baseline включал незавершённую стартовую загрузку A; после
  переноса baseline за вход B сценарий прошёл. Точный CI follow-up ещё ожидается;
  остальные callbacks и staging остаются открытыми.
  - [x] Удержать создание family invite от прежней server session и повторно
    войти в тот же account с новым `serverSessionId`: после освобождения ответа
    старый invite-код не появляется, старая вкладка остаётся под session notice
    и не запускает повторную загрузку семьи. E2E прошёл 3/3 на desktop
    Chromium/Firefox/WebKit; typecheck и diff check прошли. Точный CI предыдущего
    SHA нашёл пропущенный `releasedMembers` в fixture; исправление включено в
    [`b1c01ae`](https://github.com/Michael-edel/FitFocus/commit/b1c01ae2338265b0aa925f269dc61140af3791dd), точный CI запускается после push.
  - [x] Удержать создание семьи со старой server session, повторно войти в тот
    же account и отпустить ответ. Новая сессия остаётся на своей семье; старая
    вкладка не запускает повторный family GET или achievement. Сценарий и два
    ранее добавленных same-account read/invite прошли 9/9 на desktop
    Chromium/Firefox/WebKit; общий typecheck и diff check прошли. Кодовый commit
    [`3c49439`](https://github.com/Michael-edel/FitFocus/commit/3c49439a6469e000591343538e2c212d52b16e3d); точный CI ожидает push.
  - [x] Удержать `/api/family/join` старой server session, повторно войти в тот
    же account и отпустить поздний ответ: старая вкладка остаётся под session
    notice, форма старой сессии скрыта, повторного family GET и achievement нет.
    Вместе с A → B join и тремя same-account проверками context/invite/create
    выборка прошла 15/15 на desktop Chromium/Firefox/WebKit без retries.
    Точный CI этого follow-up ожидает push; общий P0.5 остаётся открытым.
  - [x] Удержать PATCH цели участника, повторно войти в тот же account с новой
    server session и отпустить старый ответ: старая вкладка остаётся под session
    notice, не перечитывает семью и не изменяет новый семейный экран. Проверены
    исходные familyId и session id; три member-update acceptance прошли 9/9 на
    desktop Chromium/Firefox/WebKit без retries. Typecheck и diff check прошли;
    точный CI follow-up ожидает push. Остальные callbacks/staging открыты.
  - [x] Удержать семейный `PATCH /api/shopping/check`, повторно войти в тот же
    account с новой server session и отпустить прежний ответ. Старая отметка не
    переносится в новую семью и не запускает achievement; проверены исходные
    `familyId`/session и отсутствие повторного GET старой сессии. Новый сценарий
    вместе с тремя соседними family-shopping проверками прошёл 12/12 на desktop
    Chromium/Firefox/WebKit без retries; typecheck и diff check прошли.
    Остальные callbacks, точный CI и staging открыты.
  - [x] Удержать GET `/api/shopping/list` семейной корзины, повторно войти в тот
    же account с новой server session и отпустить ответ старой сессии. Новая
    вкладка показывает только свой маркер списка; маркер старого ответа не
    появляется после его освобождения. Новый сценарий прошёл 3/3, а вся выборка
    same-account family callback acceptance — 21/21 на desktop Chromium,
    Firefox и WebKit (`workers=1,retries=0`). Runtime-код не менялся; точный CI
    нового теста и staging остаются открытыми.
  - [x] Удержать GET `/api/family/menu` от прежней server session, повторно войти
    в ту же учётную запись с новой сессией и освободить старый ответ после того,
    как новое меню отображено. Маркер новой сессии остаётся виден, маркер старого
    ответа не появляется. Сценарий прошёл 3/3 на desktop Chromium/Firefox/WebKit;
    подтверждённого runtime-дефекта не обнаружено, exact CI follow-up ожидает push.
  - [x] Удержать preview `POST /api/family/menu/generate`, повторно войти в тот же
    аккаунт с новой server session и освободить старый ответ. Outbox, семейное меню
    и число отправленных операций остаются без изменений; epoch новой сессии
    отличается. E2E прошёл 3/3 на desktop Chromium/Firefox/WebKit; typecheck прошёл.
  - [x] Удержать AI-ответ семейной генерации, повторно войти в тот же аккаунт с
    новой server session и освободить ответ. Снимок меню и outbox не меняются;
    старый ответ не запускает запись или achievement. E2E прошёл 3/3 на desktop
    Chromium/Firefox/WebKit; typecheck прошёл.
  - [x] Исправить пустой экран после logout: `useCouncilChat` создавал render key
    при `currentUser=null` и `loginGuard=null`, затем читал `currentUser.id`.
    Теперь временный state key создаётся только при подтверждённом непустом
    accountId. Regression удерживает family AI-ответ, выполняет logout, затем
    освобождает ответ и проверяет auth screen, отсутствие pageerror, outbox
    mutation и achievement; прошла 3/3 на desktop Chromium/Firefox/WebKit.
    Точный CI изменённого SHA, общая матрица и staging остаются открытыми.
  Follow-up [`9e7f67d`](https://github.com/Michael-edel/FitFocus/commit/9e7f67d8da22de48bb0f0c49e257bd35fdb6de79)
  закрывает retry-гонку списка покупок: после отказа toggle клиент перечитывает
  подтверждённый серверный список с теми же account/session, family и week;
  устаревшая попытка не меняет UI. Новый тест до исправления оставлял checkbox
  в неподтверждённом состоянии, после исправления прошёл 3/3 на desktop
  Chromium/Firefox/WebKit. Полный unit suite 1318/1318, три typecheck и build
  прошли локально. Точный CI опубликованного HEAD ещё нужно проверить; общий
  P0.5 и остальные callbacks остаются открытыми.
- [x] Защитить пошаговую генерацию рецепта из дневникового фото: `AiSession`,
  lifecycle/source scope, guarded durable update дневника и usage только после
  успешного commit. Код `71d2ca4`; полный локальный account-switch spec —
  44 passed / 4 skipped без retries, success path — Chromium; точный CI после
  push нужно подтвердить. [Контракт](docs/ai-callback-sessions.md).

Критерии для coach/plan/plateau callbacks и повторов приведены в
[контракте](docs/ai-callback-sessions.md).
Готово, когда ответ старого запроса не удаляет новую операцию, не применяет
старый payload и не продвигает версию независимо изменённого снимка.

### P0.6 — аккаунты и несколько вкладок

- [x] В durable-outbox хранить постоянного владельца операции и изолировать
  чтение/отправку; sender шести ключей использует проверенную серверную сессию.
- [x] В новом sender возобновлять очередь того же аккаунта со свежей сессией;
  sessionEpoch относится к попытке, а не навсегда запрещает такую операцию.
- [x] Останавливать sender на pagehide; BFCache-возврат запускает новую
  проверку сессии, cleanup удаляет обработчики прежнего аккаунта.
- [x] Запретить угадывание владельца и перенос id/prefix при входе; читать
  профиль только с own IDB accountId/owner-meta. Invite redeem проверяет
  свежую session-привязку до расходования кода.
- [ ] Завершить lifecycle-гарантии для profile и остальных API callbacks;
  `3abb374` закрыл unscoped серверный доступ к state/profile, но нужны проверки
  client lifecycle, старых writers и staging. Runtime legacy уже использует
  auth-derived owner и all-client Service Worker fence.
  - [x] Удержать GET `/api/profile` аккаунта A, активировать B в соседней вкладке
    и отпустить ответ A после переключения. Старый экран закрыт session notice;
    профиль B и обе durable-записи не изменились, новых B-операций нет. E2E
    [`e5a22df`](https://github.com/Michael-edel/FitFocus/commit/e5a22df) прошёл
    3/3 на desktop Chromium, Firefox и WebKit без retries; typecheck прошёл.
  - [x] Удержать PUT `/api/profile` с durable Save аккаунта A, активировать B,
    затем отпустить ответ 200 со scope A. Старый opId и локальный payload A
    остаются в `sending`, не подтверждаются в активной сессии B; профиль B и его
    очередь не меняются. E2E прошёл 3/3 на desktop Chromium/Firefox/WebKit без
    retries; typecheck и `git diff --check` прошли. Это не заменяет приёмку
    повторного входа A и остальных writers/staging.
    - [x] После позднего ответа войти в A с новой server session: тот же opId
      получает новый attempt/sessionEpoch и отправляется только с новым proof;
      запись удаляется после проверенного 200. Проверка прошла 3/3 без retries.
  - [x] При возврате из BFCache заново загружать уже использованные семейный
    контекст и список покупок; старые ответы остаются недействительны.
    Регрессия прошла 24/24 на трёх desktop engines без retries (`29b1e3a`);
    полный lifecycle и реальный BFCache на устройстве остаются открытыми.
  - [x] Для profile sender проверить `pagehide` → BFCache return с новой
    проверенной сессией: та же durable-операция получает новый attempt и
    завершается только после нового scoped PUT. E2E — 3/3 desktop engines,
    `workers=1,retries=0`; synthetic lifecycle не заменяет реальный BFCache.
- [x] Проверить old/new migration с двумя вкладками на одном origin без Web Locks;
  [smoke](e2e/legacy-outbox-migration.spec.ts) прошёл 7/7 проектов.
- [x] Проверить конкурентные записи одного ключа из двух вкладок без Web Locks:
  пока первая запись отправляется, независимая правка сохраняется конфликтом;
  [E2E](e2e/storage-durability.spec.ts) прошёл 3/3 desktop-браузера.
- [ ] Проверить границу old/new writers; завершить гарантии для profile и
  остальных API callbacks.
  Добавлен браузерный сценарий двух вкладок без Web Locks: параллельно
  сохраняются отметка плана и настройки в разные ключи. Проверка прошла в CI
  HEAD `a8f3219` (run 38634080772); остальные критерии P0.6 и writers остаются открытыми.
  Дополнительно добавлен сценарий 503 → вход B → возврат A с новой server
  session: pending операция сохраняет account A и тот же opId, не отправляется
  при активном B и возобновляется под свежей сессией A. Локальный прогон прошёл
  3/3 в desktop Chromium, Firefox и WebKit без retries; точный PR CI source HEAD
  `943d4c0` / merge-ref `75362ae` завершился success (run 38641088114).
  Также добавлены acceptance для reload и logout/login: pending запись с тем же
  opId переживает reload, а при logout sender ставится на паузу и возобновляет
  запись только после входа под свежей server session. Совместный локальный
  прогон всех трёх account-сценариев прошёл 9/9 в desktop Chromium, Firefox и
  WebKit без retries (`workers=1,retries=0`); полный CI `455cb01` завершился
  success.
  Это не закрывает общий P0.6: остаются old/new writers и остальные callbacks.

Готово, когда нет отправок чужих данных и потери записи из-за перезаписи
всей очереди одной вкладкой.

### P0.7 — непрерывные серверные версии после удаления

- [x] Реализовать additive-расширение `user_kv.deleted_at`, поколения
  tombstones и opt-in чтение удалённых записей в `fix/state-generations`.
- [x] Зафиксировать baseVersion=0 как отсутствие предыдущего поколения
  для PUT/DELETE; старое безусловное удаление существующего ключа запрещено.
- [x] Выполнять CAS и получать подтверждённую версию атомарно через `RETURNING`;
  конфликт отклоняет весь пакет, исчерпанная версия не переполняется.
- [x] Проверить SQLite: delete/recreate/stale update, гонки, миграцию,
  экспорт, перенос legacy-аккаунта и hard delete.
- [ ] Подключить совместимый клиент и проверяемый барьер старых writers;
- [x] Не повышать legacy `baseVersion` до доказанного серверного поколения:
  импортировать старые операции как конфликт с `baseVersion=0`, закрыть claim,
  атомарно снимать старую попытку и отклонять поздний ack. Unit и browser
  acceptance зафиксированы в [контракте миграции](docs/legacy-migration.md).
- [ ] Проверить delete → recreate → stale update, гонку пакетной записи,
  миграцию, экспорт и удаление аккаунта на staging.

Готово, когда устаревшая версия не становится действительной после recreate,
а версия в ответе принадлежит именно подтверждённой мутации.

[Контракт и условия выпуска](docs/state-generations.md),
[проверки компонента](docs/stabilization-progress.md#p07--серверные-поколения-state).
Серверная реализация не закрывает staging, клиент или выпуск в main.

### P0.8 — единая постоянная очередь в IndexedDB

В текущей ветке реализованы общий IDB DurableOutbox и транзакционная запись
данных с операцией, claim/lease и guarded finish. К ней подключены 15 управляемых
state-ключей, профиль, регистрация и guarded bootstrap; старый Map sender удалён
из текущей сборки. Runtime-импорт legacy-очереди использует свежий `/api/me`,
all-client Service Worker fence, атомарные migration items и quarantine.
Старый и новый browser bundle проверены на одном origin с реальной pending-записью.
Формат JSON backup v3 сохраняет пять долговечных IDB stores и поддерживает
атомарное восстановление. Контракты и результаты проверок: [legacy migration](docs/legacy-migration.md),
[backup/restore](docs/backup-restore.md), [статус проекта](docs/project-status.md).

- [x] Обновить существующую IDB до v2, сохранив values; создать outbox,
  migration_items, migration_unknown и outbox_meta.
- [x] Реализовать и проверить транзакционные примитивы записи value/операции,
  claim/lease и guarded finish, явное владение ключом и сессией.
- [x] Выполнять зависимые записи finish внутри success-события последнего
  IndexedDB read request; проверить Firefox-повторы и браузерную матрицу.
  Локальные результаты связаны с кодом [cae28bd](https://github.com/Michael-edel/FitFocus/commit/cae28bd);
  CI `8dc7f71` прошёл, но обнаружил ещё один flaky в outbox.write; см. следующий пункт.
- [x] Выполнять зависимые value/operation/meta записи `writeOutboxInTransaction`
  в success-событии последнего IDB-чтения и синхронно отменять транзакцию при
  ошибке (`8d7aee0`). Timeout Firefox прошёл 5/5, account-switch 3/3,
  Android migration 5/5; связанные E2E: 27 passed / 9 skipped.
- [x] Выполнять claim-запись в активном success-событии IDB-чтения; gate и
  migration receipt проверять для нужной legacy-операции без сканирования всей
  очереди на каждом claim (`35fceb4`). 1132 unit, typecheck, storage-strict,
  production build прошли; Firefox и Android Chrome: 18/18 целевых E2E.
- [x] Перевести гидратацию, session accept/invalidate/clear, resolve/retry,
  account cleanup и user-state backup restore на записи в success-событии последнего IDB
  request (`f3a9abf`). Добавлена обработка пустого набора запросов; 1133 unit,
  три typecheck, build и 57 связанных Firefox/Android E2E прошли локально.
- [x] Перевести readwrite callbacks legacy migration на предварительно
  поставленные IDB-запросы и синхронные продолжения из request events
  (`37dc4b0`). Snapshot/progress и импорт с ledger остаются транзакционно
  согласованными; 94 целевых unit, 1133 общих unit, три typecheck и build
  прошли. Целевой migration smoke прошёл 6/6 повторов в Firefox и Android
  Chrome; первый совместный прогон двух E2E specs имел один timeout — подробности
  и границы проверки в [журнале](docs/stabilization-progress.md).
- [x] Подтвердить полный CI точного HEAD `152d7d7` после code/docs push:
  1133 unit / 198 файлов, 540 browser passed / 83 skipped, audit без
  уязвимостей, guards, три typecheck, build и 23 rollback/CAS-запроса прошли в
  [run 38577353585](https://github.com/Michael-edel/FitFocus/actions/runs/38577353585).
- [x] Реализовать компонент импорта по [ADR-005](docs/adr/ADR-005-durable-outbox.md):
  операция/карантин, ledger и прогресс порции атомарны; повтор, коллизии,
  подтверждение и необработанные прежние снимки учтены в тестах.
- [x] Подключить runtime-импорт после свежего `/api/me`; для владельца брать
  только точные ключи текущего подтверждённого аккаунта. Другие записи остаются
  unknown-owner до входа владельца.
- [x] Заменить `writersStopped` boolean на Service Worker all-client fence:
  worker и все same-origin вкладки должны ответить одним build id. Без ответа
  или при устаревшем proof импорт сохраняется, но `sendAllowed=false`.
- [x] Подключить шесть ключей UserStateRepository к value/операции одной
  транзакцией; сохранить редактор чтения при входе и защитить managed hydration.
- [x] Читать settings из IDB, ожидать commit недельного отчёта, показывать
  ошибку/blocked и учитывать известную outbox в индикаторе облака.
- [x] Перевести sender шести ключей на claim/finish, свежий /me proof,
  общий auth-fence, server session guard и HTTP-исходы; проверить две вкладки
  без Web Locks. [Граница sender](docs/state-sender.md).
- [x] Подключить 15 управляемых state-ключей и feature editors, удалить Map
  sender текущей сборки и raw profile state-upload; проверить отсутствие
  defaults-записей, сохранность delete и раннего/конкурентного редактирования.
- [x] Подключить редактор существующего profile к той же outbox и guarded
  sender; проверить быстрые patches, конфликт, refresh, reload и отказ commit.
- [x] Сохранять регистрацию и причинный AI-update в этой outbox; исключить
  угадывание владельца при входе и прямой profile PUT; проверить reload/quota.
- [x] Подключить guarded bootstrap/state-hydration и auth-fence (`dac2de2`).
- [x] Проверить runtime-импорт старого и нового bundle на одном origin с
  реальным pending intent: сохраняются владелец, ledger и исходный legacy-ключ;
  неизвестный владелец помещён в карантин; old/new clients обновляются по
  all-client fence, а operation без доказанного поколения остаётся конфликтом
  и не отправляется автоматически.
  [Browser smoke](e2e/legacy-outbox-migration.spec.ts), 7/7; обновлённая
  migration E2E-проверка прошла в точном CI HEAD `08618e3`, run `38628487894`.
  Полный UI lifecycle второго действия проверяется реальным повторным кликом в
  открытой старой вкладке: её legacy sender уже auth-blocked, поэтому новое
  localStorage значение сохраняется в IndexedDB как `conflicted` с причиной
  `legacy-writer-local-only`, не меняя durable value или старую очередь. Локально
  прошли 69/69 targeted unit, `storage-strict` typecheck и desktop Chromium E2E
  и полная migration матрица 7/7 без retries. Точный CI этого расширения,
  profile и delete lifecycle остаются открытыми.
  - [x] Проверить в реальном old/new bundle smoke все семь причин нормализатора:
    `not-an-object`, `invalid-type`, `invalid-key`, `put-without-value`,
    `delete-with-value`, `invalid-baseVersion`, `invalid-retryCount`. Каждый raw
    record и reason сохранён в quarantine; операций и отправок для повреждённых
    ключей нет, migration status остаётся `partial` после writer fence. Матрица
    прошла 7/7 без retries в коммите
    [`7504a2c`](https://github.com/Michael-edel/FitFocus/commit/7504a2ceb10e36c80cee1d9d17c35fc0579f9033).
- [x] Экспортировать все долговечные IDB stores в JSON backup; атомарно
  восстанавливать values/outbox/ledger/quarantine/meta, отклонять конфликт без
  частичного импорта и заново требовать legacy writer fence. Форматы v1/v2
  остаются импортируемыми. [Контракт и тесты](docs/backup-restore.md).
- [x] В durable restore заранее ставить проверки существующих primary keys,
  затем выполнять сравнение и добавление внутри success-события IDB-запросов;
  конфликт отменяет единую транзакцию всех пяти stores. Браузерный импорт и
  rollback прошли 4/4 на Firefox и Android Chrome в `38d169c`.
- [ ] Завершить остальные callbacks и полный lifecycle P0.2–P0.6.
  - [x] Удержать GET `/api/family/menu/state` старой server session, повторно
    войти в тот же account и отпустить ответ после принятия нового `sessionEpoch`.
    Значения, family-menu snapshot и outbox остаются равны снимку до ответа.
    Тест прошёл 3/3 на desktop Chromium, Firefox и WebKit; точный CI изменённого
    SHA, другие callbacks, staging и общий lifecycle остаются открытыми.
- [x] Реализовать локальную очистку точных account-owned ключей и записей в
  пяти IDB stores одной транзакцией; инвалидировать сессию удаляемого аккаунта,
  сохранить чужие записи и показывать предупреждение при неполной очистке.
  [Контракт](docs/account-data-cleanup.md).
- [x] Подавлять повторный импорт данных удалённого аккаунта: локальный
  account tombstone хранится по SHA-256 ID, мигратор отмечает legacy fingerprint
  обработанным без новой операции, sender блокирует её claim/finish, а старый
  backup не восстанавливает account-owned строки при наличии tombstone. Общие
  source/snapshot сохранены; физическое удаление их payload и синхронизация
  tombstone с сервером остаются отдельными ограничениями.
  [Контракт](docs/account-data-cleanup.md).
  - [x] Вместе с удалением аккаунта сохранить неизвестную глобальную legacy-
    запись как `unknown-owner`; после повторной аутентификации не восстанавливать
    удалённую операцию и не превращать глобальную запись в account-owned. Снимок
    остаётся `partial`, raw evidence сохранена. Migration/cleanup unit suite
    прошла 70/70 в коммите
    [`82d5f27`](https://github.com/Michael-edel/FitFocus/commit/82d5f27dddb47ef374c0c1dd24835e5d2dfd26df).
- [ ] Завершить UI повтора/разрешения конфликтов и общий lifecycle.
  - [x] Добавить безопасные действия для обычных записей: повтор `failed`,
    оставить последнюю локальную версию или принять проверенный серверный снимок.
    Очередь и значения меняются транзакционно; действия требуют свежей сессии,
    точного набора operation IDs и не доступны legacy-записям.
  - [x] Пройти браузерную приёмку recovery-действий для state/settings, profile и
    familyMenu: retry failed, keep-latest-local, accept-server и отмена принятия.
    Полный прогон трёх spec-файлов прошёл локально: исходные 189 сценариев и
    добавленная проверка нескольких правок (всего 196 проверок по результатам
    прогонов); последний `storage-durability.spec.ts` прошёл 70/70 на семи
    browser/PWA-проектах. Общий/domain-strict/storage-strict typecheck прошёл.
    Проверка нескольких правок относится к следующей ревизии и не входит в CI
    SHA `4e2ccb7`.
  - [x] Подтвердить полный CI на `4e2ccb7`: 1092 unit / 197 файлов, 446 browser
    passed / 9 skipped, audit без уязвимостей, три typecheck, build и 23 rollback-
    запроса прошли в [run 38352095311](https://github.com/Michael-edel/FitFocus/actions/runs/38352095311).
  - [x] Подтвердить CI следующей ревизии с multi-edit сценарием: 1092 unit / 197
    файлов, 453 browser passed / 9 skipped, audit без уязвимостей, три typecheck,
    build и rollback-проверка прошли в [run 38354517668](https://github.com/Michael-edel/FitFocus/actions/runs/38354517668).
  - [x] Добавить явное разрешение импортированного конфликта для обычных
    account-owned state keys и профиля. State читает свежий scoped GET; профиль
    читает `/api/profile` и отправляет новую typed profile-операцию через CAS.
    Outbox и migration ledger обновляются атомарно; повторный импорт не воскрешает
    старую операцию. Legacy retry запрещён; динамический family-menu key
    появился после legacy writer, а его текущий typed conflict использует
    отдельный resource-specific recovery.
    State recovery: 1286 unit и 7/7 browser/PWA проектов. Profile recovery:
    122 целевой unit; полный набор — 1291/1291 в 208 файлах. Общий, domain и
    storage typecheck, auth/API guards и production build прошли; legacy migration
    E2E — 14/14 на семи desktop/mobile/PWA проектах, workers=2/retries=0.
    Точный CI актуальной ревизии ожидается.
  [Граница текущего runtime](docs/runtime-state.md).

Готово, когда IDB — единственный источник очереди, в том числе без Web Locks;
legacy-ключ не используется для новой очереди и не удаляется до проверенного
импорта. Неизвестное владение не определяется по активному аккаунту.

Контракт компонента и оставшиеся условия подключения:
[legacy migration](docs/legacy-migration.md). P0.8 остаётся открытым до
завершения остальных callbacks и полного lifecycle, UI повтора/разрешения
конфликтов, безопасной обработки global legacy evidence после удаления аккаунта
и общей приёмки.

### P0.9 — приёмка жизненного цикла

- [ ] Покрыть [матрицу сценариев](docs/sync-model.md#матрица-приёмки).
  - [x] Browser-acceptance для server commit с потерянным HTTP-ответом:
    первая запись фиксируется сервером, ответ обрывается, повтор той же операции
    получает 409. Тот же opId/payload остаётся конфликтным, confirmedVersion не
    продвигается без проверенного ack. Сценарий прошёл 7/7 desktop/mobile/PWA
    Playwright-проектов без retries на коммите
    [d028bc4](https://github.com/Michael-edel/FitFocus/commit/d028bc4d5a14e0711b40a8b10e446cdc9e382511).
    Это mock API acceptance; staging и остальные строки матрицы остаются открыты.
- [ ] Разделить unit, браузерные тесты с mock API и реальные staging-проверки.
- [ ] Пройти [чек-лист выпуска](RELEASE_CHECKLIST.md) на точном release SHA.

Готово, когда доступны результаты по каждому сценарию и нерешённые
конфликты/неизвестные legacy-записи не скрыты статусом «миграция завершена».

## P1 — после P0

- [ ] Исправить контраст sidebar и нижней навигации в светлой теме:
  снимки desktop Chromium и Android после переключения на «Светлая» показывают
  тёмные подписи на тёмном фоне. Проверить [SidebarNavigation](SidebarNavigation.tsx),
  [App](App.tsx), глобальные стили и [theme hook](features/settings/useDocumentTheme.ts).
  Предупреждение конфликта читается; весь визуальный QA этим не закрыт.
- [ ] Исправить контраст native select «Цель» в тёмной теме WebKit:
  screenshot профиля показывает светлый текст на светлом фоне. Проверить
  [SettingsScreen](SettingsScreen.tsx) и темы; функциональный E2E не доказывает читаемость.

- [ ] Заменить `Record<string, unknown>` в группах props `AppWorkspace`
  конкретными контрактами; расширять строгую типизацию по модулям.
- [ ] Продолжать выделять сценарии из оставшихся крупных модулей, опираясь
  на уже существующие feature hooks и серверные use cases.
- [ ] Добавить измерения из [наблюдаемости](docs/observability.md), снять
  исходный уровень и согласовать пороги.
- [ ] Подтвердить реальные OAuth, D1, push, платежи и wearable-сценарии
  в подходящей тестовой среде перед зависимыми релизами.
- [ ] Вернуться к продуктовым улучшениям из [PRODUCT.md](PRODUCT.md).

## Как закрывать задачу

Для выполненного пункта указывать commit/PR, затронутые контракты,
проверенные сценарии и ограничения. Обновлять документы в том же изменении.
Зелёный deploy не заменяет зелёный CI; skipped/neutral проверка не считается
подтверждением отсутствия ошибок или секретов.
