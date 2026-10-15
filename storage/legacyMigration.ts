import { LEGACY_QUEUE_SOURCE_KEY, LEGACY_MIGRATION_META_ID, legacyMigrationItemId,
  legacyDeletedAccountMetaId, legacyFingerprint, legacyFingerprintFields, normalizeLegacyRecord,
  type LegacyInvalidReason, type LegacyMigrationResolution, type NormalizedLegacyQueueRecord } from './legacyQueue';
import { isCurrentLegacyWriterFenceProof, type LegacyWriterFenceProof } from './legacyWriterFence';
import { outboxKeyOwnerId, outboxKeyStateId, writeOutboxInTransaction, type OutboxOperation } from './durableOutbox';
import { StateDatabase, StateStorageError, STATE_STORES, afterIndexedRequests, indexedRequest, stateTransaction, userStateDatabase } from './stateDatabase';

export type MigrationUnknownReason = LegacyInvalidReason | 'invalid-json' | 'invalid-container'
  | 'unknown-owner' | 'ambiguous-owner' | 'ownership-conflict' | 'forbidden-key'
  | 'ambiguous-duplicate' | 'ambiguous-key' | 'fingerprint-collision' | 'missing-imported-operation';

const LEGACY_GENERATION_UNPROVEN = 'legacy-server-generation-unproven';

/** Exact key ownership established by authentication/data provenance, not by the current UI selection. */
export type VerifiedLegacyOwners = ReadonlyMap<string, readonly string[]>;
export type MigrationUnknown = {
  id: string; sourceKey: string; fingerprint: string; rawRecord: unknown; rawRecords: unknown[];
  canonicalEvidence: string; reason: MigrationUnknownReason; detectedAt: string;
  resolved?: { opId: string; accountId: string; atMs: number };
};
export type MigrationItem = {
  id: string; sourceKey: string; fingerprint: string; canonical: string; canonicalVariants: string[];
  rawRecords: unknown[]; rawCanonicals: string[]; state: 'imported' | 'unknown';
  unknownIds: string[]; reason?: MigrationUnknownReason; opId?: string; accountId?: string;
  acknowledgedVersion?: number; acknowledgedAtMs?: number;
  resolution?: LegacyMigrationResolution;
};
export type MigrationProgress = {
  sourceKey: string; snapshotId: string; status: 'importing' | 'partial' | 'completed';
  totalRecords: number; processedRecords: number; importedRecords: number; unresolvedRecords: number;
  pendingSnapshotRecords: number;
  snapshotAuditComplete: boolean;
  sourceMatches: boolean; writersStopped: boolean; sendAllowed: boolean;
};
type StoredProgress = MigrationProgress & { id: string; runId: string };
type Snapshot = { id: string; sourceKey: string; rawSource: string | null; processed: string[] };
type PreparedItem = {
  fingerprint: string; canonical: string; canonicalVariants: string[]; rawRecords: unknown[]; rawCanonicals: string[];
  record?: NormalizedLegacyQueueRecord; accountId?: string; reason?: MigrationUnknownReason;
  deletedAccountMarkerId?: string; evidenceHash: string; unknownNonce: string; opId: string;
};
type PreparedSnapshot = { snapshotId: string; rawSource: string | null; items: PreparedItem[]; total: number };

function validMigrationResolution(value: unknown): value is LegacyMigrationResolution {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.atMs) || (row.atMs as number) < 0
    || !Number.isSafeInteger(row.serverVersion) || (row.serverVersion as number) < 0) return false;
  if (row.kind === 'accept-server') return row.replacementOpId === undefined;
  return row.kind === 'keep-latest-local' && typeof row.replacementOpId === 'string' && row.replacementOpId.length > 0;
}

/** Type tags preserve invalid numeric metadata (including overflow) without collapsing it to null. */
function rawTree(value: unknown): unknown {
  if (value === null) return ['null'];
  if (Array.isArray(value)) return ['array', value.map(rawTree)];
  if (typeof value === 'object') return ['object', Object.keys(value).sort().map((key) => [key, rawTree((value as Record<string, unknown>)[key])])];
  if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
  return [typeof value, value];
}
const rawCanonical = (value: unknown) => JSON.stringify(rawTree(value));
async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function mergeRaw(
  previous: { rawRecords: unknown[]; rawCanonicals: string[] } | undefined,
  incoming: { rawRecords: unknown[]; rawCanonicals: string[] },
): { rawRecords: unknown[]; rawCanonicals: string[] } {
  const groups = new Map<string, { raw: unknown; before: number; after: number }>();
  for (const [side, source] of [['before', previous], ['after', incoming]] as const) {
    source?.rawCanonicals.forEach((canonical, index) => {
      const group = groups.get(canonical) ?? { raw: source.rawRecords[index], before: 0, after: 0 };
      group[side] += 1;
      groups.set(canonical, group);
    });
  }
  const result = { rawRecords: [] as unknown[], rawCanonicals: [] as string[] };
  for (const [canonical, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    for (let count = 0; count < Math.max(group.before, group.after); count += 1) {
      result.rawRecords.push(group.raw); result.rawCanonicals.push(canonical);
    }
  }
  return result;
}

async function prepare(raw: string | null, owners: VerifiedLegacyOwners): Promise<PreparedSnapshot> {
  const ownerSnapshot = new Map([...owners].map(([key, accounts]) => [key, [...accounts]]));
  const deletedAccountMarkerIds = new Map<string, string>();
  for (const accountId of new Set([...ownerSnapshot.values()].flat())) {
    if (typeof accountId === 'string' && accountId.trim()) {
      deletedAccountMarkerIds.set(accountId, await legacyDeletedAccountMetaId(accountId));
    }
  }
  const snapshotId = `legacy-snapshot:v1:${await hash(JSON.stringify([raw]))}`;
  let parsed: unknown;
  let containerReason: MigrationUnknownReason | undefined;
  try { parsed = raw === null ? [] : JSON.parse(raw); } catch { containerReason = 'invalid-json'; }
  if (!containerReason && !Array.isArray(parsed)) containerReason = 'invalid-container';
  const entries: unknown[] = containerReason ? [raw] : parsed as unknown[];
  const groups = new Map<string, PreparedItem>();
  const keyFingerprints = new Map<string, Set<string>>();
  for (const rawRecord of entries) {
    const normalized = normalizeLegacyRecord(rawRecord);
    const canonicalRaw = rawCanonical(rawRecord);
    const record = !containerReason && normalized.ok === true ? normalized.value : undefined;
    const canonical = record ? legacyFingerprintFields(record) : canonicalRaw;
    const fingerprint = record ? await legacyFingerprint(record) : `legacy-${containerReason ? 'container' : 'raw'}:v1:${await hash(canonical)}`;
    let reason = containerReason ?? (normalized.ok === false ? normalized.reason : undefined);
    let accountId: string | undefined;
    let deletedAccountMarkerId: string | undefined;
    if (record) {
      const candidates = [...new Set(ownerSnapshot.get(record.key) ?? [])];
      if (candidates.length === 0) reason = 'unknown-owner';
      else if (candidates.length !== 1) reason = 'ambiguous-owner';
      else {
        accountId = candidates[0];
        if (!accountId || !record.key.startsWith(`fitfocus_data_${accountId}_`)) reason = 'ownership-conflict';
        else if (record.key.endsWith('_all_users') || record.key.endsWith('__ffv')) reason = 'forbidden-key';
        else deletedAccountMarkerId = deletedAccountMarkerIds.get(accountId);
      }
      const fingerprints = keyFingerprints.get(record.key) ?? new Set<string>();
      fingerprints.add(fingerprint); keyFingerprints.set(record.key, fingerprints);
    }
    const prior = groups.get(fingerprint);
    if (prior) {
      prior.rawRecords.push(rawRecord); prior.rawCanonicals.push(canonicalRaw);
      if (!prior.canonicalVariants.includes(canonical)) prior.canonicalVariants.push(canonical);
      prior.reason = prior.canonicalVariants.length > 1 ? 'fingerprint-collision' : 'ambiguous-duplicate';
    } else {
      groups.set(fingerprint, { fingerprint, canonical, canonicalVariants: [canonical], rawRecords: [rawRecord], rawCanonicals: [canonicalRaw],
        record, accountId, reason, deletedAccountMarkerId, evidenceHash: '', unknownNonce: crypto.randomUUID(), opId: crypto.randomUUID() });
    }
  }
  for (const item of groups.values()) {
    if (item.record && (keyFingerprints.get(item.record.key)?.size ?? 0) > 1 && item.reason !== 'fingerprint-collision') item.reason = 'ambiguous-key';
    item.evidenceHash = await hash(JSON.stringify([...item.rawCanonicals].sort()));
  }
  return { snapshotId, rawSource: raw, items: [...groups.values()], total: entries.length };
}

const ownershipReasons = new Set<MigrationUnknownReason>(['unknown-owner', 'ambiguous-owner']);

export class LegacyQueueMigration {
  constructor(
    private readonly source: Pick<Storage, 'getItem'>,
    private readonly connection: StateDatabase = userStateDatabase,
  ) {}

  private readSource(): string | null {
    try { return this.source.getItem(LEGACY_QUEUE_SOURCE_KEY); }
    catch (error) { throw new StateStorageError('unavailable', error); }
  }

  async progress(): Promise<MigrationProgress | null> {
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.meta], 'readonly', async (tx) => {
      const progress = await indexedRequest(tx.objectStore(STATE_STORES.meta).get(LEGACY_MIGRATION_META_ID)) as StoredProgress | undefined;
      if (!progress) return null;
      const { id: _id, runId: _runId, ...publicProgress } = progress;
      return publicProgress;
    });
  }

  async unknown(): Promise<MigrationUnknown[]> {
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.migrationUnknown], 'readonly', async (tx) =>
      (await indexedRequest(tx.objectStore(STATE_STORES.migrationUnknown).getAll()) as MigrationUnknown[])
        .filter((entry) => entry.sourceKey === LEGACY_QUEUE_SOURCE_KEY));
  }

  /** A fresh all-client proof is checked after import and immediately before the final audit. */
  async migrate(options: { verifiedOwners: VerifiedLegacyOwners; verifyWritersStopped?: () => Promise<LegacyWriterFenceProof | null>; batchSize?: number }): Promise<MigrationProgress> {
    const batchSize = options.batchSize ?? 100;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error('LEGACY_INVALID_BATCH_SIZE');
    const verifiedOwners = new Map([...options.verifiedOwners].map(([key, accounts]) => [key, [...accounts]]));
    const database = await this.connection.open();
    // Close a previous gate before reading/hashing: source access can fail, too.
    const previousSnapshots = await stateTransaction(database, [STATE_STORES.meta], 'readwrite', (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const currentRequest = store.get(LEGACY_MIGRATION_META_ID);
      const snapshotsRequest = store.getAll();
      return afterIndexedRequests(tx, [
        currentRequest as unknown as IDBRequest<unknown>,
        snapshotsRequest as unknown as IDBRequest<unknown>,
      ], ([currentValue, snapshotsValue]) => {
        const current = currentValue as StoredProgress | undefined;
        if (current) store.put({ ...current, sendAllowed: false, sourceMatches: false, snapshotAuditComplete: false,
          status: current.status === 'importing' ? 'importing' : 'partial' } satisfies StoredProgress);
        return (snapshotsValue as Snapshot[]).filter((row) => row.id.startsWith('legacy-snapshot:v1:')
          && row.sourceKey === LEGACY_QUEUE_SOURCE_KEY && (row.rawSource === null || typeof row.rawSource === 'string') && Array.isArray(row.processed));
      });
    });
    const raw = this.readSource();
    // No hash or other arbitrary asynchronous work runs inside an import transaction.
    const prepared = await prepare(raw, verifiedOwners);
    const history = await Promise.all(previousSnapshots.filter((snapshot) => snapshot.id !== prepared.snapshotId).map(async (snapshot) => {
      const entry = await prepare(snapshot.rawSource, verifiedOwners);
      if (entry.snapshotId !== snapshot.id) throw new StateStorageError('transaction', new Error('LEGACY_SNAPSHOT_COLLISION'));
      return entry;
    }));
    // Source changes never discard unfinished records from an earlier durable snapshot.
    const inventory = [prepared, ...history];
    const work = inventory.flatMap((snapshot) => snapshot.items.map((item) => ({ snapshot, item })));
    const historicalPending = history.reduce((sum, entry) => {
      const processed = new Set(previousSnapshots.find((snapshot) => snapshot.id === entry.snapshotId)?.processed ?? []);
      return sum + entry.items.reduce((count, item) => count + (processed.has(item.fingerprint) ? 0 : item.rawRecords.length), 0);
    }, 0);
    let runId: string = crypto.randomUUID();
    let progress: StoredProgress = {
      id: LEGACY_MIGRATION_META_ID, runId, sourceKey: LEGACY_QUEUE_SOURCE_KEY, snapshotId: prepared.snapshotId,
      status: 'importing', totalRecords: prepared.total, processedRecords: 0, importedRecords: 0, unresolvedRecords: 0, pendingSnapshotRecords: historicalPending,
      sourceMatches: false, writersStopped: false, sendAllowed: false, snapshotAuditComplete: false,
    };
    await stateTransaction(database, [STATE_STORES.meta], 'readwrite', (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const snapshotRequest = store.get(prepared.snapshotId);
      const currentRequest = store.get(LEGACY_MIGRATION_META_ID);
      return afterIndexedRequests(tx, [
        snapshotRequest as unknown as IDBRequest<unknown>,
        currentRequest as unknown as IDBRequest<unknown>,
      ], ([snapshotValue, currentValue]) => {
        const snapshot = snapshotValue as Snapshot | undefined;
        const current = currentValue as StoredProgress | undefined;
        // A snapshot hash is only an index: retain the original bytes and reject a collision.
        if (snapshot && snapshot.rawSource !== raw) throw new Error('LEGACY_SNAPSHOT_COLLISION');
        if (!snapshot) store.add({ id: prepared.snapshotId, sourceKey: LEGACY_QUEUE_SOURCE_KEY, rawSource: raw, processed: [] } satisfies Snapshot);
        if (current?.status === 'importing' && current.snapshotId === prepared.snapshotId) {
          // Concurrent tabs may join the same immutable snapshot. Ledger transactions deduplicate their work.
          runId = current.runId;
          // Joining/restarting does not inherit a potentially stale writer fence from disk.
          progress = { ...current, writersStopped: false, sendAllowed: false, snapshotAuditComplete: false };
        }
        store.put(progress);
      });
    });
    for (let offset = 0; offset < work.length; offset += batchSize) {
      const batch = work.slice(offset, offset + batchSize);
      progress = await stateTransaction(database, Object.values(STATE_STORES), 'readwrite', (tx) => {
        const meta = tx.objectStore(STATE_STORES.meta);
        const snapshotIds = [...new Set(inventory.map((entry) => entry.snapshotId))];
        const currentRequest = meta.get(LEGACY_MIGRATION_META_ID);
        const snapshotRequests = snapshotIds.map((id) => meta.get(id));
        return afterIndexedRequests(tx, [
          currentRequest as unknown as IDBRequest<unknown>,
          ...snapshotRequests as unknown as IDBRequest<unknown>[],
        ], (results) => {
          const current = results[0] as StoredProgress | undefined;
          if (!current || current.runId !== runId) throw new Error('LEGACY_MIGRATION_SUPERSEDED');
          const snapshots = new Map<string, Snapshot>();
          snapshotIds.forEach((id, index) => {
            const snapshot = results[index + 1] as Snapshot | undefined;
            const entry = inventory.find((candidate) => candidate.snapshotId === id);
            if (!snapshot || !entry || snapshot.rawSource !== entry.rawSource) throw new Error('LEGACY_SNAPSHOT_COLLISION');
            snapshots.set(id, snapshot);
          });
          const changedSnapshotIds = new Set(batch.map(({ snapshot }) => snapshot.snapshotId));
          const persistBatch = (): StoredProgress => {
            for (const id of changedSnapshotIds) meta.put(snapshots.get(id)!);
            let processedRecords = 0;
            let pendingSnapshotRecords = 0;
            for (const entry of inventory) {
              const processed = new Set(snapshots.get(entry.snapshotId)!.processed);
              const count = entry.items.reduce((sum, item) => sum + (processed.has(item.fingerprint) ? item.rawRecords.length : 0), 0);
              if (entry.snapshotId === prepared.snapshotId) processedRecords = count;
              else pendingSnapshotRecords += entry.total - count;
            }
            const next: StoredProgress = { ...current, status: 'importing', sendAllowed: false,
              processedRecords, pendingSnapshotRecords };
            meta.put(next);
            return next;
          };
          const processItem = (index: number): Promise<StoredProgress> => {
            if (index >= batch.length) return Promise.resolve(persistBatch());
            const { snapshot: entry, item } = batch[index];
            const snapshot = snapshots.get(entry.snapshotId)!;
            return this.importItem(tx, item, false, () => {
              if (!snapshot.processed.includes(item.fingerprint)) snapshot.processed.push(item.fingerprint);
              return processItem(index + 1);
            });
          };
          return processItem(0);
        });
      });
    }
    let writerFence: LegacyWriterFenceProof | null = null;
    try { writerFence = await options.verifyWritersStopped?.() ?? null; } catch { /* Missing proof keeps sending closed. */ }
    const writersStopped = isCurrentLegacyWriterFenceProof(writerFence);
    return stateTransaction(database, Object.values(STATE_STORES), 'readwrite', (tx) => {
      const meta = tx.objectStore(STATE_STORES.meta);
      const snapshotIds = [...new Set(inventory.map((entry) => entry.snapshotId))];
      const currentRequest = meta.get(LEGACY_MIGRATION_META_ID);
      const snapshotRequests = snapshotIds.map((id) => meta.get(id));
      return afterIndexedRequests(tx, [
        currentRequest as unknown as IDBRequest<unknown>,
        ...snapshotRequests as unknown as IDBRequest<unknown>[],
      ], (results) => {
        const current = results[0] as StoredProgress | undefined;
        if (!current || current.runId !== runId) throw new Error('LEGACY_MIGRATION_SUPERSEDED');
        const snapshots = new Map<string, Snapshot>();
        snapshotIds.forEach((id, index) => {
          const snapshot = results[index + 1] as Snapshot | undefined;
          const entry = inventory.find((candidate) => candidate.snapshotId === id);
          if (!snapshot || !entry || snapshot.rawSource !== entry.rawSource) throw new Error('LEGACY_SNAPSHOT_COLLISION');
          snapshots.set(id, snapshot);
        });
        let processedRecords = 0;
        let pendingSnapshotRecords = 0;
        for (const entry of inventory) {
          const processed = new Set(snapshots.get(entry.snapshotId)!.processed);
          const count = entry.items.reduce((sum, item) => sum + (processed.has(item.fingerprint) ? item.rawRecords.length : 0), 0);
          if (entry.snapshotId === prepared.snapshotId) processedRecords += count;
          else pendingSnapshotRecords += entry.total - count;
        }
        const auditItem = (index: number): Promise<MigrationProgress> => {
          if (index >= work.length) {
            const allMetaRequest = meta.getAll();
            const ledgerRequest = tx.objectStore(STATE_STORES.migrationItems).getAll();
            const unknownRequest = tx.objectStore(STATE_STORES.migrationUnknown).getAll();
            const outboxRequest = tx.objectStore(STATE_STORES.outbox).getAll();
            return afterIndexedRequests(tx, [
              allMetaRequest as unknown as IDBRequest<unknown>,
              ledgerRequest as unknown as IDBRequest<unknown>,
              unknownRequest as unknown as IDBRequest<unknown>,
              outboxRequest as unknown as IDBRequest<unknown>,
            ], ([metaValue, ledgerValue, unknownValue, outboxValue]) => {
              const allMeta = metaValue as Snapshot[];
              const ledgers = ledgerValue as MigrationItem[];
              const unknown = (unknownValue as MigrationUnknown[])
                .filter((entry) => entry.sourceKey === LEGACY_QUEUE_SOURCE_KEY && !entry.resolved);
              const unresolvedLegacyOperations = (outboxValue as OutboxOperation[])
                .filter((operation) => operation.migrationSourceKey === LEGACY_QUEUE_SOURCE_KEY).length;
              let imported = 0;
              for (const item of prepared.items) {
                const ledger = ledgers.find((entry) => entry.id === legacyMigrationItemId(item.fingerprint));
                if (ledger?.state === 'imported') imported += item.rawRecords.length;
              }
              const auditedIds = new Set(inventory.map((entry) => entry.snapshotId));
              const unauditedSnapshot = allMeta.some((row) => row.id.startsWith('legacy-snapshot:v1:')
                && row.sourceKey === LEGACY_QUEUE_SOURCE_KEY && !auditedIds.has(row.id));
              // This synchronous source check complements the externally established writer fence.
              const sourceMatches = this.readSource() === raw;
              const sendAllowed = writersStopped && sourceMatches && processedRecords === prepared.total
                && pendingSnapshotRecords === 0 && !unauditedSnapshot;
              const unresolvedRecords = unknown.length + unresolvedLegacyOperations;
              const final: StoredProgress = { ...current, writersStopped,
                status: sendAllowed && unresolvedRecords === 0 ? 'completed' : 'partial',
                processedRecords, pendingSnapshotRecords, snapshotAuditComplete: !unauditedSnapshot,
                importedRecords: imported, unresolvedRecords, sourceMatches, sendAllowed };
              meta.put(final);
              const { id: _id, runId: _runId, ...publicProgress } = final;
              return publicProgress;
            });
          }
          return this.importItem(tx, work[index].item, true, () => auditItem(index + 1));
        };
        return auditItem(0);
      });
    });
  }

  private importItem<T = void>(
    tx: IDBTransaction,
    item: PreparedItem,
    verifyOnly = false,
    onDone: () => T = (() => undefined as T),
  ): Promise<Awaited<T>> {
    const meta = tx.objectStore(STATE_STORES.meta);
    const initialRequests: IDBRequest<unknown>[] = [];
    const initialIndices: Record<string, number> = Object.create(null) as Record<string, number>;
    const queueInitial = <V>(name: string, request: IDBRequest<V>): void => {
      initialIndices[name] = initialRequests.length;
      initialRequests.push(request as unknown as IDBRequest<unknown>);
    };
    if (item.deletedAccountMarkerId) queueInitial('deletedAccountMarker', meta.get(item.deletedAccountMarkerId));
    const migrationStore = tx.objectStore(STATE_STORES.migrationItems);
    queueInitial('prior', migrationStore.get(legacyMigrationItemId(item.fingerprint)));

    return afterIndexedRequests(tx, initialRequests, (initialValues) => {
      const deletedMarker = initialIndices.deletedAccountMarker === undefined ? undefined
        : initialValues[initialIndices.deletedAccountMarker] as { kind?: unknown; version?: unknown } | undefined;
      if (deletedMarker?.kind === 'legacy-deleted-account' && deletedMarker.version === 1) return onDone();

      const prior = initialValues[initialIndices.prior] as MigrationItem | undefined;
      const requests: IDBRequest<unknown>[] = [];
      const indices: Record<string, number> = Object.create(null) as Record<string, number>;
      const queue = <V>(name: string, request: IDBRequest<V>): void => {
        indices[name] = requests.length;
        requests.push(request as unknown as IDBRequest<unknown>);
      };
      const outbox = tx.objectStore(STATE_STORES.outbox);
      const values = tx.objectStore(STATE_STORES.values);
      const unknownStore = tx.objectStore(STATE_STORES.migrationUnknown);
      if (prior?.opId) queue('operation', outbox.get(prior.opId));
      if (item.record) {
        queue('owner', meta.get(outboxKeyOwnerId(item.record.key)));
        queue('value', values.get(item.record.key));
        if (item.accountId) queue('keyState', meta.get(outboxKeyStateId(item.accountId, item.record.key)));
      }
      for (const [index, unknownId] of (prior?.unknownIds ?? []).entries()) queue(`priorUnknown:${index}`, unknownStore.get(unknownId));

      return afterIndexedRequests(tx, requests, (readValues) => {
        const read = <V>(name: string): V | undefined => {
          const index = indices[name];
          return index === undefined ? undefined : readValues[index] as V | undefined;
        };
        let reason = item.reason;
        let accountId = item.accountId;
        if (prior?.state === 'unknown' && prior.reason && !ownershipReasons.has(prior.reason)) reason = prior.reason;
        if (prior?.state === 'imported' && reason === 'unknown-owner') { accountId = prior.accountId; reason = undefined; }
        if (prior?.accountId && accountId && prior.accountId !== accountId) reason = 'ownership-conflict';
        const raw = mergeRaw(prior, item);
        const ledger: MigrationItem = {
          ...prior, id: legacyMigrationItemId(item.fingerprint), sourceKey: LEGACY_QUEUE_SOURCE_KEY,
          fingerprint: item.fingerprint, canonical: prior?.canonical ?? item.canonical,
          canonicalVariants: [...new Set([...(prior?.canonicalVariants ?? []), ...item.canonicalVariants])].sort(),
          ...raw, state: prior?.state ?? 'unknown', unknownIds: prior?.unknownIds ?? [],
        };
        // A collision must not be hidden by a previous, less specific quarantine reason.
        if (ledger.canonicalVariants.length > 1 || (prior && prior.canonical !== item.canonical)) reason = 'fingerprint-collision';
        let operation = read<OutboxOperation>('operation');
        const record = item.record;
        const validBinding = prior && prior.sourceKey === LEGACY_QUEUE_SOURCE_KEY && prior.fingerprint === item.fingerprint
          && prior.canonical === item.canonical && typeof prior.opId === 'string' && prior.opId.length > 0
          && typeof prior.accountId === 'string' && prior.accountId.length > 0;
        const acknowledged = !!(validBinding && record && Number.isSafeInteger(prior.acknowledgedVersion)
          && prior.acknowledgedVersion! > record.baseVersion && Number.isSafeInteger(prior.acknowledgedAtMs) && prior.acknowledgedAtMs! >= 0);
        const resolved = !!(validBinding && record && validMigrationResolution(prior.resolution));
        if (resolved && operation) reason = 'missing-imported-operation';
        if (!reason && prior && (prior.state === 'imported' || prior.opId)) {
          const matches = operation && record && operation.accountId === prior.accountId && operation.opId === prior.opId
            && operation.migrationSourceKey === LEGACY_QUEUE_SOURCE_KEY && operation.migrationCanonical === item.canonical
            && operation.migrationFingerprint === item.fingerprint && operation.writerId === `legacy:${item.fingerprint}`
            && operation.key === record.key && operation.type === record.type
            && (operation.baseVersion === record.baseVersion
              || operation.status === 'conflicted' && operation.reason === LEGACY_GENERATION_UNPROVEN && operation.baseVersion === 0)
            && (record.type === 'put' ? operation.type === 'put' && operation.value === record.value : !('value' in operation));
          if (!validBinding || (!operation && !acknowledged && !resolved) || (operation && (!matches
            || prior.acknowledgedVersion !== undefined || prior.acknowledgedAtMs !== undefined || prior.resolution !== undefined))) {
            reason = 'missing-imported-operation';
          }
        }
        // The completion audit can quarantine missing evidence, but must never recreate an operation.
        if (!reason && verifyOnly && (!prior || (!operation && !acknowledged && !resolved))) reason = 'missing-imported-operation';
        if (!reason && accountId && record) {
          const owner = read<{ accountId: string }>('owner');
          const value = read<{ accountId?: string }>('value');
          if (!record.key.startsWith(`fitfocus_data_${accountId}_`)
            || (owner && owner.accountId !== accountId) || (value?.accountId && value.accountId !== accountId)) reason = 'ownership-conflict';
          else if (record.key.endsWith('_all_users') || record.key.endsWith('__ffv')) reason = 'forbidden-key';
        }
        if (!reason && (!accountId || !record)) reason = 'unknown-owner';

        const commitImported = (created?: OutboxOperation): T => {
          if (created) { operation = created; ledger.opId = created.opId; }
          if (operation && record && accountId && !acknowledged) {
            // An old baseVersion does not prove that it names the current server generation.
            // Keep the intent durable, but never let that number make the legacy operation sendable.
            const normalizeGeneration = !!created || operation.status !== 'conflicted'
              || operation.reason !== LEGACY_GENERATION_UNPROVEN || operation.baseVersion !== 0 || !!operation.attempt;
            if (normalizeGeneration) {
              const blocked: OutboxOperation = { ...operation, baseVersion: 0, status: 'conflicted',
                reason: LEGACY_GENERATION_UNPROVEN, updatedAtMs: Date.now() };
              delete blocked.attempt;
              outbox.put(blocked);
              operation = blocked;
            }
            if (normalizeGeneration) {
              const keyState = read<{ id: string; accountId: string; key: string; lastRevision: number; valueRevision: number; confirmedVersion: number; headOpId?: string }>('keyState');
              if (keyState) {
                const reset = { ...keyState, confirmedVersion: 0 };
                if (reset.headOpId === operation.opId) delete reset.headOpId;
                meta.put(reset);
              }
            }
          }
          ledger.accountId = accountId;
          for (const [index, unknownId] of ledger.unknownIds.entries()) {
            const unknown = read<MigrationUnknown>(`priorUnknown:${index}`);
            if (unknown && unknown.sourceKey === LEGACY_QUEUE_SOURCE_KEY && unknown.fingerprint === item.fingerprint) {
              unknownStore.put({ ...unknown, resolved: { opId: ledger.opId!, accountId: accountId!, atMs: Date.now() } });
            }
          }
          ledger.state = 'imported'; delete ledger.reason;
          migrationStore.put(ledger);
          return onDone();
        };

        if (reason) {
          if (operation) {
            const conflicted: OutboxOperation = { ...operation, status: 'conflicted', reason };
            delete conflicted.attempt;
            outbox.put(conflicted);
          }
          const evidence = JSON.stringify(raw.rawCanonicals);
          const baseId = `legacy-unknown:${item.fingerprint}:${item.evidenceHash}`;
          const matchesEvidence = (row: MigrationUnknown) => row.sourceKey === LEGACY_QUEUE_SOURCE_KEY
            && row.fingerprint === item.fingerprint && row.canonicalEvidence === evidence;
          const commitUnknown = (unknownId: string, existing?: MigrationUnknown): T => {
            const unknown: MigrationUnknown = { id: unknownId, sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: item.fingerprint,
              rawRecord: raw.rawRecords[0], rawRecords: raw.rawRecords, canonicalEvidence: evidence, reason: reason!,
              detectedAt: existing?.detectedAt ?? new Date().toISOString() };
            unknownStore.put(unknown);
            ledger.state = 'unknown'; ledger.reason = reason;
            ledger.unknownIds = [...new Set([...ledger.unknownIds, unknownId])];
            migrationStore.put(ledger);
            return onDone();
          };
          for (const [index, unknownId] of ledger.unknownIds.entries()) {
            const existing = read<MigrationUnknown>(`priorUnknown:${index}`);
            if (existing && matchesEvidence(existing)) return commitUnknown(unknownId, existing);
          }
          const findUnknownId = (unknownId: string, suffix: number): Promise<Awaited<T>> =>
            afterIndexedRequests(tx, [unknownStore.get(unknownId) as unknown as IDBRequest<unknown>], ([value]) => {
              const existing = value as MigrationUnknown | undefined;
              if (!existing || matchesEvidence(existing)) return commitUnknown(unknownId, existing);
              return findUnknownId(`${baseId}:${item.unknownNonce}:${suffix}`, suffix + 1);
            });
          return findUnknownId(baseId, 0);
        }

        if (!operation && !acknowledged && !resolved) {
          const legacyRecord = record!;
          const nowMs = Date.now();
          let nextResult!: T;
          const write = writeOutboxInTransaction(tx, {
            accountId: accountId!, writerId: `legacy:${item.fingerprint}`, baseVersion: 0,
            intent: legacyRecord.type === 'put'
              ? { type: 'put', key: legacyRecord.key, value: legacyRecord.value }
              : { type: 'delete', key: legacyRecord.key },
          }, {
            opId: item.opId, nowMs,
            conflictReason: LEGACY_GENERATION_UNPROVEN,
            legacy: { sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: item.fingerprint,
              canonical: item.canonical, retryCount: legacyRecord.retryCount },
            preserveLegacyValueOnConflict: true,
            onOperationCreated: (created) => { nextResult = commitImported(created); },
          });
          return write.then(() => nextResult);
        }
        return commitImported();
      });
    });
  }
}
