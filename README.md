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
| [Пользовательские записи](docs/owned-state-writers.md) | 15 управляемых ключей, редакторы и границы profile/legacy |
| [Сохранение профиля](docs/profile-persistence.md) | Редактор профиля, постоянная операция, сессии и несохранённая форма |
| [Регистрация](docs/registration-persistence.md) | Commit до AI, canonical account, guarded invite и восстановление после reload |
| [Загрузка сессии](docs/bootstrap-hydration.md) | Guarded bootstrap, state-hydration, auth-fence и границы приёмки |
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

Описание архитектуры закреплено за `810adb1` из
[PR #90](https://github.com/Michael-edel/FitFocus/pull/90). Последующие
изменения перечислены [в журнале](docs/stabilization-progress.md)
с отдельными ревизиями и границами проверки.

Код текущего клиентского этапа — `dac2de2`,
[draft PR #93](https://github.com/Michael-edel/FitFocus/pull/93).
[15 управляемых state-ключей](docs/owned-state-writers.md) используют
атомарный repository, защищённую загрузку и sender с проверкой сессии.
Map sender удалён из текущей сборки; profile state-upload использует общий
sender вместо raw-пакета из localStorage. Регистрация (`2e41742`) и
lifecycle sender (`b723b7d`) проверены локально. На `cb6e6cf` исправлено
неточное ожидание числа запросов в E2E. Предыдущая опубликованная ревизия —
`7f481aa`; [её CI](https://github.com/Michael-edel/FitFocus/actions/runs/38165704790)
прошёл: 817 unit-тестов, 117 browser passed и 9 skips, без flaky.
История предыдущего CI с flaky сохранена в журнале.
Результаты и ограничения каждой ревизии — [в журнале](docs/stabilization-progress.md);
Новый компонент `dac2de2` проверяет HTTP bootstrap/state по сессии и применяет
снимки с транзакционным auth-fence; одинаковая загрузка второй вкладки больше
не делает первую правку конфликтующей. 846 unit-тестов прошли. Полный локальный
E2E: 144 passed / 1 failed / 9 skips; нестабильный profile Save на iPhone PWA
остаётся открытым: [контракт и результаты](docs/bootstrap-hydration.md).
CI следующего HEAD проверяется отдельно в PR #93.
Серверная зависимость PR #94 объединена коммитом `93f90c0`;
[контракт и ограничения](docs/state-generations.md).

Редактор profile использует ту же IDB-outbox и guarded sender;
[его контракт и граница](docs/profile-persistence.md). [Регистрация](docs/registration-persistence.md)
создаёт постоянную операцию до AI-запроса. Runtime legacy-импорт, полный lifecycle,
staging и выпуск остаются открытыми. На 11.10.2026 PR #93 не слит
в защищённую main; готовность ветки не считается готовностью production.
Актуальные границы и ближайшие шаги — [в статусе проекта](docs/project-status.md).

Предыдущее подробное описание и старые результаты проверок сохранены
в [архиве README](docs/history/README-2026-08-29.md).
Дополнения прежнего README интеграционной ветки доступны
[на ревизии 93f90c0](https://github.com/Michael-edel/FitFocus/blob/93f90c07646ca8aac4a9dcec9ac9e19b67971038/README.md).
