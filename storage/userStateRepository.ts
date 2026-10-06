import { parseJson } from '../safeJson';
import { safeRemoveItem, safeSetItem } from './hybrid';
import { STORAGE_KEYS } from './keys';

export type UserStateKey =
  | 'diary'
  | 'history'
  | 'favorite_recipes'
  | 'weekly_reports'
  | 'last_coach_card'
  | 'settings';

export function userStateStorageKey(userId: string, stateKey: UserStateKey): string {
  return `${STORAGE_KEYS.dataPrefix}${userId}_${stateKey}`;
}

/**
 * Browser-side state owned by one account. The key format deliberately stays
 * compatible with the existing Cloudflare state mirroring layer.
 */
export class UserStateRepository {
  constructor(private readonly userId: string) {}

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

  writeJson(stateKey: UserStateKey, value: unknown): void {
    safeSetItem(this.key(stateKey), JSON.stringify(value));
  }

  remove(stateKey: UserStateKey): void {
    safeRemoveItem(this.key(stateKey));
  }
}
