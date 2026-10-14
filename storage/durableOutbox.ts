import { StateDatabase, STATE_STORES, StateStorageError, afterIndexedRequests, indexedRequest, stateTransaction, userStateDatabase } from './stateDatabase';
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
export function writeOutboxInTransaction(
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
  const requests: IDBRequest<unknown>[] = [];
  const requestIndices: Record<string, number> = Object.create(null) as Record<string, number>;
  const queueRead = <T>(name: string, request: IDBRequest<T>): void => {
    requestIndices[name] = requests.length;
    requests.push(request as IDBRequest<unknown>);
  };
  if (input.readGuard !== undefined) {
    const guard = input.readGuard;
    if (guard.accountId !== input.accountId || !guard.sessionEpoch || !/^[a-f0-9]{64}$/.test(guard.serverSessionId)
      || !finiteInteger(guard.authFence)) throw new Error('OUTBOX_INVALID_READ_GUARD');
    queueRead('active', metaStore.get('active-session'));
    queueRead('fence', metaStore.get('auth-fence'));
  }
  const ownerId = outboxKeyOwnerId(input.intent.key);
  queueRead('owner', metaStore.get(ownerId));
  queueRead('existingValue', tx.objectStore(STATE_STORES.values).get(input.intent.key));
  const id = keyStateId(input.accountId, input.intent.key);
  queueRead('meta', metaStore.get(id));
  queueRead('operations', outbox.index('accountKey').getAll([input.accountId, input.intent.key]));
  // Queue dependent writes in the final read's success event. Firefox may
  // deactivate a readwrite transaction before a Promise.all continuation runs.
  return afterIndexedRequests(tx, requests, (results) => {
    const read = <T>(name: string, fallback: T): T => {
      const index = requestIndices[name];
      return index === undefined ? fallback : results[index] as T;
    };
    const active = read<ActiveOutboxSession | undefined>('active', undefined);
    const fence = read<{ revision: number } | undefined>('fence', undefined);
    const owner = read<{ accountId: string } | undefined>('owner', undefined);
    const existingValue = read<{ value: string; accountId?: string } | undefined>('existingValue', undefined);
    const savedMeta = read<KeyState | undefined>('meta', undefined);
    const keyOperations = read<OutboxOperation[]>('operations', []);
    if (input.readGuard && (active?.accountId !== input.readGuard.accountId || active.serverSessionId !== input.readGuard.serverSessionId
      || active.sessionEpoch !== input.readGuard.sessionEpoch || active.pause || (fence?.revision ?? 0) !== input.readGuard.authFence)) {
      throw new Error('OUTBOX_WRITE_SESSION_CHANGED');
    }
    if (owner && owner.accountId !== input.accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
    if (existingValue?.accountId && existingValue.accountId !== input.accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
    const meta: KeyState = savedMeta ?? {
      id, accountId: input.accountId, key: input.intent.key, lastRevision: 0,
      valueRevision: 0, confirmedVersion: input.baseVersion,
    };
    if (!finiteInteger(meta.lastRevision + 1)) throw new Error('OUTBOX_REVISION_EXHAUSTED');
    const parent = input.parentOpId ? keyOperations.find((operation) => operation.opId === input.parentOpId) : undefined;
    const head = meta.headOpId ? keyOperations.find((operation) => operation.opId === meta.headOpId) : undefined;
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
  });
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

function hasLegacyProvenance(operation: OutboxOperation): boolean {
  return !!(operation.migrationSourceKey || operation.migrationFingerprint || operation.migrationCanonical);
}

type ConflictServerSnapshot = { value: string; version: number; exists: boolean };

function conflictServerSnapshot(accountId: string, operation: OutboxOperation): ConflictServerSnapshot | undefined {
  const snapshot = operation.serverSnapshot;
  if (!snapshot || !finiteInteger(snapshot.version) || typeof snapshot.value !== 'string') return undefined;
  const exists = typeof snapshot.exists === 'boolean' ? snapshot.exists : operation.resource === 'profile';
  if (operation.resource === 'profile' && !exists) return undefined;
  if (operation.resource !== 'profile' && typeof snapshot.exists !== 'boolean') return undefined;
  if (exists && operation.resource === 'profile') {
    let profile: unknown;
    try { profile = JSON.parse(snapshot.value); } catch { return undefined; }
    if (typeof profile !== 'object' || profile === null || Array.isArray(profile)
      || (profile as Record<string, unknown>).id !== accountId
      || (profile as Record<string, unknown>).version !== snapshot.version) return undefined;
  }
  if (exists && operation.resource === 'familyMenu') {
    let intent: unknown;
    try { intent = JSON.parse(snapshot.value); } catch { return undefined; }
    if (!isFamilyMenuIntent(intent) || familyMenuStorageKey(accountId, intent) !== operation.key) return undefined;
  }
  return { value: snapshot.value, version: snapshot.version, exists };
}

function validResolvedLocalIntent(accountId: string, key: string, operation: OutboxOperation): boolean {
  if (operation.type === 'delete') return !('value' in operation) && !operation.resource;
  if (typeof operation.value !== 'string') return false;
  if (operation.resource === 'profile') {
    let profile: unknown;
    try { profile = JSON.parse(operation.value); } catch { return false; }
    return typeof profile === 'object' && profile !== null && !Array.isArray(profile)
      && (profile as Record<string, unknown>).id === accountId;
  }
  if (operation.resource === 'familyMenu') {
    let intent: unknown;
    try { intent = JSON.parse(operation.value); } catch { return false; }
    return isFamilyMenuIntent(intent) && familyMenuStorageKey(accountId, intent) === key;
  }
  return true;
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

  async acceptReadSession(accountId: string, serverSessionId: string, expectedFence: number, previous?: OutboxReadGuard,
    requireNoActiveSession = false): Promise<OutboxReadGuard | null> {
    const accepted = await this.acceptSessionState(accountId, serverSessionId, expectedFence, previous, requireNoActiveSession);
    return accepted ? { accountId, serverSessionId, sessionEpoch: accepted.session.sessionEpoch, authFence: accepted.authFence } : null;
  }

  /** Accept proof and capture its fence in the same transaction; later reads cannot adopt a newer fence. */
  private async acceptSessionState(accountId: string, serverSessionId: string, expectedFence: number, previous?: OutboxReadGuard,
    requireNoActiveSession = false): Promise<{ session: ActiveOutboxSession; authFence: number } | null> {
    requireText(accountId); requireText(serverSessionId);
    if (!finiteInteger(expectedFence)) throw new Error('OUTBOX_INVALID_AUTH_FENCE');
    const db = await this.connection.open();
    return stateTransaction(db, [STATE_STORES.meta], 'readwrite', (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const fenceRequest = store.get('auth-fence');
      const currentRequest = store.get('active-session');
      return afterIndexedRequests(tx, [
        fenceRequest as unknown as IDBRequest<unknown>,
        currentRequest as unknown as IDBRequest<unknown>,
      ], ([fenceValue, currentValue]) => {
        const fence = fenceValue as { revision: number; loggedOutSession?: string } | undefined;
        const current = currentValue as ActiveOutboxSession | undefined;
        if ((fence?.revision ?? 0) !== expectedFence || fence?.loggedOutSession === serverSessionId) return null;
        if (requireNoActiveSession && current) return null;
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
    });
  }

  async invalidateSessions(): Promise<void> {
    const db = await this.connection.open();
    await stateTransaction(db, [STATE_STORES.meta], 'readwrite', (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const fenceRequest = store.get('auth-fence');
      const activeRequest = store.get('active-session');
      return afterIndexedRequests(tx, [
        fenceRequest as unknown as IDBRequest<unknown>,
        activeRequest as unknown as IDBRequest<unknown>,
      ], ([fenceValue, activeValue]) => {
        const fence = fenceValue as { revision: number; loggedOutSession?: string } | undefined;
        const active = activeValue as ActiveOutboxSession | undefined;
        const revision = (fence?.revision ?? 0) + 1;
        if (!finiteInteger(revision)) throw new Error('OUTBOX_AUTH_FENCE_EXHAUSTED');
        store.put({ id: 'auth-fence', revision, loggedOutSession: active?.serverSessionId ?? fence?.loggedOutSession });
        store.delete('active-session');
      });
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
    await stateTransaction(database, [STATE_STORES.meta], 'readwrite', (tx) => {
      const store = tx.objectStore(STATE_STORES.meta);
      const request = store.get('active-session') as IDBRequest<ActiveSession | undefined>;
      return afterIndexedRequests(tx, [request as unknown as IDBRequest<unknown>], ([value]) => {
        const session = value as ActiveSession | undefined;
        if (session?.accountId === accountId && session.sessionEpoch === expectedEpoch) store.delete('active-session');
      });
    });
  }

  async snapshot(accountId: string, key: string, requireOwnership = false): Promise<{ value: string | null; revision: number; confirmedVersion: number }> {
    requireOwnedKey(accountId, key);
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.values, STATE_STORES.meta], 'readonly', async (tx) => {
      const ownerRequest = indexedRequest(tx.objectStore(STATE_STORES.meta).get(outboxKeyOwnerId(key))) as Promise<{ accountId: string } | undefined>;
      const valueRequest = indexedRequest(tx.objectStore(STATE_STORES.values).get(key)) as Promise<{ value: string; accountId?: string } | undefined>;
      const metaRequest = indexedRequest(tx.objectStore(STATE_STORES.meta).get(keyStateId(accountId, key))) as Promise<KeyState | undefined>;
      const [owner, value, meta] = await Promise.all([ownerRequest, valueRequest, metaRequest]);
      if (owner && owner.accountId !== accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
      if (value?.accountId && value.accountId !== accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
      if (requireOwnership && value && (value.accountId !== accountId || owner?.accountId !== accountId)) throw new Error('OUTBOX_KEY_OWNERSHIP');
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
    return stateTransaction(database, [STATE_STORES.values, STATE_STORES.outbox, STATE_STORES.meta], 'readwrite', (tx) => {
      const metaStore = tx.objectStore(STATE_STORES.meta);
      const reads: IDBRequest<unknown>[] = [];
      const indices: Record<string, number> = Object.create(null) as Record<string, number>;
      const queueRead = <T>(name: string, request: IDBRequest<T>): void => {
        indices[name] = reads.length;
        reads.push(request as unknown as IDBRequest<unknown>);
      };
      if (expectedSessionEpoch) {
        queueRead('active', metaStore.get('active-session'));
        if (expectedAuthFence !== undefined) queueRead('fence', metaStore.get('auth-fence'));
      }
      queueRead('owner', metaStore.get(outboxKeyOwnerId(key)));
      const id = keyStateId(accountId, key);
      queueRead('meta', metaStore.get(id));
      queueRead('operations', tx.objectStore(STATE_STORES.outbox).index('accountKey').getAll([accountId, key]));
      queueRead('existing', tx.objectStore(STATE_STORES.values).get(key));

      return afterIndexedRequests(tx, reads, (results) => {
        const read = <T>(name: string): T => results[indices[name]] as T;
        if (expectedSessionEpoch) {
          const active = read<ActiveOutboxSession | undefined>('active');
          if (active?.accountId !== accountId || active.sessionEpoch !== expectedSessionEpoch || active.pause) return false;
          if (expectedAuthFence !== undefined) {
            const fence = read<{ revision: number } | undefined>('fence');
            if ((fence?.revision ?? 0) !== expectedAuthFence) return false;
          }
        }
        const owner = read<{ accountId: string } | undefined>('owner');
        if (owner && owner.accountId !== accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
        const meta = read<KeyState | undefined>('meta');
        const operations = read<OutboxOperation[]>('operations');
        if (operations.length || (meta?.valueRevision ?? 0) !== expectedRevision
          || observation.version < (meta?.confirmedVersion ?? 0)) return false;
        const values = tx.objectStore(STATE_STORES.values);
        const existing = read<{ value: string; accountId?: string } | undefined>('existing');
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

  /** Resolve all variants of one key only after the current account proof and UI snapshot still match. */
  async resolveConflictGroup(input: {
    accountId: string; key: string; expectedOpIds: readonly string[];
    choice: 'keep-latest-local' | 'accept-server'; readGuard: OutboxReadGuard; nowMs: number;
  }): Promise<boolean> {
    requireOwnedKey(input.accountId, input.key);
    if (!finiteInteger(input.nowMs) || input.readGuard.accountId !== input.accountId
      || !input.readGuard.sessionEpoch || !/^[a-f0-9]{64}$/.test(input.readGuard.serverSessionId)
      || !finiteInteger(input.readGuard.authFence) || !['keep-latest-local', 'accept-server'].includes(input.choice)
      || input.expectedOpIds.length === 0 || input.expectedOpIds.some((id) => typeof id !== 'string' || !id)
      || new Set(input.expectedOpIds).size !== input.expectedOpIds.length) throw new Error('OUTBOX_INVALID_RECOVERY_REQUEST');
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.values, STATE_STORES.outbox, STATE_STORES.meta], 'readwrite', (tx) => {
      const metaStore = tx.objectStore(STATE_STORES.meta);
      const outbox = tx.objectStore(STATE_STORES.outbox);
      const activeRequest = metaStore.get('active-session');
      const fenceRequest = metaStore.get('auth-fence');
      const ownerRequest = metaStore.get(outboxKeyOwnerId(input.key));
      const valueRequest = tx.objectStore(STATE_STORES.values).get(input.key);
      const metaRequest = metaStore.get(keyStateId(input.accountId, input.key));
      const operationsRequest = outbox.index('accountKey').getAll([input.accountId, input.key]);
      return afterIndexedRequests(tx, [
        activeRequest as unknown as IDBRequest<unknown>,
        fenceRequest as unknown as IDBRequest<unknown>,
        ownerRequest as unknown as IDBRequest<unknown>,
        valueRequest as unknown as IDBRequest<unknown>,
        metaRequest as unknown as IDBRequest<unknown>,
        operationsRequest as unknown as IDBRequest<unknown>,
      ], ([activeValue, fenceValue, ownerValue, valueValue, metaValue, operationsValue]) => {
        const active = activeValue as ActiveOutboxSession | undefined;
        const fence = fenceValue as { revision: number } | undefined;
        const owner = ownerValue as { accountId: string } | undefined;
        const value = valueValue as { value: string; accountId?: string } | undefined;
        const meta = metaValue as KeyState | undefined;
        const operations = operationsValue as OutboxOperation[];
        const guard = input.readGuard;
        if (active?.accountId !== input.accountId || active.serverSessionId !== guard.serverSessionId
          || active.sessionEpoch !== guard.sessionEpoch || active.pause || (fence?.revision ?? 0) !== guard.authFence) return false;
        if (owner && owner.accountId !== input.accountId || value?.accountId && value.accountId !== input.accountId) throw new Error('OUTBOX_KEY_OWNERSHIP');
        operations.sort((left, right) => left.revision - right.revision || left.createdAtMs - right.createdAtMs || left.opId.localeCompare(right.opId));
        const expected = new Set(input.expectedOpIds);
        if (operations.length !== expected.size || operations.some((operation) => !expected.has(operation.opId))
          || !operations.some((operation) => operation.status === 'conflicted')
          || operations.some((operation) => operation.status === 'sending' || hasLegacyProvenance(operation))) return false;
        const resources = new Set(operations.map((operation) => operation.resource ?? 'state'));
        if (resources.size !== 1 || !meta || !finiteInteger(meta.lastRevision) || !finiteInteger(meta.valueRevision)
          || !finiteInteger(meta.confirmedVersion) || !finiteInteger(meta.lastRevision + 1)) return false;
        const conflicts = operations.filter((operation) => operation.status === 'conflicted');
        const snapshots = conflicts.map((operation) => conflictServerSnapshot(input.accountId, operation))
          .filter((snapshot): snapshot is ConflictServerSnapshot => snapshot !== undefined)
          .sort((left, right) => right.version - left.version);
        const snapshot = snapshots[0];
        if (conflicts.some((operation) => operation.reason === 'server-version-conflict') && !snapshot) return false;
        if (snapshot && snapshot.version < meta.confirmedVersion) return false;

        const values = tx.objectStore(STATE_STORES.values);
        if (input.choice === 'accept-server') {
          if (!snapshot) return false;
          if (snapshot.exists) values.put({ key: input.key, accountId: input.accountId, value: snapshot.value, updatedAt: input.nowMs });
          else values.delete(input.key);
          for (const operation of operations) outbox.delete(operation.opId);
          const resolvedMeta: KeyState = { ...meta, lastRevision: meta.lastRevision + 1,
            valueRevision: meta.lastRevision + 1, confirmedVersion: snapshot.version };
          delete resolvedMeta.headOpId;
          metaStore.put(resolvedMeta);
          metaStore.put({ id: outboxKeyOwnerId(input.key), key: input.key, accountId: input.accountId });
          return true;
        }

        const latest = operations[operations.length - 1];
        if (!latest || !validResolvedLocalIntent(input.accountId, input.key, latest)) return false;
        const baseVersion = snapshot?.version ?? meta.confirmedVersion;
        const revision = meta.lastRevision + 1;
        const operation: OutboxOperation = {
          ...(latest.type === 'put' ? { type: 'put' as const, key: input.key, value: latest.value } : { type: 'delete' as const, key: input.key }),
          ...(latest.resource ? { resource: latest.resource } : {}),
          opId: crypto.randomUUID(), accountId: input.accountId, writerId: `manual-resolution:${crypto.randomUUID()}`,
          revision, baseVersion, status: 'pending', retryCount: 0, nextAttemptAtMs: input.nowMs,
          createdAtMs: input.nowMs, updatedAtMs: input.nowMs,
        };
        for (const previous of operations) outbox.delete(previous.opId);
        if (operation.type === 'put') values.put({ key: input.key, accountId: input.accountId, value: operation.value, updatedAt: input.nowMs });
        else values.delete(input.key);
        outbox.add(operation);
        metaStore.put({ ...meta, lastRevision: revision, valueRevision: revision, confirmedVersion: baseVersion, headOpId: operation.opId });
        metaStore.put({ id: outboxKeyOwnerId(input.key), key: input.key, accountId: input.accountId });
        return true;
      });
    });
  }

  /** A user retry starts a new bounded retry window without altering the saved payload. */
  async retryFailedGroup(input: {
    accountId: string; key: string; expectedOpIds: readonly string[]; readGuard: OutboxReadGuard; nowMs: number;
  }): Promise<boolean> {
    requireOwnedKey(input.accountId, input.key);
    if (!finiteInteger(input.nowMs) || input.readGuard.accountId !== input.accountId
      || !input.readGuard.sessionEpoch || !/^[a-f0-9]{64}$/.test(input.readGuard.serverSessionId)
      || !finiteInteger(input.readGuard.authFence) || input.expectedOpIds.length === 0
      || input.expectedOpIds.some((id) => typeof id !== 'string' || !id)
      || new Set(input.expectedOpIds).size !== input.expectedOpIds.length) throw new Error('OUTBOX_INVALID_RECOVERY_REQUEST');
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.outbox, STATE_STORES.meta], 'readwrite', (tx) => {
      const meta = tx.objectStore(STATE_STORES.meta);
      const outbox = tx.objectStore(STATE_STORES.outbox);
      const activeRequest = meta.get('active-session');
      const fenceRequest = meta.get('auth-fence');
      const operationsRequest = outbox.index('accountKey').getAll([input.accountId, input.key]);
      return afterIndexedRequests(tx, [
        activeRequest as unknown as IDBRequest<unknown>,
        fenceRequest as unknown as IDBRequest<unknown>,
        operationsRequest as unknown as IDBRequest<unknown>,
      ], ([activeValue, fenceValue, operationsValue]) => {
        const active = activeValue as ActiveOutboxSession | undefined;
        const fence = fenceValue as { revision: number } | undefined;
        const operations = operationsValue as OutboxOperation[];
        const guard = input.readGuard;
        if (active?.accountId !== input.accountId || active.serverSessionId !== guard.serverSessionId
          || active.sessionEpoch !== guard.sessionEpoch || active.pause || (fence?.revision ?? 0) !== guard.authFence) return false;
        const expected = new Set(input.expectedOpIds);
        if (operations.length !== expected.size || operations.some((operation) => !expected.has(operation.opId))
          || !operations.some((operation) => operation.status === 'failed')
          || operations.some((operation) => operation.status === 'conflicted' || operation.status === 'sending'
            || hasLegacyProvenance(operation))) return false;
        for (const operation of operations) {
          if (operation.status !== 'failed') continue;
          const retry: OutboxOperation = { ...operation, status: 'pending', retryCount: 0, nextAttemptAtMs: input.nowMs, updatedAtMs: input.nowMs };
          delete retry.reason;
          delete retry.attempt;
          outbox.put(retry);
        }
        return true;
      });
    });
  }

  async claim(input: { accountId: string; sessionEpoch: string; owner: string; nowMs: number; leaseMs: number }): Promise<OutboxClaim | null> {
    requireText(input.accountId); requireText(input.sessionEpoch); requireText(input.owner);
    if (!finiteInteger(input.nowMs) || !finiteInteger(input.leaseMs) || input.leaseMs === 0) throw new Error('OUTBOX_INVALID_LEASE');
    const attemptId = crypto.randomUUID();
    const deletionMarkerId = await legacyDeletedAccountMetaId(input.accountId);
    const database = await this.connection.open();
    return stateTransaction(database, [STATE_STORES.outbox, STATE_STORES.meta, STATE_STORES.migrationItems], 'readwrite', (tx) => {
      const metaStore = tx.objectStore(STATE_STORES.meta);
      const store = tx.objectStore(STATE_STORES.outbox);
      const sessionRequest = metaStore.get('active-session') as IDBRequest<ActiveSession | undefined>;
      const operationsRequest = store.index('accountId').getAll(input.accountId) as IDBRequest<OutboxOperation[]>;
      return afterIndexedRequests(tx, [
        sessionRequest as unknown as IDBRequest<unknown>,
        operationsRequest as unknown as IDBRequest<unknown>,
      ], ([sessionValue, operationsValue]) => {
        const session = sessionValue as ActiveSession | undefined;
        const operations = operationsValue as OutboxOperation[];
        if (session?.accountId !== input.accountId || session.sessionEpoch !== input.sessionEpoch || session.pause) return null;
        // Revisions define per-key order even if the wall clock moves backwards.
        operations.sort((a, b) => a.revision - b.revision || a.createdAtMs - b.createdAtMs || a.opId.localeCompare(b.opId));
        const heads: OutboxOperation[] = [];
        const seenKeys = new Set<string>();
        for (const operation of operations) {
          if (seenKeys.has(operation.key)) continue;
          seenKeys.add(operation.key);
          heads.push(operation);
        }

        const claimOperation = (operation: OutboxOperation): OutboxClaim | null => {
          if (operation.status === 'sending') {
            if (!operation.attempt || (operation.attempt.sessionEpoch === input.sessionEpoch && input.nowMs - operation.attempt.startedAtMs < input.leaseMs)) return null;
          } else if (operation.status !== 'pending' || operation.nextAttemptAtMs > input.nowMs) return null;
          const legacy = !!(operation.migrationSourceKey || operation.migrationFingerprint || operation.migrationCanonical);
          const claim: OutboxClaim = {
            ...operation, status: 'sending', updatedAtMs: input.nowMs,
            retryCount: operation.retryCount + (operation.status === 'sending' ? 1 : 0),
            attempt: {
              attemptId, owner: input.owner, sessionEpoch: input.sessionEpoch, startedAtMs: input.nowMs,
              ...(legacy ? { deletedAccountMarkerId: deletionMarkerId } : {}),
            },
          };
          store.put(claim);
          return claim;
        };

        const findClaim = (
          startAt: number,
          legacyState?: { accountDeleted: boolean; gate: LegacyGate | undefined },
        ): OutboxClaim | null | Promise<OutboxClaim | null> => {
          for (let index = startAt; index < heads.length; index += 1) {
            const operation = heads[index];
            const legacy = !!(operation.migrationSourceKey || operation.migrationFingerprint || operation.migrationCanonical);
            if (!legacy) {
              const claim = claimOperation(operation);
              if (claim) return claim;
              continue;
            }
            if (legacyState?.accountDeleted || (legacyState && (legacyState.gate?.sendAllowed !== true
              || legacyState.gate.sourceKey !== LEGACY_QUEUE_SOURCE_KEY))) continue;

            const receiptRequest = tx.objectStore(STATE_STORES.migrationItems)
              .get(legacyMigrationItemId(operation.migrationFingerprint ?? ''));
            const requests: IDBRequest<unknown>[] = legacyState
              ? [receiptRequest]
              : [
                metaStore.get(deletionMarkerId),
                metaStore.get(LEGACY_MIGRATION_META_ID),
                receiptRequest,
              ];
            return afterIndexedRequests(tx, requests, (results) => {
              const state = legacyState ?? {
                accountDeleted: ((results[0] as { kind?: unknown; version?: unknown } | undefined)?.kind === 'legacy-deleted-account'
                  && (results[0] as { kind?: unknown; version?: unknown } | undefined)?.version === 1),
                gate: results[1] as LegacyGate | undefined,
              };
              const receipt = results[legacyState ? 0 : 2] as LegacyReceipt | undefined;
              if (!state.accountDeleted && canSendLegacy(operation, state.gate, receipt)) {
                const claim = claimOperation(operation);
                if (claim) return claim;
              }
              return findClaim(index + 1, state);
            });
          }
          return null;
        };

        // Queue dependent reads and the claim write from request success events.
        // Legacy receipt reads are sequential to avoid work proportional to the
        // entire imported queue on every sender claim.
        return findClaim(0);
      });
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
    return stateTransaction(database, [STATE_STORES.outbox, STATE_STORES.meta, STATE_STORES.migrationItems], 'readwrite', (tx) => {
      const store = tx.objectStore(STATE_STORES.outbox);
      const metaStore = tx.objectStore(STATE_STORES.meta);
      const requests: IDBRequest<unknown>[] = [];
      const requestIndices: Record<string, number> = Object.create(null) as Record<string, number>;
      const queueRead = <T>(name: string, request: IDBRequest<T>): void => {
        requestIndices[name] = requests.length;
        requests.push(request as unknown as IDBRequest<unknown>);
      };
      queueRead('current', store.get(claim.opId));
      queueRead('session', metaStore.get('active-session'));
      if (outcome.kind === 'retry' && outcome.pause) queueRead('fence', metaStore.get('auth-fence'));
      const isLegacyClaim = !!(claim.migrationSourceKey || claim.migrationFingerprint || claim.migrationCanonical);
      if (isLegacyClaim) {
        queueRead('gate', metaStore.get(LEGACY_MIGRATION_META_ID));
        queueRead('receipt', tx.objectStore(STATE_STORES.migrationItems).get(legacyMigrationItemId(claim.migrationFingerprint ?? '')));
      }
      if (deletionMarkerId) queueRead('deletionMarker', metaStore.get(deletionMarkerId));
      if (outcome.kind === 'acknowledged') {
        queueRead('ackMeta', metaStore.get(keyStateId(claim.accountId, claim.key)));
        queueRead('ackSiblings', store.index('accountKey').getAll([claim.accountId, claim.key]));
      }

      // Perform dependent writes inside the last request's success event. Some
      // Firefox builds can deactivate a transaction before an async Promise.all
      // continuation resumes, even when all reads were queued up front.
      return new Promise<boolean>((resolve, reject) => {
        const results: unknown[] = new Array(requests.length);
        let remaining = requests.length;
        let settled = false;
        requests.forEach((request, index) => {
          request.addEventListener('success', () => {
            if (settled) return;
            results[index] = request.result;
            remaining -= 1;
            if (remaining !== 0) return;
            settled = true;
            const read = <T>(name: string, fallback: T): T => {
              const resultIndex = requestIndices[name];
              return resultIndex === undefined ? fallback : results[resultIndex] as T;
            };
            try {
              const current = read<OutboxOperation | undefined>('current', undefined);
              const session = read<ActiveSession | undefined>('session', undefined);
              const fence = read<{ revision: number } | undefined>('fence', undefined);
              const gate = read<LegacyGate | undefined>('gate', undefined);
              const receipt = read<LegacyReceipt | undefined>('receipt', undefined);
              const deletionMarker = read<{ kind?: unknown; version?: unknown } | undefined>('deletionMarker', undefined);
              const ackMeta = read<KeyState | undefined>('ackMeta', undefined);
              const ackSiblings = read<OutboxOperation[]>('ackSiblings', []);
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
                || session?.accountId !== claim.accountId || session.sessionEpoch !== claim.attempt.sessionEpoch || session.pause) {
                resolve(false);
                return;
              }
              if (current.migrationSourceKey || current.migrationFingerprint || current.migrationCanonical) {
                if (deletionMarker?.kind === 'legacy-deleted-account' && deletionMarker.version === 1) {
                  resolve(false);
                  return;
                }
                if (!canSendLegacy(current, gate, receipt)) {
                  resolve(false);
                  return;
                }
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
              resolve(true);
            } catch (error) {
              reject(error);
            }
          }, { once: true });
          request.addEventListener('error', () => {
            if (settled) return;
            settled = true;
            reject(request.error ?? new StateStorageError('transaction'));
          }, { once: true });
        });
      });
    });
  }
}
