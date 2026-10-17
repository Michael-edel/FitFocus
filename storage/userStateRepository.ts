import { parseJson } from '../safeJson';
import type { CoachAdviceResult } from '../geminiService';
import type { AppSettings, FavoriteRecipe, FoodItem, UserHabit, UserProfile } from '../types';
import type { CouncilChatMsg, FamilyMenuPrefs } from './stateTypes';
import type { WeeklyStoredReport } from '../weeklyAutoEngine';
import { DurableOutbox, type OutboxCommitGuard, type OutboxIntent, type OutboxLocalCommitGuard, type OutboxOperation, type OutboxReadGuard, type OutboxWriteGuard } from './durableOutbox';
import { reportStateOperation, reportStateQueue, reportStateSaveIssue, reportStateSaveSuccess } from './stateSaveStatus';
import type { FastLogItem } from './foodDiary';
import { STORAGE_KEYS } from './keys';

export const USER_STATE_KEYS = ['diary', 'history', 'favorite_recipes', 'weekly_reports', 'last_coach_card', 'settings',
  'habits', 'favorites', 'adapt_read', 'adapt_expanded', 'refeed', 'plan_task_done', 'council_history', 'family_menu_prefs', 'invite_code'] as const;
export type UserStateKey = typeof USER_STATE_KEYS[number] | 'profile';
type JsonUserStateKey = Exclude<UserStateKey, 'adapt_read' | 'adapt_expanded' | 'refeed' | 'invite_code'>;

export type UserStateValue = {
  profile: UserProfile;
  diary: FoodItem[];
  history: FastLogItem[];
  favorite_recipes: FavoriteRecipe[];
  weekly_reports: WeeklyStoredReport[];
  last_coach_card: CoachAdviceResult | null;
  settings: AppSettings;
  habits: UserHabit[];
  favorites: FastLogItem[];
  adapt_read: boolean;
  adapt_expanded: boolean;
  refeed: string | null;
  plan_task_done: Record<string, boolean>;
  council_history: CouncilChatMsg[];
  family_menu_prefs: FamilyMenuPrefs;
  invite_code: string;
};

export function userStateStorageKey(userId: string, stateKey: UserStateKey): string {
  return `${STORAGE_KEYS.dataPrefix}${userId}_${stateKey}`;
}

/** An editor keeps the revision it actually read, rather than adopting a fresh base at write time. */
export class UserStateRepository {
  private readonly outbox: DurableOutbox;
  private readonly writerId: string;
  private readonly resumeOwnPendingWrites: boolean;
  private readonly observations = new Map<string, { revision: number; confirmedVersion: number; parentOpId?: string }>();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(readonly accountId: string, options: { outbox?: DurableOutbox; writerId?: string } = {}) {
    this.outbox = options.outbox ?? new DurableOutbox();
    this.writerId = options.writerId ?? crypto.randomUUID();
    this.resumeOwnPendingWrites = options.writerId !== undefined;
  }

  key(stateKey: UserStateKey): string {
    return userStateStorageKey(this.accountId, stateKey);
  }

  /** A flush barrier must not silently adopt a revision the editor never displayed. */
  waitForWrites(stateKey: UserStateKey): Promise<void> {
    return this.serialize(this.key(stateKey), async () => {});
  }

  async hasPending(stateKey: UserStateKey): Promise<boolean> {
    return (await this.outbox.list(this.accountId)).some(operation => operation.key === this.key(stateKey));
  }

  private serialize<T>(key: string, work: () => Promise<T>): Promise<T> {
    const result = (this.pending.get(key) ?? Promise.resolve()).then(work);
    this.pending.set(key, result.then(() => undefined, () => undefined));
    return result;
  }

  private track<T>(key: string, promise: Promise<T>): Promise<T> {
    // Keep rejection observable to callers, and handled when a UI event ignores the Promise.
    void promise.catch((error: unknown) => reportStateSaveIssue({
      accountId: this.accountId, key, kind: 'error', reason: error instanceof Error ? error.name : 'storage',
    }));
    return promise;
  }

  observe(stateKey: UserStateKey): Promise<{ value: string | null; revision: number; confirmedVersion: number }> {
    const key = this.key(stateKey);
    return this.track(key, this.serialize(key, async () => {
      const snapshot = await this.outbox.snapshot(this.accountId, key, stateKey === 'profile');
      const operations = await this.outbox.list(this.accountId);
      reportStateQueue(this.accountId, operations);
      for (const operation of operations) {
        if (operation.key === key && operation.status === 'conflicted') {
          reportStateSaveIssue({ accountId: this.accountId, key, kind: 'conflicted', reason: operation.reason ?? operation.status });
        }
      }
      const previous = this.observations.get(key);
      this.observations.set(key, {
        revision: snapshot.revision, confirmedVersion: snapshot.confirmedVersion,
        ...(previous?.revision === snapshot.revision && previous.parentOpId ? { parentOpId: previous.parentOpId } : {}),
      });
      return snapshot;
    }));
  }

  isReadSessionCurrent(guard: OutboxReadGuard): Promise<boolean> {
    return guard.accountId === this.accountId ? this.outbox.isReadSessionCurrent(guard) : Promise.resolve(false);
  }

  isLocalCommitSessionCurrent(guard: Pick<OutboxReadGuard, 'accountId' | 'serverSessionId' | 'sessionEpoch'>): Promise<boolean> {
    return guard.accountId === this.accountId ? this.outbox.isLocalCommitSessionCurrent(guard) : Promise.resolve(false);
  }

  hydrate(stateKey: UserStateKey, observation: { value: string; version: number; exists: boolean }, expectedRevision: number, expectedSessionEpoch?: string, expectedAuthFence?: number): Promise<boolean> {
    const key = this.key(stateKey);
    return this.track(key, this.serialize(key, () => this.outbox.hydrate(this.accountId, key, observation, expectedRevision, expectedSessionEpoch, expectedAuthFence)));
  }

  private mutate(stateKey: UserStateKey, intent: OutboxIntent, retainAsConflict = false, guard?: OutboxWriteGuard): Promise<OutboxOperation> {
    const capturedGuard = guard
      ? 'readGuard' in guard
        ? { readGuard: { ...guard.readGuard }, canCommit: guard.canCommit }
        : { localCommitGuard: { ...guard.localCommitGuard }, canCommit: guard.canCommit }
      : undefined;
    const key = this.key(stateKey);
    return this.track(key, this.serialize(key, async () => {
      // An editor that has not loaded existing data cannot silently claim its revision.
      const observation = this.observations.get(key) ?? { revision: 0, confirmedVersion: 0 };
      const operation = await this.outbox.write({
        accountId: this.accountId, writerId: this.writerId, intent,
        ...(stateKey === 'profile' ? { resource: 'profile' as const } : {}),
        expectedRevision: observation.revision, baseVersion: observation.confirmedVersion,
        ...(retainAsConflict ? { conflictReason: 'editor-not-loaded' as const } : {}),
        ...(observation.parentOpId ? { parentOpId: observation.parentOpId } : {}),
        ...capturedGuard,
      });
      this.recordOperation(key, operation);
      return operation;
    }));
  }

  private recordOperation(key: string, operation: OutboxOperation): void {
    reportStateOperation(this.accountId, operation);
    if (operation.status === 'conflicted') {
      reportStateSaveIssue({ accountId: this.accountId, key, kind: 'conflicted', reason: operation.reason ?? 'conflict' });
      return;
    }
    this.observations.set(key, { revision: operation.revision, confirmedVersion: operation.baseVersion, parentOpId: operation.opId });
    // IDB is authoritative after commit, including a deletion. This is cleanup, not a second queue.
    try { localStorage.removeItem(key); } catch {}
    reportStateSaveSuccess(this.accountId, key);
  }

  /** Read, derive, and commit a JSON value in this repository's per-key write queue. */
  updateJson<K extends JsonUserStateKey>(
    stateKey: K,
    fallback: UserStateValue[K],
    isValid: (value: unknown) => value is UserStateValue[K],
    update: (current: UserStateValue[K]) => UserStateValue[K],
    guard?: OutboxCommitGuard,
  ): Promise<{ operation: OutboxOperation | null; value: UserStateValue[K] }> {
    const capturedGuard = guard ? { readGuard: { ...guard.readGuard }, canCommit: guard.canCommit } : undefined;
    const key = this.key(stateKey);
    return this.track(key, this.serialize(key, async () => {
      const snapshot = await this.outbox.snapshot(this.accountId, key, stateKey === 'profile');
      const previous = this.observations.get(key);
      let parentOpId = previous?.revision === snapshot.revision && previous.parentOpId
        ? previous.parentOpId
        : undefined;
      if (!parentOpId && this.resumeOwnPendingWrites) {
        const sameWriterHead = (await this.outbox.list(this.accountId)).find((operation) =>
          operation.key === key
          && operation.revision === snapshot.revision
          && operation.writerId === this.writerId
          && (operation.status === 'pending' || operation.status === 'sending'));
        parentOpId = sameWriterHead?.opId;
      }
      this.observations.set(key, {
        revision: snapshot.revision,
        confirmedVersion: snapshot.confirmedVersion,
        ...(parentOpId ? { parentOpId } : {}),
      });

      let raw = snapshot.value;
      if (raw === null && snapshot.revision === 0) {
        try { raw = localStorage.getItem(key); } catch {}
      }
      let current = fallback;
      if (raw !== null) {
        try {
          const parsed = parseJson(raw);
          if (isValid(parsed)) current = parsed;
        } catch {}
      }
      const value = update(current);
      if (Object.is(value, current)) return { operation: null, value };

      const serialized = JSON.stringify(value);
      if (typeof serialized !== 'string') throw new Error('USER_STATE_SERIALIZATION');
      const observation = this.observations.get(key)!;
      const operation = await this.outbox.write({
        accountId: this.accountId,
        writerId: this.writerId,
        intent: { type: 'put', key, value: serialized },
        expectedRevision: observation.revision,
        baseVersion: observation.confirmedVersion,
        ...(stateKey === 'profile' ? { resource: 'profile' as const } : {}),
        ...(observation.parentOpId ? { parentOpId: observation.parentOpId } : {}),
        ...capturedGuard,
      });
      this.recordOperation(key, operation);
      return { operation, value };
    }));
  }

  writeJson<K extends JsonUserStateKey>(stateKey: K, value: UserStateValue[K], guard?: OutboxCommitGuard): Promise<OutboxOperation> {
    let raw: string;
    try { raw = JSON.stringify(value); } catch (error) { return this.track(this.key(stateKey), Promise.reject(error)); }
    return this.writeRaw(stateKey, raw, false, guard);
  }

  writeRaw(stateKey: UserStateKey, value: string, retainAsConflict = false, guard?: OutboxCommitGuard): Promise<OutboxOperation> {
    return this.mutate(stateKey, { type: 'put', key: this.key(stateKey), value }, retainAsConflict, guard);
  }

  writeLocalRaw(stateKey: UserStateKey, value: string, retainAsConflict: boolean, guard: OutboxLocalCommitGuard): Promise<OutboxOperation> {
    return this.mutate(stateKey, { type: 'put', key: this.key(stateKey), value }, retainAsConflict, guard);
  }

  async readRawAsync(stateKey: UserStateKey): Promise<string | null> {
    const snapshot = await this.observe(stateKey);
    // A committed delete must never revive a leftover localStorage value.
    let raw = snapshot.value;
    if (raw === null && snapshot.revision === 0) {
      try { raw = localStorage.getItem(this.key(stateKey)); } catch {}
    }
    return raw;
  }

  async readJsonAsync<T>(stateKey: UserStateKey, fallback: T, isValid: (value: unknown) => value is T): Promise<T> {
    const raw = await this.readRawAsync(stateKey);
    if (!raw) return fallback;
    try {
      const parsed = parseJson(raw);
      return isValid(parsed) ? parsed : fallback;
    } catch { return fallback; }
  }

  remove(stateKey: UserStateKey, retainAsConflict = false, guard?: OutboxCommitGuard): Promise<OutboxOperation> {
    return this.mutate(stateKey, { type: 'delete', key: this.key(stateKey) }, retainAsConflict, guard);
  }

  removeLocal(stateKey: UserStateKey, retainAsConflict: boolean, guard: OutboxLocalCommitGuard): Promise<OutboxOperation> {
    return this.mutate(stateKey, { type: 'delete', key: this.key(stateKey) }, retainAsConflict, guard);
  }
}
