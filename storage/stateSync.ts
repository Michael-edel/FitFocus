import { isRecord } from '../safeJson';
import { DurableOutbox, legacyRecoveryResource, type ActiveOutboxSession, type OutboxClaim, type OutboxOutcome,
  type OutboxIntent, type OutboxReadGuard } from './durableOutbox';
import { reportStateLegacyMigrationNotice, reportStateOperation, reportStateQueue, reportStateSaveIssue, reportStateSyncPause, subscribeStateSaveIssues } from './stateSaveStatus';
import { LEGACY_QUEUE_SOURCE_KEY, normalizeLegacyRecord } from './legacyQueue';
import { LegacyQueueMigration } from './legacyMigration';
import { checkLegacyWriterFence, type LegacyWriterFenceProof } from './legacyWriterFence';
import { isUserProfilePayload } from '../profileValidation';
import { familyMenuStorageKey, isFamilyMenuIntent, isFamilyMenuSnapshot } from '../familyMenuValidation';
import { USER_STATE_KEYS, type UserStateKey } from './userStateRepository';

import { requestJson, type JsonResponse } from './sessionTransport';
type Options = {
  outbox?: DurableOutbox;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  timeoutMs?: number;
  legacyPending?: () => boolean;
  legacyRuntime?: boolean;
  legacyMigration?: LegacyQueueMigration;
  legacySource?: Pick<Storage, 'getItem'>;
  verifyLegacyWritersStopped?: () => Promise<LegacyWriterFenceProof | null>;
};
const LEASE_MS = 30_000;
const MAX_RETRIES = 8;
const MAX_RETRY_DELAY_MS = 15 * 60_000;
function profileIntent(claim: OutboxClaim): unknown {
  if (claim.resource !== 'profile' || claim.type !== 'put') return null;
  try { return JSON.parse(claim.value); } catch { return null; }
}

/** Fallback for sender instances that do not own the runtime migration. */
function legacySourceHasPendingRecords(): boolean {
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_SOURCE_KEY);
    if (raw === null) return false;
    const records: unknown = JSON.parse(raw);
    return !Array.isArray(records) || records.length > 0;
  } catch { return true; }
}

function verifiedLegacyOwners(rawSource: string | null, authenticatedAccountId: string): ReadonlyMap<string, readonly string[]> {
  const owners = new Map<string, readonly string[]>();
  if (rawSource === null) return owners;
  let parsed: unknown;
  try { parsed = JSON.parse(rawSource); } catch { return owners; }
  if (!Array.isArray(parsed)) return owners;
  const prefix = `fitfocus_data_${authenticatedAccountId}_`;
  for (const candidate of parsed) {
    const normalized = normalizeLegacyRecord(candidate);
    if (normalized.ok && normalized.value.key.startsWith(prefix)) owners.set(normalized.value.key, [authenticatedAccountId]);
  }
  return owners;
}

function managedLegacyStateKey(accountId: string, key: string): UserStateKey | null {
  const prefix = `fitfocus_data_${accountId}_`;
  if (!key.startsWith(prefix)) return null;
  const stateKey = key.slice(prefix.length);
  return USER_STATE_KEYS.includes(stateKey as typeof USER_STATE_KEYS[number]) ? stateKey as UserStateKey : null;
}

function legacySourceHasDelete(source: Pick<Storage, 'getItem'>, key: string): boolean {
  try {
    const raw = source.getItem(LEGACY_QUEUE_SOURCE_KEY);
    if (raw === null) return false;
    const records: unknown = JSON.parse(raw);
    return Array.isArray(records) && records.some((record) => {
      const normalized = normalizeLegacyRecord(record);
      return normalized.ok && normalized.value.type === 'delete' && normalized.value.key === key;
    });
  } catch {
    return false;
  }
}

export class StateSync {
  private readonly outbox: DurableOutbox;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly legacyPendingOverride?: () => boolean;
  private readonly legacyRuntime: boolean;
  private readonly legacyMigration?: LegacyQueueMigration;
  private readonly legacySource: Pick<Storage, 'getItem'>;
  private readonly verifyLegacyWritersStopped: () => Promise<LegacyWriterFenceProof | null>;
  private legacySourceSnapshot: string | null | undefined;
  private legacyFenceReady = false;
  private legacyFenceRetryAtMs = 0;
  private legacyFenceRetryDelayMs = 1_000;
  private readonly owner = crypto.randomUUID();
  private generation = 0;
  private accountId?: string;
  private session?: ActiveOutboxSession;
  // Keep the last accepted local-commit fence while /api/me is rechecked.
  // Storage events may arrive during that request and must not lose user edits.
  private lastLocalCommitSession?: ActiveOutboxSession;
  private readGuard?: OutboxReadGuard;
  private profileProtocol = false;
  private profileProjectionProtocol = false;
  private familyMenuProtocol = false;
  private readonly requests = new Set<AbortController>();
  private readonly readGuardListeners = new Set<(guard: OutboxReadGuard) => void>();
  private running?: Promise<void>;
  private verification?: { generation: number; promise: Promise<boolean> };
  private timer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;

  constructor(options: Options = {}) {
    this.outbox = options.outbox ?? new DurableOutbox();
    this.fetchFn = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.legacyPendingOverride = options.legacyPending;
    this.legacyRuntime = options.legacyRuntime === true;
    this.legacySource = options.legacySource ?? { getItem: (key) => {
      if (typeof localStorage === 'undefined') throw new Error('LEGACY_STORAGE_UNAVAILABLE');
      return localStorage.getItem(key);
    } };
    this.legacyMigration = options.legacyMigration ?? (this.legacyRuntime ? new LegacyQueueMigration(this.legacySource) : undefined);
    this.verifyLegacyWritersStopped = options.verifyLegacyWritersStopped ?? (async () => {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
      return checkLegacyWriterFence(navigator.serviceWorker, __FITFOCUS_BUILD_ID__);
    });
  }

  subscribeReadGuard(listener: (guard: OutboxReadGuard) => void): () => void {
    this.readGuardListeners.add(listener);
    return () => this.readGuardListeners.delete(listener);
  }

  private publishReadGuard(guard: OutboxReadGuard): void {
    for (const listener of this.readGuardListeners) {
      try { listener({ ...guard }); } catch {}
    }
  }

  private legacyPending(): boolean {
    if (!this.legacyRuntime) return (this.legacyPendingOverride ?? legacySourceHasPendingRecords)();
    if (!this.legacyFenceReady || this.legacySourceSnapshot === undefined) return true;
    try { return this.legacySource.getItem(LEGACY_QUEUE_SOURCE_KEY) !== this.legacySourceSnapshot; }
    catch { return true; }
  }

  private async migrateLegacyQueue(accountId: string, generation: number): Promise<boolean> {
    this.legacyFenceReady = false;
    this.legacySourceSnapshot = undefined;
    if (!this.legacyRuntime) return true;
    if (!this.legacyMigration) return false;
    let sourceSnapshot: string | null;
    try { sourceSnapshot = this.legacySource.getItem(LEGACY_QUEUE_SOURCE_KEY); }
    catch { reportStateSyncPause(accountId, 'legacy'); return false; }
    try {
      const progress = await this.legacyMigration.migrate({
        verifiedOwners: verifiedLegacyOwners(sourceSnapshot, accountId),
        verifyWritersStopped: this.verifyLegacyWritersStopped,
      });
      let currentSource: string | null | undefined;
      try { currentSource = this.legacySource.getItem(LEGACY_QUEUE_SOURCE_KEY); }
      catch { currentSource = undefined; }
      const ready = progress.sendAllowed && progress.sourceMatches && currentSource === sourceSnapshot;
      const quarantinedRecords = progress.status === 'partial'
        ? (await this.legacyMigration.unknown()).filter((record) => !record.resolved).length
        : 0;
      reportStateLegacyMigrationNotice(accountId, quarantinedRecords);
      if (generation === this.generation && this.accountId === accountId) {
        this.legacyFenceReady = ready;
        this.legacySourceSnapshot = ready ? sourceSnapshot : undefined;
      }
      reportStateSyncPause(accountId, ready ? null : 'legacy');
      return ready;
    } catch {
      reportStateSyncPause(accountId, 'legacy');
      return false;
    }
  }

  stop(): void {
    this.generation += 1;
    this.accountId = undefined; this.session = undefined;
    this.lastLocalCommitSession = undefined;
    this.readGuard = undefined;
    this.legacyFenceReady = false;
    this.legacyFenceRetryAtMs = 0;
    this.legacyFenceRetryDelayMs = 1_000;
    this.legacySourceSnapshot = undefined;
    this.profileProtocol = false;
    this.profileProjectionProtocol = false;
    this.familyMenuProtocol = false;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.unsubscribe?.(); this.unsubscribe = undefined;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.reverify);
      window.removeEventListener('focus', this.reverify);
      window.removeEventListener('storage', this.legacySourceChanged);
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('controllerchange', this.reverify);
    }
  }

  async invalidate(): Promise<void> { this.stop(); await this.outbox.invalidateSessions(); }

  async connect(accountId: string): Promise<boolean> {
    this.stop(); this.accountId = accountId;
    return this.verify(this.generation);
  }

  /** Profile actions may request a flush, never create raw state writes or switch the active account. */
  async syncNow(accountId: string): Promise<boolean> {
    if (this.accountId !== accountId) return false;
    const generation = this.generation;
    if (!await this.verify(generation)) return false;
    return this.drainAndCheck(accountId, generation);
  }

  /** Explicitly rebase the latest local snapshot or accept a checked server snapshot for one key. */
  async resolveConflictedKey(accountId: string, key: string, expectedOpIds: readonly string[], choice: 'keep-latest-local' | 'accept-server'): Promise<boolean> {
    if (this.accountId !== accountId) return false;
    const generation = this.generation;
    if (!await this.verify(generation) || generation !== this.generation || this.accountId !== accountId || !this.readGuard) return false;
    const guard = { ...this.readGuard };
    const resolved = await this.outbox.resolveConflictGroup({
      accountId, key, expectedOpIds: [...expectedOpIds], choice, readGuard: guard, nowMs: this.now(),
    });
    if (!resolved) {
      reportStateQueue(accountId, await this.outbox.list(accountId));
      return false;
    }
    reportStateQueue(accountId, await this.outbox.list(accountId));
    if (choice === 'keep-latest-local' && generation === this.generation && this.accountId === accountId) await this.flush();
    return true;
  }

  /** A legacy operation has no trusted generation; an explicit action first reads the exact server key. */
  async resolveLegacyConflictedKey(accountId: string, key: string, expectedOpIds: readonly string[], choice: 'keep-latest-local' | 'accept-server'): Promise<boolean> {
    const resource = legacyRecoveryResource(accountId, key);
    if (this.accountId !== accountId || !resource) return false;
    const generation = this.generation;
    if (!await this.verify(generation) || generation !== this.generation || this.accountId !== accountId || !this.readGuard || !this.session?.serverSessionId) return false;
    const guard = { ...this.readGuard };
    const serverSessionId = this.session.serverSessionId;
    const controller = new AbortController();
    this.requests.add(controller);
    let snapshot: { value: string; version: number; exists: boolean } | undefined;
    try {
      if (resource === 'profile') {
        if (!this.profileProtocol || !this.profileProjectionProtocol) return false;
        const { response, body } = await requestJson(this.fetchFn, '/api/profile', { headers: {
          'X-FitFocus-State-Account': accountId, 'X-FitFocus-State-Session': serverSessionId,
        } }, controller, this.timeoutMs);
        const profile = body?.profile;
        if (generation !== this.generation || this.accountId !== accountId || this.session?.serverSessionId !== serverSessionId
          || this.readGuard?.sessionEpoch !== guard.sessionEpoch || this.readGuard.authFence !== guard.authFence
          || !response.ok || !this.profileScope(response, accountId, serverSessionId) || !isUserProfilePayload(profile)
          || profile.id !== accountId || typeof profile.version !== 'number' || !Number.isSafeInteger(profile.version) || profile.version < 1) return false;
        snapshot = { value: JSON.stringify(profile), version: profile.version, exists: true };
      } else {
        const prefix = `fitfocus_data_${accountId}_`;
        const query = new URLSearchParams({ prefix, includeDeleted: '1' });
        const { response, body } = await requestJson(this.fetchFn, `/api/state?${query}`, { headers: {
          'X-FitFocus-State-Account': accountId, 'X-FitFocus-State-Session': serverSessionId,
        } }, controller, this.timeoutMs);
        if (generation !== this.generation || this.accountId !== accountId || this.session?.serverSessionId !== serverSessionId
          || this.readGuard?.sessionEpoch !== guard.sessionEpoch || this.readGuard.authFence !== guard.authFence
          || !response.ok || !this.stateScope(response, accountId, serverSessionId) || !Array.isArray(body?.items)) return false;
        const matches = body.items.filter((item) => isRecord(item) && item.key === key);
        if (matches.length > 1) return false;
        if (matches.length === 0) snapshot = { value: '', version: 0, exists: false };
        else {
          const item = matches[0] as Record<string, unknown>;
          if (typeof item.value !== 'string' || typeof item.exists !== 'boolean'
            || typeof item.version !== 'number' || !Number.isSafeInteger(item.version) || item.version < 0
            || (item.exists && item.version < 1) || (!item.exists && item.value !== '')) return false;
          snapshot = { value: item.value, version: item.version, exists: item.exists };
        }
      }
    } catch {
      return false;
    } finally {
      this.requests.delete(controller);
    }
    if (!snapshot || generation !== this.generation || this.accountId !== accountId || this.session?.serverSessionId !== serverSessionId
      || this.readGuard?.sessionEpoch !== guard.sessionEpoch || this.readGuard.authFence !== guard.authFence) return false;
    const resolved = await this.outbox.resolveLegacyConflictGroup({
      accountId, key, expectedOpIds: [...expectedOpIds], choice, resource, readGuard: guard, nowMs: this.now(), serverSnapshot: snapshot,
    });
    if (!resolved) {
      reportStateQueue(accountId, await this.outbox.list(accountId));
      return false;
    }
    reportStateQueue(accountId, await this.outbox.list(accountId));
    if (choice === 'keep-latest-local' && generation === this.generation && this.accountId === accountId) await this.flush();
    return true;
  }

  /** A user retry resets only failed attempts for this key, then runs the usual bounded sender. */
  async retryFailedKey(accountId: string, key: string, expectedOpIds: readonly string[]): Promise<boolean> {
    if (this.accountId !== accountId) return false;
    const generation = this.generation;
    if (!await this.verify(generation) || generation !== this.generation || this.accountId !== accountId || !this.readGuard) return false;
    const guard = { ...this.readGuard };
    const retried = await this.outbox.retryFailedGroup({
      accountId, key, expectedOpIds: [...expectedOpIds], readGuard: guard, nowMs: this.now(),
    });
    if (!retried) {
      reportStateQueue(accountId, await this.outbox.list(accountId));
      return false;
    }
    reportStateQueue(accountId, await this.outbox.list(accountId));
    if (generation === this.generation && this.accountId === accountId) await this.flush();
    return true;
  }

  /** Automatic edits wake the existing session; a debounce must not obtain proof or clear an auth pause. */
  flushPending(accountId: string): Promise<boolean> {
    return this.drainAndCheck(accountId, this.generation);
  }

  private async drainAndCheck(accountId: string, generation: number): Promise<boolean> {
    if (generation !== this.generation || this.accountId !== accountId) return false;
    const sessionEpoch = this.session?.sessionEpoch;
    if (!sessionEpoch) return false;
    await this.flush();
    if (generation !== this.generation || this.accountId !== accountId) return false;
    const drained = await this.outbox.isDrained(accountId, sessionEpoch);
    return generation === this.generation && this.accountId === accountId && sessionEpoch === this.session?.sessionEpoch
      && !this.legacyPending() && drained;
  }

  /** Return the exact read guard whose proof and transaction accepted the profile snapshot. */
  async refreshProfileWithGuard(accountId: string): Promise<{ value: string; readGuard: OutboxReadGuard } | null> {
    if (this.accountId !== accountId) return null;
    const generation = this.generation;
    if (!await this.verify(generation) || !this.profileProtocol || !this.session || !this.readGuard) return null;
    const session = this.session;
    const guard = this.readGuard;
    const key = `fitfocus_data_${accountId}_profile`;
    const observed = await this.outbox.snapshot(accountId, key);
    if (generation !== this.generation) return null;
    const controller = new AbortController(); this.requests.add(controller);
    try {
      const { response, body } = await requestJson(this.fetchFn, '/api/profile', { headers: {
        'X-FitFocus-State-Account': accountId, 'X-FitFocus-State-Session': session.serverSessionId!,
      } }, controller, this.timeoutMs);
      if (generation !== this.generation || !response.ok || !this.profileScope(response, accountId, session.serverSessionId!)
        || !isUserProfilePayload(body?.profile) || body.profile.id !== accountId
        || typeof body.profile.version !== 'number' || !Number.isSafeInteger(body.profile.version) || body.profile.version < 1) return null;
      const raw = JSON.stringify(body.profile);
      const applied = await this.outbox.hydrate(accountId, key, { value: raw, version: body.profile.version, exists: true }, observed.revision, session.sessionEpoch, guard.authFence);
      return generation === this.generation && applied ? { value: raw, readGuard: { ...guard } } : null;
    } finally { this.requests.delete(controller); }
  }

  start(accountId: string): void {
    const connecting = this.connect(accountId);
    const generation = this.generation;
    void connecting.then(() => this.wake()).catch(() => { if (generation === this.generation) this.storageError(accountId); });
    this.unsubscribe = subscribeStateSaveIssues(this.wake);
    // Polling also observes commits from tabs that do not have BroadcastChannel/Web Locks.
    this.timer = setInterval(this.wake, 1_000);
    window.addEventListener('online', this.reverify);
    window.addEventListener('focus', this.reverify);
    window.addEventListener('storage', this.legacySourceChanged);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', this.reverify);
    }
  }

  private storageError(accountId: string): void {
    this.stop();
    reportStateSaveIssue({ accountId, key: `fitfocus_data_${accountId}_sync`, kind: 'error', reason: 'storage' });
  }

  private readonly reverify = () => {
    const generation = this.generation;
    const accountId = this.accountId;
    if (accountId) void this.verify(generation).then(() => this.wake()).catch(() => { if (generation === this.generation) this.storageError(accountId); });
  };

  private readonly legacySourceChanged = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.key === null || storageEvent.key === LEGACY_QUEUE_SOURCE_KEY) {
      this.reverify();
      return;
    }
    if (!this.legacyRuntime) return;
    const accountId = this.accountId;
    const key = storageEvent.key;
    if (!accountId || !managedLegacyStateKey(accountId, key)) return;
    if (typeof storageEvent.newValue === 'string') {
      void this.preserveLegacyLocalWrite(accountId, key, storageEvent.newValue);
      return;
    }
    if (storageEvent.newValue === null && typeof storageEvent.oldValue === 'string') {
      // When the old writer could persist its delete record, let the normal
      // migration path import that exact intent instead of creating a duplicate.
      if (legacySourceHasDelete(this.legacySource, key)) {
        void this.preserveQueuedLegacyDelete(accountId, key);
        return;
      }
      void this.preserveLegacyLocalDelete(accountId, key);
    }
  };

  /** Preserve a legacy tab's local-only edit without making it eligible for sending. */
  private preserveLegacyLocalWrite(accountId: string, key: string, value: string): Promise<void> {
    return this.preserveLegacyLocalIntent(accountId, key, { type: 'put', key, value });
  }

  /** Preserve a legacy localStorage removal when its auth-paused writer lost the delete record. */
  private preserveLegacyLocalDelete(accountId: string, key: string): Promise<void> {
    return this.preserveLegacyLocalIntent(accountId, key, { type: 'delete', key });
  }

  private async preserveLegacyLocalIntent(accountId: string, key: string, intent: OutboxIntent): Promise<void> {
    const session = this.session?.accountId === accountId ? this.session
      : this.lastLocalCommitSession?.accountId === accountId ? this.lastLocalCommitSession : undefined;
    const generation = this.generation;
    if (!session || session.accountId !== accountId || !session.serverSessionId) return;
    const readLegacyValue = (): string | null | undefined => {
      try { return this.legacySource.getItem(key); } catch { return undefined; }
    };
    const deleteStillCurrent = (): boolean => {
      const currentValue = readLegacyValue();
      return currentValue === null || currentValue === undefined;
    };
    try {
      if (intent.type === 'delete' && !deleteStillCurrent()) return;
      const observed = await this.outbox.snapshot(accountId, key);
      if (generation !== this.generation || accountId !== this.accountId
        || (this.session !== undefined && session.sessionEpoch !== this.session.sessionEpoch)
        || this.lastLocalCommitSession?.accountId !== accountId
        || this.lastLocalCommitSession?.sessionEpoch !== session.sessionEpoch
        || (intent.type === 'put' && observed.value === intent.value)) return;
      const operation = await this.outbox.write({
        accountId,
        writerId: 'legacy-local-storage',
        intent,
        expectedRevision: observed.revision,
        baseVersion: observed.confirmedVersion,
        conflictReason: 'legacy-writer-local-only',
        localCommitGuard: { accountId, sessionEpoch: session.sessionEpoch, serverSessionId: session.serverSessionId },
        canCommit: () => generation === this.generation && accountId === this.accountId
          && this.lastLocalCommitSession?.accountId === accountId
          && session.sessionEpoch === this.lastLocalCommitSession.sessionEpoch
          && (!this.session || session.sessionEpoch === this.session.sessionEpoch)
          && (intent.type !== 'delete' || deleteStillCurrent()),
      });
      if (generation !== this.generation || accountId !== this.accountId) return;
      reportStateOperation(accountId, operation);
      if (operation.status === 'conflicted') {
        reportStateSaveIssue({ accountId, key, kind: 'conflicted', reason: operation.reason ?? 'legacy-writer-local-only' });
      }
    } catch {
      if (intent.type === 'delete' && !deleteStillCurrent()) return;
      if (generation === this.generation && accountId === this.accountId) {
        reportStateSaveIssue({ accountId, key, kind: 'error', reason: 'legacy-writer-local-only' });
      }
    }
  }

  private async preserveQueuedLegacyDelete(accountId: string, key: string): Promise<void> {
    const generation = this.generation;
    try {
      if (!await this.verify(generation) || generation !== this.generation || accountId !== this.accountId) return;
      const latest = (await this.outbox.list(accountId))
        .filter((operation) => operation.key === key)
        .sort((left, right) => right.revision - left.revision)[0];
      if (latest?.type === 'delete' && (latest.migrationSourceKey === LEGACY_QUEUE_SOURCE_KEY
        || latest.writerId === 'legacy-local-storage')) return;
      // A pre-existing source delete can be stale if the auth-paused legacy
      // writer later changed the local value. Preserve the newer removal too.
      await this.preserveLegacyLocalDelete(accountId, key);
    } catch {
      // The legacy source remains durable and can be imported on a later verify.
    }
  }

  private readonly wake = () => {
    if (!this.accountId || this.running) return;
    const accountId = this.accountId;
    const generation = this.generation;
    void this.flush().catch(() => { if (generation === this.generation) this.storageError(accountId); });
  };

  private verify(generation: number): Promise<boolean> {
    if (this.verification?.generation === generation) return this.verification.promise;
    const promise = this.verifySession(generation).finally(() => {
      if (this.legacyRuntime && generation === this.generation) {
        if (this.legacyFenceReady) {
          this.legacyFenceRetryAtMs = 0;
          this.legacyFenceRetryDelayMs = 1_000;
        } else {
          this.legacyFenceRetryAtMs = this.now() + this.legacyFenceRetryDelayMs;
          this.legacyFenceRetryDelayMs = Math.min(this.legacyFenceRetryDelayMs * 2, 15_000);
        }
      }
      if (this.verification?.promise === promise) this.verification = undefined;
    });
    this.verification = { generation, promise };
    return promise;
  }

  private async verifySession(generation: number): Promise<boolean> {
    const accountId = this.accountId;
    if (!accountId) return false;
    if (this.legacyRuntime) {
      this.legacyFenceReady = false;
      this.legacySourceSnapshot = undefined;
    }
    this.session = undefined;
    this.readGuard = undefined;
    this.profileProtocol = false;
    this.profileProjectionProtocol = false;
    this.familyMenuProtocol = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = await this.outbox.sessionState();
      if (generation !== this.generation || accountId !== this.accountId) return false;
      const controller = new AbortController(); this.requests.add(controller);
      let result: JsonResponse;
      try { result = await requestJson(this.fetchFn, '/api/me', {}, controller, this.timeoutMs); }
      catch { if (generation === this.generation) reportStateSyncPause(accountId, 'auth'); return false; }
      finally { this.requests.delete(controller); }
      if (generation !== this.generation || accountId !== this.accountId) return false;
      const { response, body } = result;
      const proof = body?.stateSync;
      if (!response.ok || !isRecord(body?.user) || body.user.sub !== accountId) {
        reportStateSyncPause(accountId, 'auth'); return false;
      }
      if (body?.hasAccess !== true) { reportStateSyncPause(accountId, 'access'); return false; }
      if (!isRecord(proof) || proof.accountId !== accountId || proof.protocol !== 2 || proof.guard !== 1
        || typeof proof.sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(proof.sessionId)) {
        reportStateSyncPause(accountId, 'protocol'); return false;
      }
      const accepted = await this.outbox.acceptReadSession(accountId, proof.sessionId, before.fence);
      if (generation !== this.generation || accountId !== this.accountId) return false;
      if (accepted && await this.outbox.isReadSessionCurrent(accepted)) {
        if (generation !== this.generation || accountId !== this.accountId) return false;
        this.readGuard = accepted;
        this.session = { id: 'active-session', ...accepted };
        this.lastLocalCommitSession = this.session;
        this.publishReadGuard(accepted);
        this.profileProtocol = isRecord(body.profileSync) && body.profileSync.protocol === 1 && body.profileSync.guard === 1;
        this.profileProjectionProtocol = isRecord(body.profileSync) && body.profileSync.weeklyMenuProjection === 1;
        this.familyMenuProtocol = isRecord(body.familyMenuSync) && body.familyMenuSync.protocol === 1
          && body.familyMenuSync.guard === 1 && body.familyMenuSync.cas === 1;
        reportStateSyncPause(accountId, null);
        await this.migrateLegacyQueue(accountId, generation);
        if (generation !== this.generation || accountId !== this.accountId) return false;
        if (await this.outbox.isReadSessionCurrent(accepted)) return true;
        this.session = undefined;
        this.readGuard = undefined;
        // The all-client fence and migration await can overlap with another tab's
        // auth/session update. Never expose a stale read guard to hydration callers.
        continue;
      }
      // A competing proof changed the fence: obtain a new server observation, never adopt the old response.
    }
    reportStateSyncPause(accountId, 'auth');
    return false;
  }

  flush(): Promise<void> {
    if (this.running) return this.running;
    const generation = this.generation;
    this.running = this.drain(generation).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async drain(generation: number): Promise<void> {
    const accountId = this.accountId;
    if (!accountId) return;
    if (this.legacyRuntime && !this.legacyFenceReady) {
      const verification = this.verification;
      if (verification?.generation === generation) {
        if (!await verification.promise) return;
      } else {
        if (this.now() < this.legacyFenceRetryAtMs || !await this.verify(generation)) return;
      }
      if (generation !== this.generation || !this.legacyFenceReady) return;
    }
    try {
      for (let count = 0; count < 20 && generation === this.generation; count += 1) {
        const state = await this.outbox.sessionState();
        if (generation !== this.generation) return;
        if (state.active?.accountId === accountId && state.active.pause === 'legacy' && !this.legacyPending()) {
          if (await this.verify(generation)) continue;
          return;
        }
        if (state.active?.accountId === accountId && (state.active.pause || state.active.sessionEpoch === this.session?.sessionEpoch)) {
          reportStateSyncPause(accountId, state.active.pause ?? null);
        }
        if (!this.session || state.active?.sessionEpoch !== this.session.sessionEpoch || state.active.pause
          || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
        const session = this.session;
        const claim = await this.outbox.claim({ accountId, sessionEpoch: session.sessionEpoch, owner: this.owner, nowMs: this.now(), leaseMs: LEASE_MS });
        if (!claim || generation !== this.generation) return;
        if (this.legacyPending()) {
          await this.finish(claim, { kind: 'retry', reason: 'legacy-import-required', pause: 'legacy', nextAttemptAtMs: this.now() });
          continue;
        }
        if (claim.resource === 'profile' && (!this.profileProtocol || !this.profileProjectionProtocol)) {
          await this.finish(claim, { kind: 'retry', reason: 'profile-protocol-required', pause: 'protocol', nextAttemptAtMs: this.now() });
          continue;
        }
        if (claim.resource === 'familyMenu' && !this.familyMenuProtocol) {
          await this.finish(claim, { kind: 'retry', reason: 'family-menu-protocol-required', pause: 'protocol', nextAttemptAtMs: this.now() });
          continue;
        }
        const controller = new AbortController(); this.requests.add(controller);
        let outcome: OutboxOutcome;
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-FitFocus-State-Account': accountId,
            'X-FitFocus-State-Session': session.serverSessionId! };
          if (claim.resource !== 'profile' && claim.resource !== 'familyMenu') headers['X-FitFocus-State-Protocol'] = '2';
          const profile = profileIntent(claim);
          let family: unknown;
          if (claim.resource === 'familyMenu' && claim.type === 'put') { try { family = JSON.parse(claim.value); } catch {} }
          if (claim.resource === 'profile' && (!isUserProfilePayload(profile) || profile.id !== accountId || claim.key !== `fitfocus_data_${accountId}_profile`)) {
            outcome = { kind: 'failed', reason: 'invalid-profile-intent' };
          } else if (claim.resource === 'familyMenu' && (!isFamilyMenuIntent(family) || claim.key !== familyMenuStorageKey(accountId, family))) {
            outcome = { kind: 'failed', reason: 'invalid-family-menu-intent' };
          } else {
            const url = claim.resource === 'familyMenu' ? '/api/family/menu/state' : claim.resource === 'profile' ? '/api/profile' : claim.type === 'put' ? '/api/state' : `/api/state?key=${encodeURIComponent(claim.key)}&baseVersion=${claim.baseVersion}`;
            const init: RequestInit = claim.resource === 'familyMenu'
              ? { method: 'PUT', headers, body: JSON.stringify({ ...(family as Record<string, unknown>), baseVersion: claim.baseVersion }) }
              : claim.resource === 'profile'
              ? { method: 'PUT', headers, body: JSON.stringify({ ...(profile as Record<string, unknown>), baseVersion: claim.baseVersion }) }
              : claim.type === 'put'
                ? { method: 'PUT', headers, body: JSON.stringify({ items: [{ key: claim.key, value: claim.value, baseVersion: claim.baseVersion }] }) }
                : { method: 'DELETE', headers };
            const result = await requestJson(this.fetchFn, url, init, controller, this.timeoutMs);
            outcome = this.outcome(claim, result, session.serverSessionId!);
          }
        } catch { outcome = this.retry(claim, 'network-or-timeout'); }
        finally { this.requests.delete(controller); }
        if (generation !== this.generation) return;
        await this.finish(claim, outcome);
      }
    } finally {
      if (generation === this.generation) reportStateQueue(accountId, await this.outbox.list(accountId));
    }
  }

  private retry(claim: OutboxClaim, reason: string, retryAfter?: string | null): OutboxOutcome {
    if (claim.retryCount >= MAX_RETRIES - 1) return { kind: 'failed', reason: 'retry-exhausted' };
    const cap = Math.min(60_000, 1_000 * 2 ** Math.min(claim.retryCount, 6));
    const jitter = Math.max(250, Math.floor(cap * Math.max(0, Math.min(1, this.random()))));
    const seconds = retryAfter == null ? NaN : Number(retryAfter);
    const requested = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : Date.parse(retryAfter ?? '') - this.now();
    const delay = Math.min(MAX_RETRY_DELAY_MS, Math.max(jitter, Number.isFinite(requested) ? requested : 0));
    return { kind: 'retry', reason, nextAttemptAtMs: this.now() + delay };
  }

  private finish(claim: OutboxClaim, outcome: OutboxOutcome): Promise<boolean> {
    const nowMs = this.now();
    // An immediate pause may be computed a millisecond before finish; preserve its eligibility.
    const settled = outcome.kind === 'retry' ? { ...outcome, nextAttemptAtMs: Math.max(nowMs, outcome.nextAttemptAtMs) } : outcome;
    return this.outbox.finish(claim, settled, nowMs);
  }

  private outcome(claim: OutboxClaim, { response, body }: JsonResponse, serverSessionId: string): OutboxOutcome {
    const scope = response.headers.get('X-FitFocus-State-Protocol') === '2' && response.headers.get('X-FitFocus-State-Guard') === '1'
      && response.headers.get('X-FitFocus-State-Account') === claim.accountId && response.headers.get('X-FitFocus-State-Session') === serverSessionId;
    const pause = (reason: 'auth' | 'access' | 'protocol'): OutboxOutcome => ({ kind: 'retry', reason, pause: reason, nextAttemptAtMs: this.now() });
    if (response.status === 401) return pause('auth');
    if (response.status === 403 && body?.error === 'ACCESS_REQUIRED') return pause('access');
    if (response.status === 426 && body?.error === 'STATE_PROTOCOL_REQUIRED') return pause('protocol');
    if (claim.resource === 'familyMenu') {
      let intent: unknown;
      try { intent = claim.type === 'put' ? JSON.parse(claim.value) : null; } catch {}
      const snapshot = body?.snapshot;
      const valid = response.headers.get('X-FitFocus-Family-Menu-Protocol') === '1'
        && response.headers.get('X-FitFocus-Family-Menu-Guard') === '1'
        && response.headers.get('X-FitFocus-State-Account') === claim.accountId
        && response.headers.get('X-FitFocus-State-Session') === serverSessionId
        && isFamilyMenuIntent(intent) && isFamilyMenuSnapshot(snapshot)
        && snapshot.familyId === intent.familyId && snapshot.weekStart === intent.weekStart;
      if (response.status === 409) return valid && isFamilyMenuSnapshot(snapshot)
        ? { kind: 'conflicted', reason: 'server-version-conflict', serverSnapshot: {
          version: snapshot.version, exists: snapshot.menu !== null,
          value: snapshot.menu ? JSON.stringify({ familyId: snapshot.familyId, weekStart: snapshot.weekStart, menu: snapshot.menu }) : '',
        } }
        : pause('protocol');
      if (response.ok) return valid && isFamilyMenuSnapshot(snapshot) && snapshot.version > claim.baseVersion
        ? { kind: 'acknowledged', version: snapshot.version } : pause('protocol');
    }
    if (claim.resource === 'profile') {
      const valid = this.profileScope(response, claim.accountId, serverSessionId)
        && isUserProfilePayload(body?.profile) && body.profile.id === claim.accountId
        && typeof body.version === 'number' && Number.isSafeInteger(body.version) && body.version >= 0
        && body.profile.version === body.version;
      if (response.status === 409) return valid
        ? { kind: 'conflicted', reason: 'server-version-conflict', serverSnapshot: { value: JSON.stringify(body!.profile), version: body!.version as number, exists: true } }
        : pause('protocol');
      if (response.ok) return valid && (body!.version as number) > claim.baseVersion
        ? { kind: 'acknowledged', version: body!.version as number } : pause('protocol');
    }
    if (response.status === 409) {
      const snapshot = scope && body?.key === claim.key && typeof body.value === 'string' && typeof body.exists === 'boolean'
        && typeof body.version === 'number' && Number.isSafeInteger(body.version) && body.version >= (body.exists ? 1 : 0)
        ? { value: body.value, version: body.version, exists: body.exists } : undefined;
      return snapshot ? { kind: 'conflicted', reason: 'server-version-conflict', serverSnapshot: snapshot } : pause('protocol');
    }
    if (response.ok) {
      const item = claim.type === 'put' && Array.isArray(body?.items) && body.items.length === 1 ? body.items[0] : claim.type === 'delete' ? body : null;
      if (scope && body?.ok === true && isRecord(item) && item.key === claim.key && item.exists === (claim.type === 'put')
        && typeof item.version === 'number' && Number.isSafeInteger(item.version) && item.version > claim.baseVersion) {
        return { kind: 'acknowledged', version: item.version };
      }
      return pause('protocol');
    }
    if (response.status === 408 || response.status === 429 || response.status >= 500) return this.retry(claim, `http-${response.status}`, response.headers.get('Retry-After'));
    return { kind: 'failed', reason: response.status === 403 && body?.error === 'FORBIDDEN_KEYSPACE' ? 'FORBIDDEN_KEYSPACE' : `http-${response.status}` };
  }

  private profileScope(response: Response, accountId: string, sessionId: string): boolean {
    return response.headers.get('X-FitFocus-Profile-Protocol') === '1' && response.headers.get('X-FitFocus-Profile-Guard') === '1'
      && response.headers.get('X-FitFocus-State-Account') === accountId && response.headers.get('X-FitFocus-State-Session') === sessionId;
  }

  private stateScope(response: Response, accountId: string, sessionId: string): boolean {
    return response.headers.get('X-FitFocus-State-Protocol') === '2' && response.headers.get('X-FitFocus-State-Guard') === '1'
      && response.headers.get('X-FitFocus-State-Account') === accountId && response.headers.get('X-FitFocus-State-Session') === sessionId;
  }
}

export const stateSync = new StateSync({ legacyRuntime: true });
