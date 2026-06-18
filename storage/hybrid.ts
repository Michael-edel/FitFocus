import { STORAGE_KEYS } from "./keys";

type KVItem = { key: string; value: string };

const REMOTE_STATE_PREFIXES = [
  STORAGE_KEYS.dataPrefix,
  "ff_gemini_cooldown_until",
  "ff_ai_last_status_v1",
  "ff_ai_last_action_v1",
  "ff_ai_feature_lastcall_v1:",
];

const __kvQueue: KVItem[] = [];
const __kvDeleteQueue: string[] = [];
let __kvTimer: number | null = null;
let __kvDeleteTimer: number | null = null;

function shouldMirrorKey(key: string): boolean {
  return REMOTE_STATE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function enqueueRemoteKVWrite(key: string, value: string) {
  if (!shouldMirrorKey(key)) return;
  __kvQueue.push({ key, value });

  if (__kvTimer != null) return;
  __kvTimer = window.setTimeout(async () => {
    __kvTimer = null;
    const batch = __kvQueue.splice(0, __kvQueue.length);
    if (!batch.length) return;
    try {
      await fetch('/api/state', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batch }),
      });
    } catch {
      // Best-effort mirror only. Next write will retry.
    }
  }, 400);
}

function enqueueRemoteKVDelete(key: string) {
  if (!shouldMirrorKey(key)) return;
  __kvDeleteQueue.push(key);

  if (__kvDeleteTimer != null) return;
  __kvDeleteTimer = window.setTimeout(async () => {
    __kvDeleteTimer = null;
    const batch = __kvDeleteQueue.splice(0, __kvDeleteQueue.length);
    if (!batch.length) return;
    try {
      await Promise.all(batch.map((k) =>
        fetch(`/api/state?key=${encodeURIComponent(k)}`, {
          method: 'DELETE',
          credentials: 'include',
        })
      ));
    } catch {
      // Best-effort mirror only. A later full sync can clean this up.
    }
  }, 400);
}

export function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    enqueueRemoteKVWrite(key, value);
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('LocalStorage quota exceeded. Consider clearing old data.');
    } else {
      console.warn('LocalStorage write failed:', e);
    }
  }
}

export function safeRemoveItem(key: string) {
  try {
    localStorage.removeItem(key);
    enqueueRemoteKVDelete(key);
  } catch {
    // ignore
  }
}

export function allUsersStorageKey(userId?: string | null) {
  return `${STORAGE_KEYS.dataPrefix}${userId || 'unknown'}_all_users`;
}

export function persistAllUsersSnapshot(ownerUserId: string | null | undefined, next: unknown[]) {
  if (!ownerUserId) return;
  safeSetItem(allUsersStorageKey(ownerUserId), JSON.stringify(next));
}

export function readStoredAllUsersSnapshot<T = unknown>(): T[] | null {
  const candidates: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_KEYS.dataPrefix) || !k.endsWith('_all_users')) continue;
    if (!candidates.includes(k)) candidates.push(k);
  }

  let best: T[] | null = null;
  for (const key of candidates) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (!best || parsed.length > best.length) best = parsed as T[];
      }
    } catch {}
  }
  return best;
}

export function collectLocalStateItems(userId: string): KVItem[] {
  const items: KVItem[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      !key.startsWith(STORAGE_KEYS.dataPrefix) &&
      key !== 'ff_gemini_cooldown_until' &&
      key !== 'ff_ai_last_status_v1' &&
      key !== 'ff_ai_last_action_v1' &&
      !key.startsWith('ff_ai_feature_lastcall_v1:')
    ) {
      continue;
    }
    if (key.startsWith(STORAGE_KEYS.dataPrefix) && !key.startsWith(`${STORAGE_KEYS.dataPrefix}${userId}_`)) continue;
    const value = localStorage.getItem(key);
    if (typeof value === 'string') items.push({ key, value });
  }
  return items;
}
