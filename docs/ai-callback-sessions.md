# Защита клиентских AI callbacks

Обновлено: 13.10.2026. Реализация контракта опубликована в [`75e4d35`](https://github.com/Michael-edel/FitFocus/commit/75e4d35bb7ba48970eac6f20898f73108116215e)
ветки `fix/durable-outbox`. Push-run отменён concurrency после старта PR-события.
Точный [PR CI run 38379449644](https://github.com/Michael-edel/FitFocus/actions/runs/38379449644)
завершился ошибкой E2E: 463 passed / 9 skipped, один failed и три flaky; audit,
guards, unit, три typecheck и build прошли. Единственный failed сценарий был
Firefox weekly-menu: fixture не отвечал на фоновый `/api/ai` feature `wis_text`,
и проверка консоли считала ошибку недельного отчёта ошибкой меню. После явного
mock-ответа локально прошли все 8 сценариев weekly-menu на Firefox и 5 повторов
затронутого сценария. Фикс тестовой фикстуры закоммичен в [`ec29f41`](https://github.com/Michael-edel/FitFocus/commit/ec29f41c88045c1d7a933a461260744f9a641070);
его точный [PR CI run 38385161995](https://github.com/Michael-edel/FitFocus/actions/runs/38385161995)
завершился success: 1115 unit / 198 файлов, 466 browser passed / 9 skipped.
Один flaky — iPhone PWA preview-origin (`route.fetch: socket hang up`), retry
прошёл; причина не установлена. Не переносите исторические
проверки базовых SHA на текущую реализацию.

## Область

Контракт охватывает запрос совета coach, повтор совета, повтор генерации
личного плана, объяснение плато на Dashboard и его повтор. Первичная генерация
плана при регистрации сохраняет отдельный порядок из
[контракта регистрации](registration-persistence.md), но её запрос к /api/ai
также должен соблюдать session-scoped transport. Недельный отчёт описан в
[отдельном контракте](weekly-ai-report-session.md), серверные заголовки и
capabilities — в [контракте AI API](ai-session-guard.md). Семейные callbacks
остаются в [контракте семейной сессии](family-session.md).

## Требования к каждой попытке

1. Перед первым AI POST проверить, что исходная login-сессия всё ещё относится
   к текущему профилю. Получить свежий proof через prepareAiSession, передав
   исходный login guard. Нельзя принимать cookie сессии другого аккаунта или
   повторного входа за proof старого действия.
2. Отправлять каждый запрос к /api/ai с тем же AiSession. Это включает запросы
   к резервным моделям внутри генератора: смена модели не создаёт новую
   пользовательскую попытку и не меняет account/session scope. Не делать
   unscoped fallback, если capability или scoped transport недоступны.
3. Проверять HTTP-статус, протокол, guard, account/session headers и текущий
   read guard прежде чем считать ответ допустимым. Наличие cookie, capability
   или HTTP-ответа само по себе не разрешает применить результат.
4. Каждая попытка принадлежит собственному lifecycle. Logout, смена аккаунта,
   новый запуск действия, pagehide и unmount инвалидируют её и отменяют её
   transport. Возврат из BFCache начинает новую попытку и заново получает proof;
   старый controller не оживает.
5. После каждого ожидания и непосредственно перед побочным эффектом проверять,
   что всё ещё текущими являются login guard, attempt и исходное действие.
   Старый ответ и его finally не могут изменить карточку, профиль, loading,
   счётчик использования, достижение или маркер новой попытки.

Для action lifetime использовать AiActionScope либо эквивалентную проверяемую
версию попытки. Для durable-записи требуется OutboxCommitGuard с readGuard и
canCommit, проверяемыми внутри IDB-транзакции. Одной проверки перед записью из
React недостаточно.

## Результаты и побочные эффекты

- **Личный план.** Сформированный план передавать в функциональное обновление
  текущего профиля через profile editor и durable outbox. Ожидать исход commit;
  считать сохранение успешным только для подтверждённой pending-операции.
  Локальный fallback допустим только при восстанавливаемой ошибке генерации,
  пока исходная сессия актуальна. Ошибка auth/protocol, смена сессии или отказ
  commit не должны превращаться в «успешный» fallback.
- **Совет coach.** Обновлять карточку, сохранять last_coach_card через guarded
  repository, увеличивать usage и запускать achievement только для текущей
  попытки. Durable-commit карточки должен быть подтверждён до эффектов,
  означающих успешную генерацию.
- **Объяснение плато.** Обновлять adapt note и loading только у текущей
  попытки. Этот UI-текст сам по себе не меняет профиль и не создаёт
  outbox-операцию.
- **Повтор.** До старта и после получения proof сверить пользователя,
  type/feature и идентичность последнего AI-действия; повторно проверить лимит
  повтора. Ответ прежнего действия не может подменить результат нового.

Смена сессии или отмена означает, что результат устарел: не показывать его,
не сохранять, не запускать fallback и не выполнять success-effects. Обычная
ошибка провайдера может показать существующую ошибку и предусмотренный
продуктом локальный fallback, только если попытка и сессия всё ещё текущие.

## Текущее состояние реализации

В коммите `75e4d35` клиентские пути coach, личного плана и плато переведены на
свежий `AiSession` и lifecycle scope. `getCoachAdvice`, `generatePersonalPlan`
и `generatePlateauExplanation` передают одну сессию каждому `/api/ai` запросу,
в том числе повторным запросам внутри генератора. Ошибка proof или response
scope не запускает unscoped запрос.

- **Coach:** hook получает proof от исходной login-сессии, сверяет action и
  профиль после ожиданий, записывает карточку через guarded repository, а usage
  через функциональный профильный commit. Карточка, usage и achievement не
  показываются успешными при отказе commit. Повтор передаёт ожидаемый action.
- **Личный план:** регистрация сохраняет базовый профиль до AI и ограничивает
  первый proof пустым `active-session` с атомарной проверкой auth-fence. После
  генерации план сохраняется guarded профильной операцией. Повтор использует
  тот же session/lifecycle контракт и не применяет fallback после смены IDB
  сессии или отказа commit. Восстанавливаемая ошибка допускает существующий
  локальный план только после повторной проверки исходной сессии.
- **Плато:** Dashboard и повтор используют общий hook; профиль, исходный action,
  pagehide, logout и новая попытка блокируют поздний ответ. Текст объяснения
  обновляет только UI.
- **Задача дня при загрузке профиля:** при необходимости AI-запроса hydration
  заранее получает scoped proof и держит pagehide abort до завершения. При
  временном отказе AI используется локальный текст только после подтверждения
  исходной сессии; unscoped POST не выполняется.
- **Недельный retry:** новый actionId сверяется до и после генерации и внутри
  durable commit guard; ожидаемая отмена классифицируется как тихая ошибка.

Локально прошёл полный unit-набор: 1115 тестов / 198 файлов; профильные тесты,
общий, domain-strict и storage-strict typecheck прошли. Browser-проверки
registration, onboarding и weekly report прошли 32 сценария; 3 пропущены
проектной конфигурацией. Матрица выполнена на 7 browser/PWA-профилях без retries.
Follow-up E2E mock также прошёл weekly-menu spec 8/8 на desktop Firefox и 5/5
повторов основного сценария. CI `75e4d35` имел один E2E failure и три flaky;
PR CI исправления `ec29f41` прошёл с одним unrelated flaky в preview-origin.
Коммит [`9bc98ee`](https://github.com/Michael-edel/FitFocus/commit/9bc98ee43e14559fa9fd1578fdf939ba9292acbc)
добавляет `e2e/ai-callback-account-switch.spec.ts`: задержанный Coach retry и
объяснение плато проверяются после входа аккаунта B во второй вкладке. Локально
прошли 6/6 на desktop Chromium, Firefox и WebKit; для сетевого mock ответ
отпускается раньше 10 секунд, до таймаута запроса. Полный [CI точного SHA](https://github.com/Michael-edel/FitFocus/actions/runs/38410002498)
завершился success: E2E, статические проверки, typecheck, build и rollback/CAS jobs прошли.

Следующая локальная browser-приёмка удерживает повтор личного плана аккаунта A,
пока соседняя вкладка входит в B. Тест проверяет, что поздний ответ не меняет
профиль, значения, outbox, active session или success-effects обоих аккаунтов.
Сценарий прошёл 3/3 на desktop Chromium, Firefox и WebKit; `npm run typecheck`
прошёл. Тест опубликован в [`eae1ce1`](https://github.com/Michael-edel/FitFocus/commit/eae1ce18567a967acf9c6e0a2812b48c2a9ef979);
точный PR CI `c48ce1b` завершился success в [run 38429247879](https://github.com/Michael-edel/FitFocus/actions/runs/38429247879): 1115 unit, 485 E2E passed / 25 skipped и один flaky с retry в независимом legacy migration сценарии. Fingerprint-проверка migration была исправлена, а тест прошёл в последующих CI. Последний проверенный полный CI для `e96025d` ([run 38440675173](https://github.com/Michael-edel/FitFocus/actions/runs/38440675173)) также включал personal-plan acceptance; три unrelated E2E прошли retry, но отмечены flaky. Локальные повторы и ограничения записаны в [журнале](stabilization-progress.md).

Эти сценарии не закрывают весь [P0.5](../TASKS.md): другие AI/family callbacks,
прочие writers и полный lifecycle всё ещё открыты. Результаты и границы:
[статус проекта](project-status.md) и [журнал](stabilization-progress.md).

## Приёмка

- Unit-тесты подтверждают отказ при другом аккаунте, повторном входе,
  отсутствующей capability, неверном response scope/protocol и неактуальном
  login guard.
- Задержанный ответ coach/plan/plateau после logout, account switch, pagehide
  или unmount не меняет UI, profile, outbox, usage или achievements.
- Новая попытка после возврата страницы может завершиться; завершение старой
  попытки не сбрасывает её loading и не очищает её маркеры.
- Повтор допускается только для прежнего действия текущего пользователя и с
  разрешённым лимитом; другая последняя операция блокирует старый ответ.
- Личный план сохраняется одной guarded profile-операцией; отказ транзакции
  не показывает несохранённый план как принятый.
- Coach-карточка записывается с guard; quota/commit failure не даёт
  success-effects. Объяснение плато меняет только актуальный экран.
- Все запросы, включая fallback-модели, используют один session scope.
  Неуспешная подготовка proof не вызывает unscoped POST.
- Browser acceptance проверяет поздний ответ и смену аккаунта для coach,
  объяснения плато и повтора личного плана; mock API результат не выдаётся за
  OAuth или staging-приёмку.

Отдельно закрываются семейные callbacks и остальные AI writers по своим
контрактам. Успех одного действия не закрывает общий P0.5.
