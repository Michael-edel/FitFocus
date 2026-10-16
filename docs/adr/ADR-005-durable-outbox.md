# ADR-005: одна постоянная outbox в IndexedDB

Дата: 09.10.2026. Статус: **согласовано, реализация ожидается**.
Задача: [P0.8](../../TASKS.md). Область кода: [карта документации](../README.md).

## Причина

Текущая Map + localStorage-очередь теряет изменения при конкуренции вкладок,
не связывает данные и операцию одной транзакцией и не хранит явного владельца.
Наличие Web Locks в браузере не должно менять формат или источник очереди.

## Решение

Расширить существующую IDB `fitfocus-user-state-v1`, сохранив `values`,
добавив `outbox`, `outbox_migration_items`, `outbox_migration_unknown`
и метаданные прогресса миграции. Конкретный новый номер схемы фиксируется
в реализации после сверки существующих версий.

IDB — единственное авторитетное хранилище новой очереди. Web Locks могут
сокращать конкуренцию отправителей; без них корректность обеспечивают IDB
claim/lease-транзакции. BroadcastChannel может уведомлять новые вкладки,
но не переносит очередь и не обновляет код старой вкладки.

Для данных в `values` изменение и outbox-операция сохраняются одной
readwrite-транзакцией; успех сообщается после `oncomplete`. Для profile
и иных данных вне этого store требуется явная интеграция, а не обещание
общей атомарности поверх localStorage и отдельного IDB commit.

## Запись и отправка

Новая операция содержит opId, accountId, ключ, тип, payload, baseVersion,
локальную ревизию, статус и metadata повтора/конфликта. Состояние попытки
содержит attemptId, sessionEpoch, owner и числовой startedAtMs.

1. Claim и переход pending → sending коммитятся атомарно в IDB.
2. После commit начинается HTTP; сеть не удерживается внутри транзакции.
3. Завершение проверяет актуальные opId/accountId/ревизию/attemptId/сессию
   и меняет операцию и применимую версию одной транзакцией.
4. Lease вычисляется по startedAtMs, а не строковому detectedAt/updatedAt.
   Повторный claim просроченной попытки атомарен; ответ старой игнорируется.

Постоянный accountId не меняется при новом входе. sessionEpoch относится
к попытке и защищает поздний ответ; новая подтверждённая сессия того же
аккаунта может возобновить его очередь. Правила конфликтов и причинного
порядка описаны в [sync-model](../sync-model.md).

## Источники legacy

`fitfocus.remote-kv-outbox.v1` остаётся источником импорта, а не местом записи
новой очереди. `fitfocus_outbox_ops` из другого scaffold инвентаризируется
отдельно; этот ADR не объявляет его тем же форматом и не разрешает удаление.

Legacy не имеет надёжного accountId. Владельца устанавливают только по
проверяемой принадлежности ключа/данных. Активный аккаунт не доказательство;
глобальные/неоднозначные ключи не отправляются автоматически.

## Согласованный нормализатор

Это спецификация реализации, ещё не добавленная в исполняемый код.

```typescript
type LegacyQueueRecord = {
  type: "put" | "delete";
  key: string;
  value?: string;
  baseVersion?: number;
  retryCount?: number;
};

type LegacyInvalidReason =
  | "not-an-object"
  | "invalid-type"
  | "invalid-key"
  | "put-without-value"
  | "delete-with-value"
  | "invalid-baseVersion"
  | "invalid-retryCount";

function normalizeLegacyRecord(
  record: unknown,
): { ok: true; value: LegacyQueueRecord }
  | { ok: false; reason: LegacyInvalidReason } {
  if (typeof record !== "object" || record === null) {
    return { ok: false, reason: "not-an-object" };
  }
  const r = record as Record<string, unknown>;
  const type = r.type;
  if (type !== "put" && type !== "delete") {
    return { ok: false, reason: "invalid-type" };
  }
  const key = r.key;
  if (typeof key !== "string" || key.length === 0) {
    return { ok: false, reason: "invalid-key" };
  }
  if (type === "put" && typeof r.value !== "string") {
    return { ok: false, reason: "put-without-value" };
  }
  if (type === "delete" && "value" in r) {
    return { ok: false, reason: "delete-with-value" };
  }
  let baseVersion = 0;
  if ("baseVersion" in r) {
    const bv = r.baseVersion;
    if (typeof bv !== "number" || !Number.isInteger(bv) || bv < 0) {
      return { ok: false, reason: "invalid-baseVersion" };
    }
    baseVersion = bv;
  }
  let retryCount = 0;
  if ("retryCount" in r) {
    const rc = r.retryCount;
    if (typeof rc !== "number" || !Number.isInteger(rc) || rc < 0) {
      return { ok: false, reason: "invalid-retryCount" };
    }
    retryCount = rc;
  }
  const normalized: LegacyQueueRecord = {
    type, key, baseVersion, retryCount,
  };
  if (type === "put") normalized.value = r.value as string;
  return { ok: true, value: normalized };
}

type UnknownLegacyRecord = {
  fingerprint: string;
  rawRecord: unknown;
  reason: LegacyInvalidReason;
  detectedAt: string;
};
```

Отсутствующие baseVersion/retryCount → 0. Присутствующие undefined, строки,
дробные/отрицательные числа, NaN/Infinity отклоняются. Пустой key запрещён;
пустая строка value для put допустима. Delete не содержит свойства value,
даже со значением undefined. Причины невозможного владения, ошибки чтения
контейнера и неоднозначного fingerprint учитываются миграцией отдельно;
они не подменяются кодом повреждения LegacyQueueRecord.

## Fingerprint

Для корректной записи используются нормализованные поля:

```typescript
const fields: [string, string, string | null, number] = [
  record.type,
  record.key,
  record.type === "put" ? record.value! : null,
  record.baseVersion ?? 0,
];
const fingerprint = stableHash(JSON.stringify(fields));
```

stableHash — обозначение детерминированного хеша; реализацию нужно выбрать
и проверить. Никаких разделителей строк вместо JSON-сериализации массива.
Индекс и retryCount не входят в fingerprint. Отсутствующая baseVersion и 0
дают одинаковый результат; перестановка контейнера не создаёт новый импорт.

Для повреждённой записи используется отдельно определённый стабильный
идентификатор raw-представления. Нельзя сначала «починить» её полями
по умолчанию и затем отправить как нормальную. При совпадении хеша
сравниваются канонические поля: коллизия/неоднозначная повторная операция
не даёт права отбросить rawRecord. Правило для нескольких одинаковых
legacy-записей и разного retryCount закрепляется тестами реализации.

## Атомарный возобновляемый импорт

Снимок legacy-контейнера читается и разбирается без изменения источника.
Идентификация, нормализация и хеширование порции выполняются до транзакции;
не держать IDB-транзакцию открытой во время произвольного async hash/HTTP.
Повреждённый JSON/контейнер сохраняется для диагностики, не превращается
в пустую «успешно импортированную» очередь.

В одной readwrite-транзакции порции:

- проверить migration_items на уже обработанную запись и неоднозначность;
- сохранить импортированную операцию либо rawRecord с причиной в карантине;
- записать migration item и прогресс этой порции.

Abort откатывает всё перечисленное. Следующий запуск повторяет порцию,
не получая отметку «импортировано» без операции или наоборот.
Для больших очередей порции коммитятся отдельно; итоговый статус записывается
после проверки всех порций. Неизвестные, повреждённые, неоднозначные или
необработанные записи означают `partial`, а не `completed`.

Legacy-ключ сохраняется до подтверждённого импорта. Его удаление — отдельная
будущая операция после проверки остатка и старых клиентов. Нельзя менять
имя источника, чтобы скрыть pending-записи.

## Старые вкладки и upgrade

Новый код закрывает соединение на `versionchange`, явно показывает `blocked`
и корректно возобновляет открытие. Старая сборка сейчас не содержит нужного
обработчика: новое уведомление не может добавить ей этот код.

Проверка использует настоящий старый и новый bundle на одном origin
и в одном browser context. До завершения upgrade и проверки источника
старые writers нужно остановить: закрытием/обновлением старых вкладок либо
предварительным совместимым релизом. Старый writer не должен дописать
legacy после финального marker. Два разных preview-origin этого не проверяют.

## Отказ и приёмка

Если IDB недоступна/переполнена или транзакция прервалась, показать явное
«не сохранено», предложить повтор/экспорт доступных данных. Не создавать
вторую авторитетную localStorage-outbox и не сообщать об успешной записи.

Проверить нормализатор по всем reason, отсутствие value у delete, стабильность
fingerprint, abort/restart порции, unknown ownership, коллизии/дубликаты,
несколько вкладок без Web Locks, late response, lease recovery и реальный
upgrade старой сборки. Полная [матрица](../sync-model.md#матрица-приёмки).
