import { parseJson } from '../safeJson';
import type { CoachAdviceResult } from '../geminiService';
import type { AppSettings, FavoriteRecipe, FoodItem } from '../types';
import type { WeeklyStoredReport } from '../weeklyAutoEngine';
import { enqueueRemoteKVWrite, safeRemoveItem, safeSetItem } from './hybrid';
import { isIndexedUserStateStorageKey, readIndexedUserStateRaw, removeIndexedUserStateRaw, writeIndexedUserStateRaw } from './indexedUserState';
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

/**
 * Browser-side state owned by one account. The key format deliberately stays
 * compatible with the existing Cloudflare state mirroring layer.
 */
export class UserStateRepository {
  private readonly revisions = new Map<string, number>();

  constructor(private readonly userId: string) {}

  private bumpRevision(key: string): number {
    const next = (this.revisions.get(key) ?? 0) + 1;
    this.revisions.set(key, next);
    return next;
  }

  private isCurrentRevision(key: string, revision: number): boolean {
    return this.revisions.get(key) === revision;
  }

  key(stateKey: UserStateKey): string {
    return userStateStorageKey(this.userId, stateKey);
  }

  readJson<T>(stateKey: UserStateKey, fallback: T, isValid: (value: unknown) => value is T): T {
    try {
      const raw = localStorage.getItem(this.key(stateKey));
      if (!raw) return fallback;
      const parsed = parseJson(raw);
      return isValid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  writeJson<K extends UserStateKey>(stateKey: K, value: UserStateValue[K]): void {
    const key = this.key(stateKey);
    const raw = JSON.stringify(value);
    if (!isIndexedUserStateStorageKey(key)) {
      safeSetItem(key, raw);
      return;
    }

    const revision = this.bumpRevision(key);
    void writeIndexedUserStateRaw(key, raw).then((stored) => {
      if (!this.isCurrentRevision(key, revision)) return;
      if (!stored) {
        safeSetItem(key, raw);
        return;
      }
      try {
        localStorage.removeItem(key);
      } catch {}
      enqueueRemoteKVWrite(key, raw);
    });
  }

  async readJsonAsync<T>(stateKey: UserStateKey, fallback: T, isValid: (value: unknown) => value is T): Promise<T> {
    const key = this.key(stateKey);
    const indexedRaw = await readIndexedUserStateRaw(key);
    const raw = indexedRaw ?? (() => {
      try { return localStorage.getItem(key); } catch { return null; }
    })();
    if (!raw) return fallback;
    try {
      const parsed = parseJson(raw);
      if (!isValid(parsed)) return fallback;
      if (!indexedRaw && isIndexedUserStateStorageKey(key) && !this.revisions.has(key)) {
        const revision = this.bumpRevision(key);
        void writeIndexedUserStateRaw(key, raw).then((stored) => {
          if (stored && this.isCurrentRevision(key, revision)) {
            try { localStorage.removeItem(key); } catch {}
          }
        });
      }
      return parsed;
    } catch {
      return fallback;
    }
  }

  remove(stateKey: UserStateKey): void {
    const key = this.key(stateKey);
    this.bumpRevision(key);
    if (isIndexedUserStateStorageKey(key)) void removeIndexedUserStateRaw(key);
    safeRemoveItem(key);
  }
}
