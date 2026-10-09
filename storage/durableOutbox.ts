import { StateDatabase, STATE_STORES, indexedRequest, stateTransaction, userStateDatabase } from './stateDatabase';
import { LEGACY_QUEUE_SOURCE_KEY, LEGACY_MIGRATION_META_ID, legacyMigrationItemId, legacyFingerprintFields } from './legacyQueue';

export type OutboxIntent = { type: 'put'; key: string; value: string } | { type: 'delete'; key: string };
export type OutboxAttempt = { attemptId: string; owner: string; sessionEpoch: string; startedAtMs: number };
export type OutboxOperation = OutboxIntent & {
  opId: string;
  accountId: string;
  writerId: string;
  revision: number;
  baseVersion: number;
  parentOpId?: string;
  status: 'pending' | 'sending' | 'conflicted' | 'failed';
  retryCount: number;
  nextAttemptAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
  attempt?: OutboxAttempt;
  reason?: string;
  serverSnapshot?: { version: number; value?: string; exists?: boolean };
  migrationSourceKey?: string;
  migrationFingerprint?: string;
  migrationCanonical?: string;
};

type KeyState = {
  id: string; accountId: string; key: string; lastRevision: number;
  valueRevision: number; confirmedVersion: number; headOpId?: string;
};
type ActiveSession = { id: 'active-session'; accountId: string; sessionEpoch: string };
export type OutboxClaim = OutboxOperation & { status: 'sending'; attempt: OutboxAttempt };
export type OutboxOutcome =
  | { kind: 'acknowledged'; version: number }
  | { kind: 'conflicted'; reason: string; serverSnapshot?: OutboxOperation['serverSnapshot'] }
  | { kind: 'failed'; reason: string }
  | { kind: 'retry'; reason: string; nextAttemptAtMs: number };

const keyStateId = (accountId: string, key: string) => `key:${JSON.stringify([accountId, key])}`;
export const outboxKeyOwnerId = (key: string) => `owner:${JSON.stringify(key)}`;
const finiteInteger = (value: number) => Number.isSafeInteger(value) && value >= 0;
function requireText(value: string): void { if (typeof value !== 'string' || !value.length) throw new Error('OUTBOX_INVALID_IDENTITY'); }

/** Account identity is provided by the caller, never inferred from a legacy/global key. */
function requireOwnedKey(accountId: string, key: string): void {
  requireText(accountId);
  requireText(key);
  if (!key.startsWith(`fitfocus_data_${accountId}_`) || key.endsWith('_all_users') || key.endsWith('__ffv')) {
    throw new Error('OUTBOX_KEY_OWNERSHIP');
  }
}

export type OutboxWrite = {
  accountId: string; writerId: string; intent: OutboxIntent; expectedRevision: number;
  baseVersion: number; parentOpId?: string;
};

/** Internal transaction primitive, shared by ordinary writes and atomic migration. */
export async function writeOutboxInTransaction(
  tx: IDBTransaction,
  input: Omit<OutboxWrite, 'expectedRevision'> & { expectedRevision?: number },
  context: {
    opId: string; nowMs: number; conflictReason?: string;
    legacy?: { sourceKey: string; fingerprint: string; canonical: string; retryCount: number };
  },
): Promise<OutboxOperation> {
  requireOwnedKey(input.accountId, input.intent.key);
  const metaStore = tx.objectStore(STATE_STORES.meta);
  const outbox = tx.objectStore(STATE_STORES.outbox);
  const ownerId = outboxKeyOwnerId(input.intent.key);
  const owner = await indexedRequest(metaStore.get(ownerId)) as { accountId: string } | undefined;
  if (owner && owner.accountId !== input.accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
  const existingValue = await indexedRequest(tx.objectStore(STATE_STORES.values).get(input.intent.key)) as { value: string; accountId?: string } | undefined;
  if (existingValue?.accountId && existingValue.accountId !== input.accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
  const id = keyStateId(input.accountId, input.intent.key);
  const meta: KeyState = await indexedRequest(metaStore.get(id)) ?? {
    id, accountId: input.accountId, key: input.intent.key, lastRevision: 0,
    valueRevision: 0, confirmedVersion: input.baseVersion,
  };
  if (!finiteInteger(meta.lastRevision + 1)) throw new Error('OUTBOX_REVISION_EXHAUSTED');
  const parent = input.parentOpId ? await indexedRequest(outbox.get(input.parentOpId)) as OutboxOperation | undefined : undefined;
  const head = meta.headOpId ? await indexedRequest(outbox.get(meta.headOpId)) as OutboxOperation | undefined : undefined;
  let reason = context.conflictReason;
  if (!reason && (input.expectedRevision ?? (context.legacy ? meta.valueRevision : -1)) !== meta.valueRevision) reason = 'local-revision-conflict';
  else if (!reason && input.parentOpId && (!parent || parent.opId !== head?.opId || parent.accountId !== input.accountId
    || parent.key !== input.intent.key || parent.writerId !== input.writerId || !['pending', 'sending'].includes(parent.status))) reason = 'invalid-parent';
  else if (!reason && head && !parent) reason = 'independent-snapshot';
  else if (!reason && input.baseVersion !== (parent?.baseVersion ?? meta.confirmedVersion)) reason = 'base-version-conflict';
  if (!reason && context.legacy && existingValue
    && (input.intent.type === 'delete' || existingValue.value !== input.intent.value)) reason = 'legacy-local-value-conflict';

  const operation: OutboxOperation = {
    ...input.intent, opId: context.opId, accountId: input.accountId, writerId: input.writerId,
    revision: meta.lastRevision + 1, baseVersion: input.baseVersion,
    status: reason ? 'conflicted' : 'pending', retryCount: context.legacy?.retryCount ?? 0, nextAttemptAtMs: context.nowMs,
    createdAtMs: context.nowMs, updatedAtMs: context.nowMs,
    ...(input.parentOpId ? { parentOpId: input.parentOpId } : {}), ...(reason ? { reason } : {}),
    ...(context.legacy ? { migrationSourceKey: context.legacy.sourceKey, migrationFingerprint: context.legacy.fingerprint, migrationCanonical: context.legacy.canonical } : {}),
  };
  const next = { ...meta, lastRevision: operation.revision };
  if (!reason) {
    next.valueRevision = operation.revision;
    next.headOpId = operation.opId;
    const values = tx.objectStore(STATE_STORES.values);
    if (operation.type === 'put') values.put({ key: operation.key, value: operation.value, accountId: operation.accountId, updatedAt: context.nowMs });
    else values.delete(operation.key);
  }
  outbox.add(operation);
  metaStore.put({ id: ownerId, key: input.intent.key, accountId: input.accountId });
  metaStore.put(next);
  return operation;
}

type LegacyGate = { sourceKey: string; sendAllowed: boolean };
type LegacyReceipt = {
  id: string; sourceKey: string; fingerprint: string; canonical: string; canonicalVariants: string[]; state: 'imported' | 'unknown';
  opId?: string; accountId?: string; acknowledgedVersion?: number; acknowledgedAtMs?: number;
};

function canSendLegacy(operation: OutboxOperation, gate: LegacyGate | undefined, receipt: LegacyReceipt | undefined): boolean {
  if (operation.type === 'delete' && 'value' in operation) return false;
  return gate?.sendAllowed === true && gate.sourceKey === LEGACY_QUEUE_SOURCE_KEY
    && operation.migrationSourceKey === LEGACY_QUEUE_SOURCE_KEY && receipt?.sourceKey === LEGACY_QUEUE_SOURCE_KEY
    && receipt.id === legacyMigrationItemId(operation.migrationFingerprint ?? '') && receipt.fingerprint === operation.migrationFingerprint
    && receipt.state === 'imported' && receipt.opId === operation.opId && receipt.accountId === operation.accountId
    && receipt.canonical === operation.migrationCanonical && receipt.canonical === legacyFingerprintFields(operation)
    && Array.isArray(receipt.canonicalVariants) && receipt.canonicalVariants.length === 1 && receipt.canonicalVariants[0] === receipt.canonical
    && receipt.acknowledgedVersion === undefined && receipt.acknowledgedAtMs === undefined;
}

export class DurableOutbox {
  constructor(private readonly connection: StateDatabase = userStateDatabase) {}

  async activateSession(accountId: string, sessionEpoch: string): Promise<void> {
    requireText(accountId); requireText(sessionEpoch);
    const database = await this.connection.open();
    await stateTransaction(database, [STATE_STORES.meta], 'readwrite', (tx) => {
      tx.objectStore(STATE_STORES.meta).put({ id: 'active-session', accountId, sessionEpoch } satisfies ActiveSession);
    });
  }

  async clearSession(accountId: string, expectedEpoch: string): Promise<void> {
    requireText(accountId); requireText(expectedEpoch);
    const database = await this.connection.open();
    await stateTransaction(database, [STATE_STORES.meta], 'readwrite', async (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const session = await indexedRequest(store.get('active-session')) as ActiveSession | undefined;
      if (session?.accountId === accountId && session.sessionEpoch === expectedEpoch) store.delete('active-session');
    });
  }

  async snapshot(accountId: string, key: string): Promise<{ value: string | null; revision: number; confirmedVersion: number }> {
    requireOwnedKey(accountId, key);
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.values, STATE_STORES.meta], 'readonly', async (tx) => {
      const owner = await indexedRequest(tx.objectStore(STATE_STORES.meta).get(outboxKeyOwnerId(key))) as { accountId: string } | undefined;
      if (owner && owner.accountId !== accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
      const value = await indexedRequest(tx.objectStore(STATE_STORES.values).get(key)) as { value: string; accountId?: string } | undefined;
      if (value?.accountId && value.accountId !== accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
      const meta = await indexedRequest(tx.objectStore(STATE_STORES.meta).get(keyStateId(accountId, key))) as KeyState | undefined;
      return { value: value?.value ?? null, revision: meta?.valueRevision ?? 0, confirmedVersion: meta?.confirmedVersion ?? 0 };
    });
  }

  async list(accountId: string): Promise<OutboxOperation[]> {
    requireText(accountId);
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.outbox], 'readonly', (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.outbox).index('accountId').getAll(accountId)) as Promise<OutboxOperation[]>);
  }

  /** A conflicting full snapshot is retained as an operation, without overwriting values. */
  async write(input: OutboxWrite): Promise<OutboxOperation> {
    requireOwnedKey(input.accountId, input.intent.key); requireText(input.writerId);
    if (!finiteInteger(input.expectedRevision) || !finiteInteger(input.baseVersion)) throw new Error('OUTBOX_INVALID_VERSION');
    if (!['put', 'delete'].includes(input.intent.type)
      || (input.intent.type === 'put' ? typeof input.intent.value !== 'string' : 'value' in input.intent)) throw new Error('OUTBOX_INVALID_INTENT');
    const opId = crypto.randomUUID();
    const nowMs = Date.now();
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.values, STATE_STORES.outbox, STATE_STORES.meta], 'readwrite', (tx) =>
      writeOutboxInTransaction(tx, input, { opId, nowMs }));
  }

  async claim(input: { accountId: string; sessionEpoch: string; owner: string; nowMs: number; leaseMs: number }): Promise<OutboxClaim | null> {
    requireText(input.accountId); requireText(input.sessionEpoch); requireText(input.owner);
    if (!finiteInteger(input.nowMs) || !finiteInteger(input.leaseMs) || input.leaseMs === 0) throw new Error('OUTBOX_INVALID_LEASE');
    const attemptId = crypto.randomUUID();
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.outbox, STATE_STORES.meta, STATE_STORES.migrationItems], 'readwrite', async (tx) => {
      const session = await indexedRequest(tx.objectStore(STATE_STORES.meta).get('active-session')) as ActiveSession | undefined;
      if (session?.accountId !== input.accountId || session.sessionEpoch !== input.sessionEpoch) return null;
      const store = tx.objectStore(STATE_STORES.outbox);
      const operations = await indexedRequest(store.index('accountId').getAll(input.accountId)) as OutboxOperation[];
      // Revisions define per-key order even if the wall clock moves backwards.
      operations.sort((a, b) => a.revision - b.revision || a.createdAtMs - b.createdAtMs || a.opId.localeCompare(b.opId));
      const seenKeys = new Set<string>();
      for (const operation of operations) {
        if (seenKeys.has(operation.key)) continue;
        seenKeys.add(operation.key);
        if (operation.migrationSourceKey || operation.migrationFingerprint || operation.migrationCanonical) {
          const gate = await indexedRequest(tx.objectStore(STATE_STORES.meta).get(LEGACY_MIGRATION_META_ID)) as LegacyGate | undefined;
          const receipt = await indexedRequest(tx.objectStore(STATE_STORES.migrationItems).get(legacyMigrationItemId(operation.migrationFingerprint ?? ''))) as LegacyReceipt | undefined;
          if (!canSendLegacy(operation, gate, receipt)) continue;
        }
        if (operation.status === 'sending') {
          if (!operation.attempt || input.nowMs - operation.attempt.startedAtMs < input.leaseMs) continue;
        } else if (operation.status !== 'pending' || operation.nextAttemptAtMs > input.nowMs) continue;
        const claim: OutboxClaim = {
          ...operation, status: 'sending', updatedAtMs: input.nowMs,
          retryCount: operation.retryCount + (operation.status === 'sending' ? 1 : 0),
          attempt: { attemptId, owner: input.owner, sessionEpoch: input.sessionEpoch, startedAtMs: input.nowMs },
        };
        store.put(claim);
        return claim;
      }
      return null;
    });
  }

  /** Finish and version/child updates commit together; stale attempts have no side effects. */
  async finish(claim: OutboxClaim, outcome: OutboxOutcome, nowMs = Date.now()): Promise<boolean> {
    if (!finiteInteger(nowMs)) throw new Error('OUTBOX_INVALID_TIME');
    if (outcome.kind === 'acknowledged' && (!finiteInteger(outcome.version) || outcome.version <= claim.baseVersion)) throw new Error('OUTBOX_INVALID_ACK_VERSION');
    if (outcome.kind === 'retry' && (!finiteInteger(outcome.nextAttemptAtMs) || outcome.nextAttemptAtMs < nowMs)) throw new Error('OUTBOX_INVALID_RETRY_TIME');
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.outbox, STATE_STORES.meta, STATE_STORES.migrationItems], 'readwrite', async (tx) => {
      const store = tx.objectStore(STATE_STORES.outbox);
      const metaStore = tx.objectStore(STATE_STORES.meta);
      const current = await indexedRequest(store.get(claim.opId)) as OutboxOperation | undefined;
      const session = await indexedRequest(metaStore.get('active-session')) as ActiveSession | undefined;
      if (!current || current.status !== 'sending' || current.accountId !== claim.accountId || current.revision !== claim.revision
        || current.key !== claim.key || current.baseVersion !== claim.baseVersion || current.writerId !== claim.writerId
        || current.type !== claim.type || (current.type === 'put' && (claim.type !== 'put' || current.value !== claim.value))
        || current.migrationSourceKey !== claim.migrationSourceKey || current.migrationFingerprint !== claim.migrationFingerprint
        || current.migrationCanonical !== claim.migrationCanonical
        || current.attempt?.attemptId !== claim.attempt.attemptId
        || current.attempt.owner !== claim.attempt.owner || current.attempt.startedAtMs !== claim.attempt.startedAtMs
        || current.attempt.sessionEpoch !== claim.attempt.sessionEpoch
        || session?.accountId !== claim.accountId || session.sessionEpoch !== claim.attempt.sessionEpoch) return false;
      let receipt: LegacyReceipt | undefined;
      if (current.migrationSourceKey || current.migrationFingerprint || current.migrationCanonical) {
        const gate = await indexedRequest(metaStore.get(LEGACY_MIGRATION_META_ID)) as LegacyGate | undefined;
        receipt = await indexedRequest(tx.objectStore(STATE_STORES.migrationItems).get(legacyMigrationItemId(current.migrationFingerprint ?? ''))) as LegacyReceipt | undefined;
        if (!canSendLegacy(current, gate, receipt)) return false;
      }
      const updated: OutboxOperation = { ...current, updatedAtMs: nowMs };
      delete updated.attempt;
      if (outcome.kind === 'acknowledged') {
        const id = keyStateId(current.accountId, current.key);
        const meta = await indexedRequest(metaStore.get(id)) as KeyState | undefined;
        if (!meta) throw new Error('OUTBOX_MISSING_KEY_STATE');
        const siblings = await indexedRequest(store.index('accountKey').getAll([current.accountId, current.key])) as OutboxOperation[];
        for (const child of siblings) {
          if (child.parentOpId === current.opId && child.writerId === current.writerId && child.status === 'pending') {
            store.put({ ...child, baseVersion: outcome.version, updatedAtMs: nowMs });
          }
        }
        meta.confirmedVersion = outcome.version;
        if (meta.headOpId === current.opId && meta.valueRevision === current.revision) delete meta.headOpId;
        metaStore.put(meta);
        if (receipt) tx.objectStore(STATE_STORES.migrationItems).put({ ...receipt, acknowledgedVersion: outcome.version, acknowledgedAtMs: nowMs });
        store.delete(current.opId);
      } else {
        updated.reason = outcome.reason;
        updated.status = outcome.kind === 'retry' ? 'pending' : outcome.kind;
        if (outcome.kind === 'retry') { updated.retryCount += 1; updated.nextAttemptAtMs = outcome.nextAttemptAtMs; }
        if (outcome.kind === 'conflicted' && outcome.serverSnapshot) updated.serverSnapshot = outcome.serverSnapshot;
        store.put(updated);
      }
      return true;
    });
  }
}
