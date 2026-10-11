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
| [Карта кода](docs/code-map.md) | Функция → исходники → контракт и проверки; границы ответственности |
| [Пользовательские записи](docs/owned-state-writers.md) | 15 управляемых ключей, редакторы и границы profile/legacy |
| [Сохранение профиля](docs/profile-persistence.md) | Редактор профиля, постоянная операция, сессии и несохранённая форма |
| [Регистрация](docs/registration-persistence.md) | Commit до AI, canonical account, guarded invite и восстановление после reload |
| [Загрузка сессии](docs/bootstrap-hydration.md) | Guarded bootstrap, state-hydration, auth-fence и границы приёмки |
| [Сессия AI и списка покупок](docs/ai-session-guard.md) | Серверный guard, текущее подключение меню и критерии приёмки |
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

## Что подтверждено

Последующее исправление [`f3930ec`](https://github.com/Michael-edel/FitFocus/commit/f3930ec64f7fa74f3aad352246aa18b92d2542b7) разделяет автоматический flush профиля и
ручную проверку сессии: debounce больше не снимает auth-паузу повторным `/me`.
Локально: 905 unit / 183 файла, три typecheck и обязательные проверки;
201 browser passed / 9 skips без retries. CI нового HEAD проверяется отдельно.
[Контракт и границы](docs/state-sender.md#автоматическая-отправка-и-ручная-проверка-сессии).

Базовый опубликованный снимок — `8fc0b1b1adc44975396578e2ee60a4e7d1873eb7`,
ветка `fix/durable-outbox`, [draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93).
[CI этой ревизии](https://github.com/Michael-edel/FitFocus/actions/runs/38175438277)
завершился успешно: 860 unit-тестов в 179 файлах, 152 browser passed,
9 skips, без flaky; обязательные проверки прошли.

В ветке реализованы общая IDB-outbox, 15 управляемых state-ключей,
сохранение профиля и регистрации, guarded bootstrap/hydration и серверная
привязка AI/items к сессии. Контракты и границы компонентов доступны
в [статусе проекта](docs/project-status.md) и [карте кода](docs/code-map.md).
Архитектурный снимок `810adb1` и результаты прежних этапов сохранены
в [журнале](docs/stabilization-progress.md).

Следующий компонент [`f4b4eee`](https://github.com/Michael-edel/FitFocus/commit/f4b4eee1e577292019481b711b097941df27558e) подключает персональное недельное меню:
свежий proof, защита поздних ответов, постоянный profile commit до явной
отправки items, ошибка вторичной записи и повтор после таймаута.
Также исправлена прокрутка desktop-панели к настройкам. Локально прошли
900 unit / 183 файла, три typecheck и обязательные проверки; полная браузерная
матрица — 200 passed / 1 failed / 9 skips, без retries.
[Контракт и границы](docs/ai-session-guard.md#клиентское-подключение-в-работе).
Это отдельная ревизия: её CI проверяется после публикации, результат `8fc0b1b`
на неё не переносится. CI документирующего `59a3630` также прошёл: 860 unit,
152 browser passed / 9 skips, без flaky; код меню в него ещё не входил.

Runtime legacy-импорт, остальные AI/report/retry/family и achievement callbacks,
конфликты, backup/экспорт/очистка, staging и выпуск остаются открытыми.
PR #93 не слит в защищённую main; готовность ветки не подтверждает deploy.
Порядок дальнейшей работы — в [TASKS](TASKS.md).

Предыдущее подробное описание и старые результаты проверок сохранены
в [архиве README](docs/history/README-2026-08-29.md).
Дополнения прежнего README интеграционной ветки доступны
[на ревизии 93f90c0](https://github.com/Michael-edel/FitFocus/blob/93f90c07646ca8aac4a9dcec9ac9e19b67971038/README.md).
