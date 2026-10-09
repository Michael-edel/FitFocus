import { LEGACY_QUEUE_SOURCE_KEY, LEGACY_MIGRATION_META_ID, legacyMigrationItemId,
  legacyFingerprint, legacyFingerprintFields, normalizeLegacyRecord,
  type LegacyInvalidReason, type NormalizedLegacyQueueRecord } from './legacyQueue';
import { outboxKeyOwnerId, writeOutboxInTransaction, type OutboxOperation } from './durableOutbox';
import { StateDatabase, StateStorageError, STATE_STORES, indexedRequest, stateTransaction, userStateDatabase } from './stateDatabase';

export type MigrationUnknownReason = LegacyInvalidReason | 'invalid-json' | 'invalid-container'
  | 'unknown-owner' | 'ambiguous-owner' | 'ownership-conflict' | 'forbidden-key'
  | 'ambiguous-duplicate' | 'ambiguous-key' | 'fingerprint-collision' | 'missing-imported-operation';

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
  evidenceHash: string; unknownNonce: string; opId: string;
};
type PreparedSnapshot = { snapshotId: string; rawSource: string | null; items: PreparedItem[]; total: number };

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
    if (record) {
      const candidates = [...new Set(ownerSnapshot.get(record.key) ?? [])];
      if (candidates.length === 0) reason = 'unknown-owner';
      else if (candidates.length !== 1) reason = 'ambiguous-owner';
      else {
        accountId = candidates[0];
        if (!accountId || !record.key.startsWith(`fitfocus_data_${accountId}_`)) reason = 'ownership-conflict';
        else if (record.key.endsWith('_all_users') || record.key.endsWith('__ffv')) reason = 'forbidden-key';
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
        record, accountId, reason, evidenceHash: '', unknownNonce: crypto.randomUUID(), opId: crypto.randomUUID() });
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

  /** writersStopped is a verified integration precondition; omission never authorizes sending. */
  async migrate(options: { verifiedOwners: VerifiedLegacyOwners; writersStopped?: boolean; batchSize?: number }): Promise<MigrationProgress> {
    const batchSize = options.batchSize ?? 100;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error('LEGACY_INVALID_BATCH_SIZE');
    const verifiedOwners = new Map([...options.verifiedOwners].map(([key, accounts]) => [key, [...accounts]]));
    const writersStopped = options.writersStopped === true;
    const database = await this.connection.open();
    // Close a previous gate before reading/hashing: source access can fail, too.
    const previousSnapshots = await stateTransaction(database, [STATE_STORES.meta], 'readwrite', async (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const current = await indexedRequest(store.get(LEGACY_MIGRATION_META_ID)) as StoredProgress | undefined;
      if (current) store.put({ ...current, sendAllowed: false, sourceMatches: false, snapshotAuditComplete: false,
        status: current.status === 'importing' ? 'importing' : 'partial' } satisfies StoredProgress);
      return (await indexedRequest(store.getAll()) as Snapshot[]).filter((row) => row.id.startsWith('legacy-snapshot:v1:')
        && row.sourceKey === LEGACY_QUEUE_SOURCE_KEY && (row.rawSource === null || typeof row.rawSource === 'string') && Array.isArray(row.processed));
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
      sourceMatches: false, writersStopped, sendAllowed: false, snapshotAuditComplete: false,
    };
    await stateTransaction(database, [STATE_STORES.meta], 'readwrite', async (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const snapshot = await indexedRequest(store.get(prepared.snapshotId)) as Snapshot | undefined;
      // A snapshot hash is only an index: retain the original bytes and reject a collision.
      if (snapshot && snapshot.rawSource !== raw) throw new Error('LEGACY_SNAPSHOT_COLLISION');
      if (!snapshot) store.add({ id: prepared.snapshotId, sourceKey: LEGACY_QUEUE_SOURCE_KEY, rawSource: raw, processed: [] } satisfies Snapshot);
      const current = await indexedRequest(store.get(LEGACY_MIGRATION_META_ID)) as StoredProgress | undefined;
      if (current?.status === 'importing' && current.snapshotId === prepared.snapshotId) {
        // Concurrent tabs may join the same immutable snapshot. Ledger transactions deduplicate their work.
        runId = current.runId;
        // Joining/restarting does not inherit a potentially stale writer fence from disk.
        progress = { ...current, writersStopped, sendAllowed: false, snapshotAuditComplete: false };
      }
      store.put(progress);
    });
    for (let offset = 0; offset < work.length; offset += batchSize) {
      const batch = work.slice(offset, offset + batchSize);
      progress = await stateTransaction(database, Object.values(STATE_STORES), 'readwrite', async (tx) => {
        const meta = tx.objectStore(STATE_STORES.meta);
        const current = await indexedRequest(meta.get(LEGACY_MIGRATION_META_ID)) as StoredProgress;
        if (current.runId !== runId) throw new Error('LEGACY_MIGRATION_SUPERSEDED');
        const snapshots = new Map<string, Snapshot>();
        for (const { snapshot: entry, item } of batch) {
          let snapshot = snapshots.get(entry.snapshotId);
          if (!snapshot) {
            snapshot = await indexedRequest(meta.get(entry.snapshotId)) as Snapshot | undefined;
            if (!snapshot || snapshot.rawSource !== entry.rawSource) throw new Error('LEGACY_SNAPSHOT_COLLISION');
            snapshots.set(entry.snapshotId, snapshot);
          }
          await this.importItem(tx, item);
          if (!snapshot.processed.includes(item.fingerprint)) snapshot.processed.push(item.fingerprint);
        }
        for (const snapshot of snapshots.values()) meta.put(snapshot);
        let processedRecords = 0;
        let pendingSnapshotRecords = 0;
        for (const entry of inventory) {
          const snapshot = snapshots.get(entry.snapshotId) ?? await indexedRequest(meta.get(entry.snapshotId)) as Snapshot;
          const processed = new Set(snapshot.processed);
          const count = entry.items.reduce((sum, item) => sum + (processed.has(item.fingerprint) ? item.rawRecords.length : 0), 0);
          if (entry.snapshotId === prepared.snapshotId) processedRecords = count;
          else pendingSnapshotRecords += entry.total - count;
        }
        const next: StoredProgress = { ...current, status: 'importing', sendAllowed: false,
          processedRecords, pendingSnapshotRecords };
        meta.put(next);
        return next;
      });
    }
    return stateTransaction(database, Object.values(STATE_STORES), 'readwrite', async (tx) => {
      const meta = tx.objectStore(STATE_STORES.meta);
      const current = await indexedRequest(meta.get(LEGACY_MIGRATION_META_ID)) as StoredProgress;
      if (current.runId !== runId) throw new Error('LEGACY_MIGRATION_SUPERSEDED');
      let imported = 0;
      let processedRecords = 0;
      let pendingSnapshotRecords = 0;
      for (const entry of inventory) {
        const snapshot = await indexedRequest(meta.get(entry.snapshotId)) as Snapshot | undefined;
        if (!snapshot || snapshot.rawSource !== entry.rawSource) throw new Error('LEGACY_SNAPSHOT_COLLISION');
        const processed = new Set(snapshot.processed);
        for (const item of entry.items) {
          // A processed marker alone is insufficient: verify the operation or durable acknowledgement.
          await this.importItem(tx, item, true);
          if (entry.snapshotId === prepared.snapshotId) {
            if (processed.has(item.fingerprint)) processedRecords += item.rawRecords.length;
          } else if (!processed.has(item.fingerprint)) pendingSnapshotRecords += item.rawRecords.length;
        }
      }
      for (const item of prepared.items) {
        const ledger = await indexedRequest(tx.objectStore(STATE_STORES.migrationItems).get(legacyMigrationItemId(item.fingerprint))) as MigrationItem | undefined;
        if (ledger?.state === 'imported') imported += item.rawRecords.length;
      }
      const auditedIds = new Set(inventory.map((entry) => entry.snapshotId));
      const unauditedSnapshot = (await indexedRequest(meta.getAll()) as Snapshot[]).some((row) => row.id.startsWith('legacy-snapshot:v1:')
        && row.sourceKey === LEGACY_QUEUE_SOURCE_KEY && !auditedIds.has(row.id));
      const unknown = (await indexedRequest(tx.objectStore(STATE_STORES.migrationUnknown).getAll()) as MigrationUnknown[])
        .filter((entry) => entry.sourceKey === LEGACY_QUEUE_SOURCE_KEY && !entry.resolved);
      // This synchronous source check complements the externally established writer fence.
      const sourceMatches = this.readSource() === raw;
      const sendAllowed = current.writersStopped && sourceMatches && processedRecords === prepared.total && pendingSnapshotRecords === 0 && !unauditedSnapshot;
      const final: StoredProgress = { ...current, status: sendAllowed && unknown.length === 0 ? 'completed' : 'partial',
        processedRecords, pendingSnapshotRecords, snapshotAuditComplete: !unauditedSnapshot,
        importedRecords: imported, unresolvedRecords: unknown.length, sourceMatches, sendAllowed };
      meta.put(final);
      const { id: _id, runId: _runId, ...publicProgress } = final;
      return publicProgress;
    });
  }

  private async importItem(tx: IDBTransaction, item: PreparedItem, verifyOnly = false): Promise<void> {
    const store = tx.objectStore(STATE_STORES.migrationItems);
    const id = legacyMigrationItemId(item.fingerprint);
    const prior = await indexedRequest(store.get(id)) as MigrationItem | undefined;
    let reason = item.reason;
    let accountId = item.accountId;
    if (prior?.state === 'unknown' && prior.reason && !ownershipReasons.has(prior.reason)) reason = prior.reason;
    if (prior?.state === 'imported' && reason === 'unknown-owner') { accountId = prior.accountId; reason = undefined; }
    if (prior?.accountId && accountId && prior.accountId !== accountId) reason = 'ownership-conflict';
    const raw = mergeRaw(prior, item);
    const ledger: MigrationItem = {
      ...prior, id, sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: item.fingerprint,
      canonical: prior?.canonical ?? item.canonical,
      canonicalVariants: [...new Set([...(prior?.canonicalVariants ?? []), ...item.canonicalVariants])].sort(),
      ...raw, state: prior?.state ?? 'unknown', unknownIds: prior?.unknownIds ?? [],
    };
    // A collision must not be hidden by a previous, less specific quarantine reason.
    if (ledger.canonicalVariants.length > 1 || (prior && prior.canonical !== item.canonical)) reason = 'fingerprint-collision';
    let operation = prior?.opId ? await indexedRequest(tx.objectStore(STATE_STORES.outbox).get(prior.opId)) as OutboxOperation | undefined : undefined;
    const record = item.record;
    const validBinding = prior && prior.sourceKey === LEGACY_QUEUE_SOURCE_KEY && prior.fingerprint === item.fingerprint
      && prior.canonical === item.canonical && typeof prior.opId === 'string' && prior.opId.length > 0
      && typeof prior.accountId === 'string' && prior.accountId.length > 0;
    const acknowledged = !!(validBinding && record && Number.isSafeInteger(prior.acknowledgedVersion)
      && prior.acknowledgedVersion! > record.baseVersion && Number.isSafeInteger(prior.acknowledgedAtMs) && prior.acknowledgedAtMs! >= 0);
    if (!reason && prior && (prior.state === 'imported' || prior.opId)) {
      const matches = operation && record && operation.accountId === prior.accountId && operation.opId === prior.opId
        && operation.migrationSourceKey === LEGACY_QUEUE_SOURCE_KEY && operation.migrationCanonical === item.canonical
        && operation.migrationFingerprint === item.fingerprint && operation.writerId === `legacy:${item.fingerprint}`
        && operation.key === record.key && operation.type === record.type && operation.baseVersion === record.baseVersion
        && (record.type === 'put' ? operation.type === 'put' && operation.value === record.value : !('value' in operation));
      if (!validBinding || (!operation && !acknowledged) || (operation && (!matches
        || prior.acknowledgedVersion !== undefined || prior.acknowledgedAtMs !== undefined))) reason = 'missing-imported-operation';
    }
    // The completion audit can quarantine missing evidence, but must never recreate an operation.
    if (!reason && verifyOnly && (!prior || (!operation && !acknowledged))) reason = 'missing-imported-operation';
    if (!reason && accountId && item.record) {
      const owner = await indexedRequest(tx.objectStore(STATE_STORES.meta).get(outboxKeyOwnerId(item.record.key))) as { accountId: string } | undefined;
      const value = await indexedRequest(tx.objectStore(STATE_STORES.values).get(item.record.key)) as { accountId?: string } | undefined;
      if (!item.record.key.startsWith(`fitfocus_data_${accountId}_`)
        || (owner && owner.accountId !== accountId) || (value?.accountId && value.accountId !== accountId)) reason = 'ownership-conflict';
      else if (item.record.key.endsWith('_all_users') || item.record.key.endsWith('__ffv')) reason = 'forbidden-key';
    }
    if (!reason && (!accountId || !item.record)) reason = 'unknown-owner';
    if (reason) {
      if (operation) {
        const conflicted: OutboxOperation = { ...operation, status: 'conflicted', reason };
        delete conflicted.attempt;
        tx.objectStore(STATE_STORES.outbox).put(conflicted);
      }
      const evidence = JSON.stringify(raw.rawCanonicals);
      const unknownStore = tx.objectStore(STATE_STORES.migrationUnknown);
      let unknownId = `legacy-unknown:${item.fingerprint}:${item.evidenceHash}`;
      let existing: MigrationUnknown | undefined;
      const matchesEvidence = (row: MigrationUnknown) => row.sourceKey === LEGACY_QUEUE_SOURCE_KEY
        && row.fingerprint === item.fingerprint && row.canonicalEvidence === evidence;
      for (const previousId of ledger.unknownIds) {
        const row = await indexedRequest(unknownStore.get(previousId)) as MigrationUnknown | undefined;
        if (row && matchesEvidence(row)) { unknownId = previousId; existing = row; break; }
      }
      if (!existing) {
        const baseId = unknownId;
        for (let suffix = 0; ; suffix += 1) {
          const row = await indexedRequest(unknownStore.get(unknownId)) as MigrationUnknown | undefined;
          if (!row || matchesEvidence(row)) { existing = row; break; }
          unknownId = `${baseId}:${item.unknownNonce}:${suffix}`;
        }
      }
      const unknown: MigrationUnknown = { id: unknownId, sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: item.fingerprint,
        rawRecord: raw.rawRecords[0], rawRecords: raw.rawRecords, canonicalEvidence: evidence, reason, detectedAt: existing?.detectedAt ?? new Date().toISOString() };
      unknownStore.put(unknown);
      ledger.state = 'unknown'; ledger.reason = reason;
      ledger.unknownIds = [...new Set([...ledger.unknownIds, unknownId])];
    } else {
      if (!operation && !acknowledged) {
        const record = item.record!;
        const nowMs = Date.now();
        operation = await writeOutboxInTransaction(tx, {
          accountId: accountId!, writerId: `legacy:${item.fingerprint}`, baseVersion: record.baseVersion,
          intent: record.type === 'put' ? { type: 'put', key: record.key, value: record.value } : { type: 'delete', key: record.key },
        }, { opId: item.opId, nowMs,
          conflictReason: Number.isSafeInteger(record.baseVersion) && Number.isSafeInteger(record.retryCount) ? undefined : 'legacy-unsupported-metadata',
          legacy: { sourceKey: LEGACY_QUEUE_SOURCE_KEY, fingerprint: item.fingerprint, canonical: item.canonical, retryCount: record.retryCount } });
        ledger.opId = operation.opId;
      }
      ledger.accountId = accountId;
      for (const unknownId of ledger.unknownIds) {
        const unknown = await indexedRequest(tx.objectStore(STATE_STORES.migrationUnknown).get(unknownId)) as MigrationUnknown | undefined;
        if (unknown && unknown.sourceKey === LEGACY_QUEUE_SOURCE_KEY && unknown.fingerprint === item.fingerprint) {
          tx.objectStore(STATE_STORES.migrationUnknown).put({ ...unknown, resolved: { opId: ledger.opId!, accountId: accountId!, atMs: Date.now() } });
        }
      }
      ledger.state = 'imported'; delete ledger.reason;
    }
    store.put(ledger);
  }
}
