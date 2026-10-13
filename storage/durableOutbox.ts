import { StateDatabase, STATE_STORES, indexedRequest, stateTransaction, userStateDatabase } from './stateDatabase';
import { LEGACY_QUEUE_SOURCE_KEY, LEGACY_MIGRATION_META_ID, legacyMigrationItemId, legacyFingerprintFields,
  legacyDeletedAccountMetaId } from './legacyQueue';
import { familyMenuStorageKey, isFamilyMenuIntent } from '../familyMenuValidation';

export type OutboxIntent = { type: 'put'; key: string; value: string } | { type: 'delete'; key: string };
export type OutboxAttempt = {
  attemptId: string; owner: string; sessionEpoch: string; startedAtMs: number;
  deletedAccountMarkerId?: string;
};
export type OutboxOperation = OutboxIntent & {
  /** Missing on pre-profile operations: those are state writes. */
  resource?: 'profile' | 'familyMenu';
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
  acknowledgedOpId?: string; acknowledgedWriterId?: string; acknowledgedRevision?: number;
};
export type StateSyncPause = 'auth' | 'access' | 'protocol' | 'legacy';
export type ActiveOutboxSession = { id: 'active-session'; accountId: string; sessionEpoch: string; serverSessionId?: string; pause?: StateSyncPause };
export type OutboxReadGuard = { accountId: string; serverSessionId: string; sessionEpoch: string; authFence: number };
export type OutboxCommitGuard = { readGuard: OutboxReadGuard; canCommit: () => boolean };
type ActiveSession = ActiveOutboxSession;
export type OutboxClaim = OutboxOperation & { status: 'sending'; attempt: OutboxAttempt };
export type OutboxOutcome =
  | { kind: 'acknowledged'; version: number }
  | { kind: 'conflicted'; reason: string; serverSnapshot?: OutboxOperation['serverSnapshot'] }
  | { kind: 'failed'; reason: string }
  | { kind: 'retry'; reason: string; nextAttemptAtMs: number; pause?: StateSyncPause };

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
  resource?: 'profile' | 'familyMenu';
  baseVersion: number; parentOpId?: string;
  conflictReason?: 'editor-not-loaded';
  /** Generated results require the captured proof; ordinary offline edits omit it. */
  readGuard?: OutboxReadGuard;
  canCommit?: () => boolean;
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
  if (input.resource === 'profile' && (input.intent.type !== 'put' || input.intent.key !== `fitfocus_data_${input.accountId}_profile`)) {
    throw new Error('OUTBOX_INVALID_PROFILE_INTENT');
  }
  if (input.resource === 'familyMenu') {
    let value: unknown;
    try { value = input.intent.type === 'put' ? JSON.parse(input.intent.value) : null; } catch {}
    if (!isFamilyMenuIntent(value) || input.intent.key !== familyMenuStorageKey(input.accountId, value)) throw new Error('OUTBOX_INVALID_FAMILY_MENU_INTENT');
  }
  const metaStore = tx.objectStore(STATE_STORES.meta);
  const outbox = tx.objectStore(STATE_STORES.outbox);
  if (input.canCommit && !input.readGuard) throw new Error('OUTBOX_INVALID_READ_GUARD');
  if (input.readGuard !== undefined) {
    const guard = input.readGuard;
    if (guard.accountId !== input.accountId || !guard.sessionEpoch || !/^[a-f0-9]{64}$/.test(guard.serverSessionId)
      || !finiteInteger(guard.authFence)) throw new Error('OUTBOX_INVALID_READ_GUARD');
    const [active, fence] = await Promise.all([
      indexedRequest(metaStore.get('active-session')) as Promise<ActiveOutboxSession | undefined>,
      indexedRequest(metaStore.get('auth-fence')) as Promise<{ revision: number } | undefined>,
    ]);
    if (active?.accountId !== guard.accountId || active.serverSessionId !== guard.serverSessionId
      || active.sessionEpoch !== guard.sessionEpoch || active.pause || (fence?.revision ?? 0) !== guard.authFence) {
      throw new Error('OUTBOX_WRITE_SESSION_CHANGED');
    }
  }
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
  const acknowledgedParent = input.parentOpId && !parent && !head
    && meta.acknowledgedOpId === input.parentOpId && meta.acknowledgedWriterId === input.writerId
    && meta.acknowledgedRevision === input.expectedRevision;
  let reason = context.conflictReason;
  if (!reason && (input.expectedRevision ?? (context.legacy ? meta.valueRevision : -1)) !== meta.valueRevision) reason = 'local-revision-conflict';
  else if (!reason && input.parentOpId && !acknowledgedParent && (!parent || parent.opId !== head?.opId || parent.accountId !== input.accountId
    || parent.key !== input.intent.key || parent.resource !== input.resource || parent.writerId !== input.writerId || !['pending', 'sending'].includes(parent.status))) reason = 'invalid-parent';
  else if (!reason && head && !parent) reason = 'independent-snapshot';
  else if (!reason && !input.parentOpId && input.baseVersion !== meta.confirmedVersion) reason = 'base-version-conflict';
  if (!reason && context.legacy && existingValue
    && (input.intent.type === 'delete' || existingValue.value !== input.intent.value)) reason = 'legacy-local-value-conflict';

  if (input.canCommit?.() === false) throw new Error('OUTBOX_WRITE_SESSION_CHANGED');
  const operation: OutboxOperation = {
    ...input.intent, opId: context.opId, accountId: input.accountId, writerId: input.writerId,
    ...(input.resource ? { resource: input.resource } : {}),
    revision: meta.lastRevision + 1, baseVersion: !reason && input.parentOpId ? parent?.baseVersion ?? meta.confirmedVersion : input.baseVersion,
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

  async sessionState(): Promise<{ fence: number; active?: ActiveOutboxSession }> {
    const db = await this.connection.open();
    return stateTransaction(db, [STATE_STORES.meta], 'readonly', async (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const fenceRequest = indexedRequest(store.get('auth-fence')) as Promise<{ revision: number } | undefined>;
      const activeRequest = indexedRequest(store.get('active-session')) as Promise<ActiveOutboxSession | undefined>;
      const [fence, active] = await Promise.all([fenceRequest, activeRequest]);
      return { fence: fence?.revision ?? 0, active };
    });
  }

  async acceptSession(accountId: string, serverSessionId: string, expectedFence: number): Promise<ActiveOutboxSession | null> {
    return (await this.acceptSessionState(accountId, serverSessionId, expectedFence))?.session ?? null;
  }

  async acceptReadSession(accountId: string, serverSessionId: string, expectedFence: number, previous?: OutboxReadGuard): Promise<OutboxReadGuard | null> {
    const accepted = await this.acceptSessionState(accountId, serverSessionId, expectedFence, previous);
    return accepted ? { accountId, serverSessionId, sessionEpoch: accepted.session.sessionEpoch, authFence: accepted.authFence } : null;
  }

  /** Accept proof and capture its fence in the same transaction; later reads cannot adopt a newer fence. */
  private async acceptSessionState(accountId: string, serverSessionId: string, expectedFence: number, previous?: OutboxReadGuard): Promise<{ session: ActiveOutboxSession; authFence: number } | null> {
    requireText(accountId); requireText(serverSessionId);
    if (!finiteInteger(expectedFence)) throw new Error('OUTBOX_INVALID_AUTH_FENCE');
    const db = await this.connection.open();
    return stateTransaction(db, [STATE_STORES.meta], 'readwrite', async (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const fenceRequest = indexedRequest(store.get('auth-fence')) as Promise<{ revision: number; loggedOutSession?: string } | undefined>;
      const currentRequest = indexedRequest(store.get('active-session')) as Promise<ActiveOutboxSession | undefined>;
      const [fence, current] = await Promise.all([fenceRequest, currentRequest]);
      if ((fence?.revision ?? 0) !== expectedFence || fence?.loggedOutSession === serverSessionId) return null;
      // Refreshing an existing read action cannot clear a pause or replace its attempt while /me was in flight.
      if (previous && (previous.accountId !== accountId || previous.serverSessionId !== serverSessionId
        || previous.authFence !== expectedFence || current?.accountId !== previous.accountId
        || current.serverSessionId !== previous.serverSessionId || current.sessionEpoch !== previous.sessionEpoch || current.pause)) return null;
      if (current?.accountId === accountId && current.serverSessionId === serverSessionId && !current.pause) return { session: current, authFence: expectedFence };
      const revision = (fence?.revision ?? 0) + 1;
      if (!finiteInteger(revision)) throw new Error('OUTBOX_AUTH_FENCE_EXHAUSTED');
      const active: ActiveOutboxSession = { id: 'active-session', accountId, serverSessionId, sessionEpoch: crypto.randomUUID() };
      store.put({ id: 'auth-fence', revision });
      store.put(active);
      return { session: active, authFence: revision };
    });
  }

  async invalidateSessions(): Promise<void> {
    const db = await this.connection.open();
    await stateTransaction(db, [STATE_STORES.meta], 'readwrite', async (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const fence = await indexedRequest(store.get('auth-fence')) as { revision: number; loggedOutSession?: string } | undefined;
      const active = await indexedRequest(store.get('active-session')) as ActiveOutboxSession | undefined;
      const revision = (fence?.revision ?? 0) + 1;
      if (!finiteInteger(revision)) throw new Error('OUTBOX_AUTH_FENCE_EXHAUSTED');
      store.put({ id: 'auth-fence', revision, loggedOutSession: active?.serverSessionId ?? fence?.loggedOutSession });
      store.delete('active-session');
    });
  }

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

  async snapshot(accountId: string, key: string, requireOwnership = false): Promise<{ value: string | null; revision: number; confirmedVersion: number }> {
    requireOwnedKey(accountId, key);
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.values, STATE_STORES.meta], 'readonly', async (tx) => {
      const owner = await indexedRequest(tx.objectStore(STATE_STORES.meta).get(outboxKeyOwnerId(key))) as { accountId: string } | undefined;
      if (owner && owner.accountId !== accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
      const value = await indexedRequest(tx.objectStore(STATE_STORES.values).get(key)) as { value: string; accountId?: string } | undefined;
      if (value?.accountId && value.accountId !== accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
      if (requireOwnership && value && (value.accountId !== accountId || owner?.accountId !== accountId)) throw new Error('OUTBOX_KEY_OWNERSHIP');
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

  /** A completion status must observe the session and every remaining intent atomically. */
  async isDrained(accountId: string, sessionEpoch: string): Promise<boolean> {
    requireText(accountId); requireText(sessionEpoch);
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.outbox, STATE_STORES.meta], 'readonly', async (tx) => {
      const [active, count] = await Promise.all([
        indexedRequest(tx.objectStore(STATE_STORES.meta).get('active-session')) as Promise<ActiveOutboxSession | undefined>,
        indexedRequest(tx.objectStore(STATE_STORES.outbox).index('accountId').count(accountId)),
      ]);
      return active?.accountId === accountId && active.sessionEpoch === sessionEpoch && !active.pause && count === 0;
    });
  }

  async isReadSessionCurrent(guard: OutboxReadGuard): Promise<boolean> {
    const { fence, active } = await this.sessionState();
    return fence === guard.authFence && active?.accountId === guard.accountId
      && active.sessionEpoch === guard.sessionEpoch && active.serverSessionId === guard.serverSessionId && !active.pause;
  }

  /** Session/fence, local revision and pending intents are checked in the same apply transaction. */
  async hydrate(accountId: string, key: string, observation: { value: string; version: number; exists: boolean }, expectedRevision: number, expectedSessionEpoch?: string, expectedAuthFence?: number): Promise<boolean> {
    requireOwnedKey(accountId, key);
    if (expectedAuthFence !== undefined && (!expectedSessionEpoch || !finiteInteger(expectedAuthFence))) throw new Error('OUTBOX_INVALID_READ_GUARD');
    if (!finiteInteger(expectedRevision) || !finiteInteger(observation.version)
      || typeof observation.value !== 'string' || typeof observation.exists !== 'boolean'
      || (observation.exists && observation.version === 0)) throw new Error('OUTBOX_INVALID_OBSERVATION');
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.values, STATE_STORES.outbox, STATE_STORES.meta], 'readwrite', async (tx) => {
      const metaStore = tx.objectStore(STATE_STORES.meta);
      if (expectedSessionEpoch) {
        const active = await indexedRequest(metaStore.get('active-session')) as ActiveOutboxSession | undefined;
        if (active?.accountId !== accountId || active.sessionEpoch !== expectedSessionEpoch || active.pause) return false;
        if (expectedAuthFence !== undefined) {
          const fence = await indexedRequest(metaStore.get('auth-fence')) as { revision: number } | undefined;
          if ((fence?.revision ?? 0) !== expectedAuthFence) return false;
        }
      }
      const owner = await indexedRequest(metaStore.get(outboxKeyOwnerId(key))) as { accountId: string } | undefined;
      if (owner && owner.accountId !== accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
      const id = keyStateId(accountId, key);
      const meta = await indexedRequest(metaStore.get(id)) as KeyState | undefined;
      const operations = await indexedRequest(tx.objectStore(STATE_STORES.outbox).index('accountKey').getAll([accountId, key])) as OutboxOperation[];
      if (operations.length || (meta?.valueRevision ?? 0) !== expectedRevision
        || observation.version < (meta?.confirmedVersion ?? 0)) return false;
      const values = tx.objectStore(STATE_STORES.values);
      const existing = await indexedRequest(values.get(key)) as { value: string; accountId?: string } | undefined;
      if (existing?.accountId && existing.accountId !== accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
      // Unowned legacy content needs its migration/provenance decision before replacement.
      if (existing && !existing.accountId && (!observation.exists || existing.value !== observation.value)) return false;
      // Re-reading the same owned generation must not make another tab's editor stale.
      // Initial absence still creates metadata so a leftover legacy value cannot revive.
      if (meta && owner?.accountId === accountId && observation.version === meta.confirmedVersion
        && (observation.exists ? existing?.accountId === accountId && existing.value === observation.value : !existing)) return true;
      const revision = (meta?.lastRevision ?? 0) + 1;
      if (!finiteInteger(revision)) throw new Error('OUTBOX_REVISION_EXHAUSTED');
      if (observation.exists) values.put({ key, accountId, value: observation.value, updatedAt: Date.now() });
      else values.delete(key);
      metaStore.put({ id, accountId, key, lastRevision: revision, valueRevision: revision, confirmedVersion: observation.version } satisfies KeyState);
      metaStore.put({ id: outboxKeyOwnerId(key), accountId, key });
      return true;
    });
  }

  /** A conflicting full snapshot is retained as an operation, without overwriting values. */
  async write(input: OutboxWrite): Promise<OutboxOperation> {
    // A caller cannot replace the captured proof or payload while opening IDB.
    input = { ...input, intent: { ...input.intent }, ...(input.readGuard ? { readGuard: { ...input.readGuard } } : {}) };
    requireOwnedKey(input.accountId, input.intent.key); requireText(input.writerId);
    if (!finiteInteger(input.expectedRevision) || !finiteInteger(input.baseVersion)) throw new Error('OUTBOX_INVALID_VERSION');
    if (!['put', 'delete'].includes(input.intent.type)
      || (input.intent.type === 'put' ? typeof input.intent.value !== 'string' : 'value' in input.intent)) throw new Error('OUTBOX_INVALID_INTENT');
    const opId = crypto.randomUUID();
    const nowMs = Date.now();
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.values, STATE_STORES.outbox, STATE_STORES.meta], 'readwrite', (tx) =>
      writeOutboxInTransaction(tx, input, { opId, nowMs, conflictReason: input.conflictReason }));
  }

  async claim(input: { accountId: string; sessionEpoch: string; owner: string; nowMs: number; leaseMs: number }): Promise<OutboxClaim | null> {
    requireText(input.accountId); requireText(input.sessionEpoch); requireText(input.owner);
    if (!finiteInteger(input.nowMs) || !finiteInteger(input.leaseMs) || input.leaseMs === 0) throw new Error('OUTBOX_INVALID_LEASE');
    const attemptId = crypto.randomUUID();
    const deletionMarkerId = await legacyDeletedAccountMetaId(input.accountId);
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.outbox, STATE_STORES.meta, STATE_STORES.migrationItems], 'readwrite', async (tx) => {
      const sessionRequest = indexedRequest(tx.objectStore(STATE_STORES.meta).get('active-session')) as Promise<ActiveSession | undefined>;
      const store = tx.objectStore(STATE_STORES.outbox);
      const operationsRequest = indexedRequest(store.index('accountId').getAll(input.accountId)) as Promise<OutboxOperation[]>;
      const [session, operations] = await Promise.all([sessionRequest, operationsRequest]);
      if (session?.accountId !== input.accountId || session.sessionEpoch !== input.sessionEpoch || session.pause) return null;
      // Revisions define per-key order even if the wall clock moves backwards.
      operations.sort((a, b) => a.revision - b.revision || a.createdAtMs - b.createdAtMs || a.opId.localeCompare(b.opId));
      const seenKeys = new Set<string>();
      let deletionChecked = false;
      let accountDeleted = false;
      for (const operation of operations) {
        if (seenKeys.has(operation.key)) continue;
        seenKeys.add(operation.key);
        if (operation.migrationSourceKey || operation.migrationFingerprint || operation.migrationCanonical) {
          const metaStore = tx.objectStore(STATE_STORES.meta);
          if (!deletionChecked) {
            const marker = await indexedRequest(metaStore.get(deletionMarkerId)) as { kind?: unknown; version?: unknown } | undefined;
            accountDeleted = marker?.kind === 'legacy-deleted-account' && marker.version === 1;
            deletionChecked = true;
          }
          if (accountDeleted) continue;
          const gateRequest = indexedRequest(metaStore.get(LEGACY_MIGRATION_META_ID)) as Promise<LegacyGate | undefined>;
          const receiptRequest = indexedRequest(tx.objectStore(STATE_STORES.migrationItems).get(legacyMigrationItemId(operation.migrationFingerprint ?? ''))) as Promise<LegacyReceipt | undefined>;
          const [gate, receipt] = await Promise.all([gateRequest, receiptRequest]);
          if (!canSendLegacy(operation, gate, receipt)) continue;
        }
        if (operation.status === 'sending') {
          if (!operation.attempt || (operation.attempt.sessionEpoch === input.sessionEpoch && input.nowMs - operation.attempt.startedAtMs < input.leaseMs)) continue;
        } else if (operation.status !== 'pending' || operation.nextAttemptAtMs > input.nowMs) continue;
        const claim: OutboxClaim = {
          ...operation, status: 'sending', updatedAtMs: input.nowMs,
          retryCount: operation.retryCount + (operation.status === 'sending' ? 1 : 0),
          attempt: {
            attemptId, owner: input.owner, sessionEpoch: input.sessionEpoch, startedAtMs: input.nowMs,
            ...(operation.migrationSourceKey || operation.migrationFingerprint || operation.migrationCanonical
              ? { deletedAccountMarkerId: deletionMarkerId }
              : {}),
          },
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
    const isLegacyClaim = !!(claim.migrationSourceKey || claim.migrationFingerprint || claim.migrationCanonical);
    const deletionMarkerId = isLegacyClaim
      ? claim.attempt.deletedAccountMarkerId ?? await legacyDeletedAccountMetaId(claim.accountId)
      : undefined;
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.outbox, STATE_STORES.meta, STATE_STORES.migrationItems], 'readwrite', async (tx) => {
      const store = tx.objectStore(STATE_STORES.outbox);
      const metaStore = tx.objectStore(STATE_STORES.meta);
      const currentRequest = indexedRequest(store.get(claim.opId)) as Promise<OutboxOperation | undefined>;
      const sessionRequest = indexedRequest(metaStore.get('active-session')) as Promise<ActiveSession | undefined>;
      const fenceRequest = outcome.kind === 'retry' && outcome.pause
        ? indexedRequest(metaStore.get('auth-fence')) as Promise<{ revision: number } | undefined>
        : Promise.resolve(undefined);
      const migrationGateRequest = claim.migrationSourceKey || claim.migrationFingerprint || claim.migrationCanonical
        ? indexedRequest(metaStore.get(LEGACY_MIGRATION_META_ID)) as Promise<LegacyGate | undefined>
        : Promise.resolve(undefined);
      const migrationReceiptRequest = claim.migrationSourceKey || claim.migrationFingerprint || claim.migrationCanonical
        ? indexedRequest(tx.objectStore(STATE_STORES.migrationItems).get(legacyMigrationItemId(claim.migrationFingerprint ?? ''))) as Promise<LegacyReceipt | undefined>
        : Promise.resolve(undefined);
      const deletionMarkerRequest = deletionMarkerId
        ? indexedRequest(metaStore.get(deletionMarkerId)) as Promise<{ kind?: unknown; version?: unknown } | undefined>
        : Promise.resolve(undefined);
      const keyStateRequest = outcome.kind === 'acknowledged'
        ? indexedRequest(metaStore.get(keyStateId(claim.accountId, claim.key))) as Promise<KeyState | undefined>
        : Promise.resolve(undefined);
      const siblingsRequest = outcome.kind === 'acknowledged'
        ? indexedRequest(store.index('accountKey').getAll([claim.accountId, claim.key])) as Promise<OutboxOperation[]>
        : Promise.resolve([] as OutboxOperation[]);
      const [current, session, fence, gate, receipt, deletionMarker, ackMeta, ackSiblings] = await Promise.all([
        currentRequest, sessionRequest, fenceRequest, migrationGateRequest, migrationReceiptRequest,
        deletionMarkerRequest, keyStateRequest, siblingsRequest,
      ]);
      if (!current || current.status !== 'sending' || current.accountId !== claim.accountId || current.revision !== claim.revision
        || current.key !== claim.key || current.baseVersion !== claim.baseVersion || current.writerId !== claim.writerId
        || current.type !== claim.type || (current.type === 'put' && (claim.type !== 'put' || current.value !== claim.value))
        || current.resource !== claim.resource
        || current.migrationSourceKey !== claim.migrationSourceKey || current.migrationFingerprint !== claim.migrationFingerprint
        || current.migrationCanonical !== claim.migrationCanonical
        || current.attempt?.attemptId !== claim.attempt.attemptId
        || current.attempt.owner !== claim.attempt.owner || current.attempt.startedAtMs !== claim.attempt.startedAtMs
        || current.attempt.sessionEpoch !== claim.attempt.sessionEpoch
        || current.attempt.deletedAccountMarkerId !== claim.attempt.deletedAccountMarkerId
        || session?.accountId !== claim.accountId || session.sessionEpoch !== claim.attempt.sessionEpoch || session.pause) return false;
      if (current.migrationSourceKey || current.migrationFingerprint || current.migrationCanonical) {
        if (deletionMarker?.kind === 'legacy-deleted-account' && deletionMarker.version === 1) return false;
        if (!canSendLegacy(current, gate, receipt)) return false;
      }
      const updated: OutboxOperation = { ...current, updatedAtMs: nowMs };
      delete updated.attempt;
      if (outcome.kind === 'acknowledged') {
        const meta = ackMeta;
        if (!meta) throw new Error('OUTBOX_MISSING_KEY_STATE');
        for (const child of ackSiblings) {
          if (child.parentOpId === current.opId && child.resource === current.resource && child.writerId === current.writerId && child.status === 'pending') {
            store.put({ ...child, baseVersion: outcome.version, updatedAtMs: nowMs });
          }
        }
        meta.confirmedVersion = outcome.version;
        meta.acknowledgedOpId = current.opId;
        meta.acknowledgedWriterId = current.writerId;
        meta.acknowledgedRevision = current.revision;
        if (meta.headOpId === current.opId && meta.valueRevision === current.revision) delete meta.headOpId;
        metaStore.put(meta);
        if (receipt) tx.objectStore(STATE_STORES.migrationItems).put({ ...receipt, acknowledgedVersion: outcome.version, acknowledgedAtMs: nowMs });
        store.delete(current.opId);
      } else {
        updated.reason = outcome.reason;
        updated.status = outcome.kind === 'retry' ? 'pending' : outcome.kind;
        if (outcome.kind === 'retry') {
          if (!outcome.pause) updated.retryCount += 1;
          updated.nextAttemptAtMs = outcome.nextAttemptAtMs;
          if (outcome.pause) {
            const revision = (fence?.revision ?? 0) + 1;
            if (!finiteInteger(revision)) throw new Error('OUTBOX_AUTH_FENCE_EXHAUSTED');
            metaStore.put({ id: 'auth-fence', revision });
            metaStore.put({ ...session, pause: outcome.pause });
          }
        }
        if (outcome.kind === 'conflicted' && outcome.serverSnapshot) updated.serverSnapshot = outcome.serverSnapshot;
        store.put(updated);
      }
      return true;
    });
  }
}
