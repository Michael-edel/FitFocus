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
HTTP достижений к исходной сессии. Границы реализации и точные результаты
проверок — в [статусе проекта](docs/project-status.md).

Подтверждённый [CI `2d1f480`](https://github.com/Michael-edel/FitFocus/actions/runs/38194485398):
976 unit / 187 файлов, 236 browser passed / 9 skips, success.
Прежние неуспешные прогоны и причины исправлений сохранены
[в журнале](docs/stabilization-progress.md). Переработка личных
покупок `4736ff5` описана [отдельно](docs/personal-menu-projection.md);
локально прошли 976 unit и полная browser matrix `4736ff5`: 236 passed / 9 skips.
Подготовительный сервер `dde4c71` прошёл 952 unit и локальный переход
0019 → 0020 → сервер проекции; [порядок и границы](docs/profile-cas-rollout.md).
Каждый последующий HEAD требует отдельной проверки CI.

Следующие задачи: завершить текущую приёмку, защитить остальные AI/report/retry/family
callbacks, определить CAS и постоянный порядок вторичной items-проекции,
подключить runtime legacy-импорт, разрешение конфликтов и backup/экспорт/очистку.
Порядок и критерии готовности — в [TASKS](TASKS.md).

PR #93 не слит в защищённую main. Реальные OAuth, BFCache на устройствах,
staging и выпуск этой интеграционной версии ещё требуют проверки.

Предыдущее подробное описание и старые результаты проверок сохранены
в [архиве README](docs/history/README-2026-08-29.md).
Дополнения прежнего README интеграционной ветки доступны
[на ревизии 93f90c0](https://github.com/Michael-edel/FitFocus/blob/93f90c07646ca8aac4a9dcec9ac9e19b67971038/README.md).
