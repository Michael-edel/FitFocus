# FitFocus

FitFocus — PWA для питания, привычек и прогресса: дневник, анализ еды,
персональный план, рецепты, семейное меню и список покупок. Есть вход через
Google/Apple, push, поддержка и административные функции. Доступность
внешних интеграций зависит от настройки среды.

Обновлено: 12.10.2026. Текущий этап — стабилизация сохранения данных,
синхронизации и выпуска. Полный перечень функций: [PRODUCT.md](PRODUCT.md).

## Документы проекта

Начните с [текущего состояния проекта](docs/project-status.md): что проверено,
что находится в работе и что делаем дальше. Полный перечень —
в [карте документации](docs/README.md), порядок использования MD-файлов —
в [кратком руководстве](docs/README.md#как-пользоваться-md-файлами).

| Файл | Для чего нужен |
|---|---|
| [Текущее состояние](docs/project-status.md) | Проверенный SHA, готовые компоненты, рабочие изменения и ближайшие шаги |
| [Матрица проверок P0](docs/verification-matrix.md) | Проверенная область, тесты и оставшиеся критерии каждого P0 |
| [Личное меню и покупки](docs/personal-menu-projection.md) | SQL-проекция принятого profile, проверки и условия приёмки |
| [Переход на схему покупок 0020](docs/profile-cas-rollout.md) | Подготовительный сервер, порядок миграции и ограничения отката |
| [Сессии семейных запросов](docs/family-session.md) | Исходный login proof, поздние ответы, приглашения и отметки покупок |
| [Карта кода](docs/code-map.md) | Функция → исходники → контракт и проверки; границы ответственности |
| [Пользовательские записи](docs/owned-state-writers.md) | 15 управляемых ключей, редакторы и границы profile/legacy |
| [Сохранение профиля](docs/profile-persistence.md) | Редактор профиля, постоянная операция, сессии и несохранённая форма |
| [Регистрация](docs/registration-persistence.md) | Commit до AI, canonical account, guarded invite и восстановление после reload |
| [Загрузка сессии](docs/bootstrap-hydration.md) | Guarded bootstrap, state-hydration, auth-fence и границы приёмки |
| [Сессия AI и списка покупок](docs/ai-session-guard.md) | Серверный guard, текущее подключение меню и критерии приёмки |
| [Сессия достижений](docs/achievement-session.md) | Guarded GET/POST, исходный login proof, очередь и отмена старых callbacks |
| [PRODUCT.md](PRODUCT.md) | Функции, пользовательский цикл и приоритеты |
| [TASKS.md](TASKS.md) | Порядок P0/P1 и критерии готовности |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Запуск, проверки и порядок изменений |
| [AGENTS.md](AGENTS.md) | Правила работы помощника с репозиторием |
| [Архитектура](docs/current-architecture.md) | Устройство проверенного кода |
| [Данные](docs/data-model.md) и [синхронизация](docs/sync-model.md) | Хранилища, текущие ограничения и целевые гарантии |
| [API_CONTRACTS.md](API_CONTRACTS.md) | Контракты state/profile |
| [DECISIONS.md](DECISIONS.md) и [ADR-005](docs/adr/ADR-005-durable-outbox.md) | Решения и статус внедрения |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Проверка, выпуск и откат |
| [Журнал стабилизации](docs/stabilization-progress.md) | Изменения, SHA и результаты проверок |
| [Жизненный цикл mock API](docs/mock-api-lifecycle.md) | Опубликованная E2E-фикстура, результаты диагностики и границы приёмки |
| [Артефакт отката](docs/release-artifacts.md) | Сохранённая сборка клиента/SW/Pages Worker, контрольные суммы и проверка canonical readers |
| [Preview и staging](docs/staging-origin.md) | Сохранение origin, настройки APP_URL/D1 и отдельная приёмка окружения |
| [Реализация P0.8](docs/outbox-implementation.md) | Проверенный фундамент очереди, оставшаяся работа и приёмка |
| [Импорт старой очереди](docs/legacy-migration.md) | Формат legacy, карантин, восстановление и условия отправки |
| [Серверные поколения P0.7](docs/state-generations.md) | Версии после удаления, новый API и условия выпуска |
| [Подключение пользовательских данных](docs/runtime-state.md) | Атомарное сохранение, загрузка из облака и границы текущего клиента |
| [Отправка изменений](docs/state-sender.md) | Подтверждённая сессия, HTTP, конфликты, паузы и повторы |

## Локальный запуск

Среда CI: Node.js 24, Python 3.12. Из корня репозитория:

```text
npm ci
npm run dev
```

Vite запускает клиент на `http://localhost:5173` и проксирует `/api` на
`http://localhost:8788`. Для входа и серверных функций требуется настроенный
backend; порядок и ограничения описаны в [CONTRIBUTING.md](CONTRIBUTING.md).

## Состояние разработки

Рабочая ветка — `fix/durable-outbox`, [draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93).
Реализованы общая IDB-outbox, 15 управляемых state-ключей, сохранение профиля
и регистрации, guarded bootstrap/hydration, персональное меню и привязка
HTTP достижений и `useFamilyCloud` к исходной сессии. Семейное меню на `405238b`
сохраняет меню, порции и покупки одним family/week CAS через ту же outbox.
Границы реализации и точные результаты — в [статусе проекта](docs/project-status.md).

Подтверждённый [CI опубликованной ревизии `076f4ac`](https://github.com/Michael-edel/FitFocus/actions/runs/38261672999):
1053 unit / 194 файла; browser — 383 passed / 9 skips, success, 20,3 мин.
В итоговом логе нет flaky, preview proxy errors и ECONNREFUSED.
Причины прежних WebKit access-control и Firefox timeout остаются открытыми.
В `98d4910` удалён неиспользуемый Google SDK; локально до CI прошли
7/7 auth-shell и 7/7 real-SW обновлений без retries.
Локальные неуспешные прогоны и границы actual-bundle smoke сохранены
[в контракте меню](docs/family-menu-state.md) и [журнале](docs/stabilization-progress.md).
[Явное PWA-обновление](docs/pwa-updates.md) опубликовано в `8d32f12`.
Его CI подтверждает локально разработанное поведение; реальные устройства,
совместимый откат и staging остаются открытыми.
Поправка первого SW-клиента опубликована в `574de76` и прошла CI.
[Компонент артефакта отката](docs/release-artifacts.md) закрепляет базу
`98d4910` и сохраняет клиент/SW, полный Pages Worker, исходники и миграции.
Новый архив проверен локально: 82 файла, 28 browser passed на семи
конфигурациях, workers=1/retries=0. Прежние неуспешные прогоны `574de76`
сохранены в журнале. HTTP/D1-переход `bd763ec` → архив `98d4910` прошёл
23 запроса. Компонент опубликован в `bd763ec`, поправка workflow — в `5b90249`.
CI прошёл HTTP/D1-проверку из 23 запросов и сохранил архив; скачанный
артефакт проверен по GitHub digest и inventory 82 файлов. Staging и приёмка
нестабильного WebKit-сценария остаются открытыми. E2E-фикстура опубликована
в `085fcc1` и проверяется
[отдельно](docs/mock-api-lifecycle.md): после уточнения предусловия экрана
98 passed на семи конфигурациях без retries/proxy-ошибок; исходный 97/1 сохранён.
CI preview-компонента подтверждён на `076f4ac`; mock-фикстура подтверждена
на предыдущем `aefc463`. Локальная origin-матрица прошла 28/28.

Личные покупки следуют одной profile-операции и SQL-проекции;
[контракт](docs/personal-menu-projection.md). Подготовительный сервер `dde4c71`
прошёл локальный переход 0019 → 0020 → сервер проекции (30 HTTP);
[порядок и границы](docs/profile-cas-rollout.md).
[Подготовительный CI `c39904c`](https://github.com/Michael-edel/FitFocus/actions/runs/38196258543)
прошёл отдельно: 952 unit, 229 browser passed / 9 skips.

Следующие задачи: завершить PWA/lifecycle-приёмку и совместимый откат,
защитить остальные AI/report/retry/family callbacks, подключить runtime
legacy-импорт, разрешение конфликтов и backup/экспорт/очистку.
Порядок и критерии готовности — в [TASKS](TASKS.md).

PR #93 не слит в защищённую main. Реальные OAuth, BFCache на устройствах,
staging и выпуск этой интеграционной версии ещё требуют проверки.

Предыдущее подробное описание и старые результаты проверок сохранены
в [архиве README](docs/history/README-2026-08-29.md).
Дополнения прежнего README интеграционной ветки доступны
[на ревизии 93f90c0](https://github.com/Michael-edel/FitFocus/blob/93f90c07646ca8aac4a9dcec9ac9e19b67971038/README.md).
