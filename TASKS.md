# Стабилизация и развитие FitFocus

Обновлено: 14.10.2026. Последний полный CI на опубликованном SHA
[`92a5be2`](https://github.com/Michael-edel/FitFocus/commit/92a5be2115f1cf9cea4685a10bbba4e9bc051d0f)
([run 38444933538](https://github.com/Michael-edel/FitFocus/actions/runs/38444933538))
завершился success: 1115 unit / 198 файлов, 484 browser passed / 25 skipped,
audit без известных уязвимостей, guards, три typecheck, build и rollback/CAS
на 23 запросах прошли. Два E2E были flaky и прошли retry: Chromium ожидал
`pending`, но увидел `sending` в IndexedDB; WebKit поймал access-control warning
при семейном menu state. Точные сценарии локально прошли по 5/5; причина CI
нестабильности не установлена. Новый P0.5 achievement account-switch тест
закоммичен в [`b44d46e`](https://github.com/Michael-edel/FitFocus/commit/b44d46eb78255b4b5da0fcbb58cd442e0b2d2eb3)
и локально прошёл 7/7 browser/PWA-профилей без retries; общий typecheck прошёл.
Для этого нового SHA полный CI ещё ожидается.

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
  это не объясняет автоматически все исторические сообщения. Общий CORS-фильтр не добавлять.
- [x] Опубликовать компонент и проверить CI точного `ece4e7a`: success,
  846 unit-тестов, 144 browser passed / 1 flaky / 9 skips.
- [x] Проверить CI опубликованного исправления Save на точном `45315d9`:
  success, 846 unit-тестов, 152 browser passed / 9 skips, без flaky.
- [ ] После исправлений пройти полную матрицу без retries и проверить CI
  итогового HEAD. На `3550cc8`: 151 passed / 1 failed / 9 skips; падение —
  Safari page error на reload после успешного Save/409. Шесть диагностик
  с задержанными запросами и reload его не воспроизвели; общий фильтр ошибок
  не добавлен. CI `45315d9` прошёл, но локальное падение и его причина остаются
  частью приёмки. [Подробные свидетельства](docs/stabilization-progress.md).

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
  Счётчики остаются best effort; staging/BFCache ещё открыты.
  [Контракт и границы](docs/achievement-session.md).
- [ ] Версионировать вторичную items-проекцию и определить durable-порядок
  конкурирующих writers; scoped HTTP не заменяет CAS или постоянную очередь.
- [ ] Пройти реальные BFCache/OAuth/staging-сценарии и остальные AI/report/retry/family
  writers. Unit-проверка двух IDB connections не заменяет old/new bundles.

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
- [ ] Перевести AI-сценарий `useFamilyMenu`, family/week CAS и постоянную
  доставку через существующую IDB-outbox; пройти реальные bundles/staging.

Следующая семейная часть опубликована как `405238b` и ещё проходит общую приёмку.
[Точная граница текущей работы](docs/project-status.md#текущая-работа--семейное-меню).
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
  все `workers=1/retries=0`. Причина timeout пока не установлена.
  Working tree пишет IDB open/blocked/upgrade, versionchange/close и стадии
  transaction/read в failure attachment.
- [ ] Разобрать исторический native WebKit sender pageerror после PWA update
  из trace CI `5b90249`. На опубликованной `47da77c` delayed native PUT
  сценарий прошёл 3/3 (`workers=1/retries=0`) и подтвердился в полном CI;
  операция сохранила opId/payload, pageerror не возник. Историческая ошибка
  не воспроизведена, первопричина не установлена.
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
  затем приёмку выпуска.

Готово, когда изменения, сделанные во время auth-паузы, не теряются и
после входа отправляются только от подтверждённого владельца.

### P0.4 — защитить локальные изменения при загрузке облака

- [x] Для 15 managed-ключей и профиля перед cloud apply проверять pending/sending/conflicted
  операции и локальную ревизию для этого аккаунта и ключа.
- [x] Проверить `sessionHydration.ts`, profile refresh через stateSync и repository отдельно.
- [x] В этих путях не заменять локальный снимок и не менять baseVersion только потому,
  что пришла более новая облачная версия.
- [ ] Проверить остальные cloud callbacks и cache приложения по тем же гарантиям.

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
- [x] Добавить серверную проверку account/session в AI и weekly-menu items
  до прикладных эффектов (`16d3c34`); capabilities и HTTP-регрессии проверены.
  [Контракт](docs/ai-session-guard.md). Запросы без scope остаются прежними.
- [x] Защитить недельный AI-отчёт и его retry свежим session proof, lifecycle
  guard и durable commit; локальные профильные проверки описаны в
  [контракте](docs/weekly-ai-report-session.md). GitHub CI коммита `0b7062d`
  упал на E2E (343 failed из 476) в [run 38357547143](https://github.com/Michael-edel/FitFocus/actions/runs/38357547143);
  локальный follow-up прошёл 49/49 связанных тестов Chromium; полный CI нового SHA ожидается.
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
  `workers=3`, `retries=0`; `npm run typecheck` прошёл. Точный CI ожидается.
- [x] Закрепить invite и member mutations за явным `familyId`: `/api/me`
  объявляет `familySync.target`; старый сервер без capability блокируется до
  запроса. Сервер проверяет точное членство/владельца, UI отбрасывает поздний
  invite после смены семьи при том же login. `2bbec11`: 1128 unit / 198 файлов,
  27 family E2E на трёх desktop-браузерах, target-capability 7/7 проектов,
  typecheck/guards/schema/privacy/audit/build и 23 rollback/CAS HTTP прошли.
  Точный CI ожидается; staging и реальные old/new bundle для этого изменения
  остаются открытыми.
- [ ] Завершить family callbacks и другие AI/state writers; для всего приложения
  серверный guard сам по себе недостаточен.

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
- [ ] Завершить эти гарантии для profile и остальных API callbacks; runtime legacy
  уже использует auth-derived owner и all-client Service Worker fence.
- [x] Проверить old/new migration с двумя вкладками на одном origin без Web Locks;
  [smoke](e2e/legacy-outbox-migration.spec.ts) прошёл 7/7 проектов.
- [ ] Проверить конкурентные записи разных и одинаковых ключей, logout/login
  и смену аккаунта; завершить profile и остальные API callbacks.

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
  отдельно обработать старые операции без доказанного серверного поколения.
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
  неизвестный владелец помещён в карантин; старое окно не отправляет запись до
  обновления, а новая очередь отправляет её после all-client fence.
  [Browser smoke](e2e/legacy-outbox-migration.spec.ts), 7/7.
- [x] Экспортировать все долговечные IDB stores в JSON backup; атомарно
  восстанавливать values/outbox/ledger/quarantine/meta, отклонять конфликт без
  частичного импорта и заново требовать legacy writer fence. Форматы v1/v2
  остаются импортируемыми. [Контракт и тесты](docs/backup-restore.md).
- [ ] Завершить остальные callbacks и полный lifecycle P0.2–P0.6.
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
