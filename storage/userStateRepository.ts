import { parseJson } from '../safeJson';
import type { CoachAdviceResult } from '../geminiService';
import type { AppSettings, FavoriteRecipe, FoodItem } from '../types';
import type { WeeklyStoredReport } from '../weeklyAutoEngine';
import { DurableOutbox, type OutboxIntent, type OutboxOperation } from './durableOutbox';
import { reportStateOperation, reportStateQueue, reportStateSaveIssue, reportStateSaveSuccess } from './stateSaveStatus';
import type { FastLogItem } from './foodDiary';
import { STORAGE_KEYS } from './keys';

export type UserStateKey =
  | 'diary'
  | 'history'
  | 'favorite_recipes'
  | 'weekly_reports'
  | 'last_coach_card'
  | 'settings';

export type UserStateValue = {
  diary: FoodItem[];
  history: FastLogItem[];
  favorite_recipes: FavoriteRecipe[];
  weekly_reports: WeeklyStoredReport[];
  last_coach_card: CoachAdviceResult | null;
  settings: AppSettings;
};

export function userStateStorageKey(userId: string, stateKey: UserStateKey): string {
  return `${STORAGE_KEYS.dataPrefix}${userId}_${stateKey}`;
}

/** An editor keeps the revision it actually read, rather than adopting a fresh base at write time. */
export class UserStateRepository {
  private readonly outbox: DurableOutbox;
  private readonly writerId: string;
  private readonly observations = new Map<string, { revision: number; confirmedVersion: number; parentOpId?: string }>();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(readonly accountId: string, options: { outbox?: DurableOutbox; writerId?: string } = {}) {
    this.outbox = options.outbox ?? new DurableOutbox();
    this.writerId = options.writerId ?? crypto.randomUUID();
  }

  key(stateKey: UserStateKey): string {
    return userStateStorageKey(this.accountId, stateKey);
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
      const snapshot = await this.outbox.snapshot(this.accountId, key);
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

  hydrate(stateKey: UserStateKey, observation: { value: string; version: number; exists: boolean }, expectedRevision: number): Promise<boolean> {
    const key = this.key(stateKey);
    return this.track(key, this.serialize(key, () => this.outbox.hydrate(this.accountId, key, observation, expectedRevision)));
  }

  private mutate(stateKey: UserStateKey, intent: OutboxIntent): Promise<OutboxOperation> {
    const key = this.key(stateKey);
    return this.track(key, this.serialize(key, async () => {
      // An editor that has not loaded existing data cannot silently claim its revision.
      const observation = this.observations.get(key) ?? { revision: 0, confirmedVersion: 0 };
      const operation = await this.outbox.write({
        accountId: this.accountId, writerId: this.writerId, intent,
        expectedRevision: observation.revision, baseVersion: observation.confirmedVersion,
        ...(observation.parentOpId ? { parentOpId: observation.parentOpId } : {}),
      });
      reportStateOperation(this.accountId, operation);
      if (operation.status === 'conflicted') {
        reportStateSaveIssue({ accountId: this.accountId, key, kind: 'conflicted', reason: operation.reason ?? 'conflict' });
      } else {
        this.observations.set(key, { revision: operation.revision, confirmedVersion: operation.baseVersion, parentOpId: operation.opId });
        // IDB is authoritative after commit, including a deletion. This is cleanup, not a second queue.
        try { localStorage.removeItem(key); } catch {}
        reportStateSaveSuccess(this.accountId, key);
      }
      return operation;
    }));
  }

  writeJson<K extends UserStateKey>(stateKey: K, value: UserStateValue[K]): Promise<OutboxOperation> {
    let raw: string;
    try { raw = JSON.stringify(value); } catch (error) { return this.track(this.key(stateKey), Promise.reject(error)); }
    return this.mutate(stateKey, { type: 'put', key: this.key(stateKey), value: raw });
  }

  async readJsonAsync<T>(stateKey: UserStateKey, fallback: T, isValid: (value: unknown) => value is T): Promise<T> {
    const snapshot = await this.observe(stateKey);
    // A committed delete must never revive a leftover localStorage value.
    let raw = snapshot.value;
    if (raw === null && snapshot.revision === 0) {
      try { raw = localStorage.getItem(this.key(stateKey)); } catch {}
    }
    if (!raw) return fallback;
    try {
      const parsed = parseJson(raw);
      return isValid(parsed) ? parsed : fallback;
    } catch { return fallback; }
  }

  remove(stateKey: UserStateKey): Promise<OutboxOperation> {
    return this.mutate(stateKey, { type: 'delete', key: this.key(stateKey) });
  }
}
