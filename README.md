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
| [Артефакт отката](docs/release-artifacts.md) | Сохранённая сборка клиента/SW/Pages Worker, контрольные суммы и проверка canonical readers |
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

Подтверждённый [CI опубликованной ревизии `574de76`](https://github.com/Michael-edel/FitFocus/actions/runs/38234201581):
1047 unit / 193 файла, 341 browser passed / 9 skips, success.
В логах остались два preview `ECONNREFUSED` при завершении mock-сценариев;
эта проблема ещё открыта. Ревизия содержит поправку первого SW-клиента.
Локальные неуспешные прогоны и границы actual-bundle smoke сохранены
[в контракте меню](docs/family-menu-state.md) и [журнале](docs/stabilization-progress.md).
[Явное PWA-обновление](docs/pwa-updates.md) опубликовано в `8d32f12`.
Его CI подтверждает локально разработанное поведение; реальные устройства,
совместимый откат и staging остаются открытыми.
Поправка первого SW-клиента опубликована в `574de76` и прошла CI.
Следующий компонент — [сохранённый артефакт отката](docs/release-artifacts.md);
его инструменты и сценарии находятся в незавершённом рабочем дереве.

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
