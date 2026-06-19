import { STORAGE_KEYS } from "./keys";

type KVItem = { key: string; value: string; baseVersion?: number };

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
  if (key.endsWith('__ffv')) return false;
  return REMOTE_STATE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function versionMetaKey(key: string) {
  return `${key}__ffv`;
}

function getStoredVersion(key: string): number | undefined {
  try {
    const raw = localStorage.getItem(versionMetaKey(key));
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function setStoredVersion(key: string, version?: number) {
  try {
    if (!version || !Number.isFinite(version) || version <= 0) {
      localStorage.removeItem(versionMetaKey(key));
      return;
    }
    localStorage.setItem(versionMetaKey(key), String(version));
  } catch {
    // ignore
  }
}

async function applyRemoteKVConflict(key: string, serverValue: string, version?: number) {
  try {
    localStorage.setItem(key, serverValue);
    setStoredVersion(key, version);
  } catch {
    // ignore
  }
}

function enqueueRemoteKVWrite(key: string, value: string) {
  if (!shouldMirrorKey(key)) return;
  __kvQueue.push({ key, value, baseVersion: getStoredVersion(key) });

  if (__kvTimer != null) return;
  __kvTimer = window.setTimeout(async () => {
    __kvTimer = null;
    const batch = __kvQueue.splice(0, __kvQueue.length);
    if (!batch.length) return;
    try {
      for (const item of batch) {
        const r = await fetch('/api/state', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: item.key, value: item.value, baseVersion: item.baseVersion ?? 0 }),
        });
        const payload = await r.json().catch(() => null);
        if (r.ok) {
          const serverItem = Array.isArray(payload?.items) ? payload.items.find((x: any) => x?.key === item.key) : null;
          if (typeof serverItem?.version === 'number') {
            setStoredVersion(item.key, serverItem.version);
          }
          continue;
        }
        if (r.status === 409 && payload?.key) {
          const serverVersion = typeof payload.version === 'number' ? payload.version : undefined;
          const currentValue = localStorage.getItem(item.key);
          if (typeof currentValue === 'string' && currentValue === item.value && serverVersion) {
            setStoredVersion(item.key, serverVersion);
            continue;
          }
          if (typeof payload.value === 'string' && payload.key === item.key) {
            await applyRemoteKVConflict(item.key, payload.value, serverVersion);
          }
        }
      }
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
    localStorage.removeItem(versionMetaKey(key));
    enqueueRemoteKVDelete(key);
  } catch {
    // ignore
  }
}

export function allUsersStorageKey(userId?: string | null) {
  return `${STORAGE_KEYS.dataPrefix}${userId || 'unknown'}_all_users`;
}

export function renameLocalStoragePrefix(oldPrefix: string, newPrefix: string) {
  if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(oldPrefix)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    const nextKey = newPrefix + key.slice(oldPrefix.length);
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        localStorage.setItem(nextKey, value);
      }
      const version = localStorage.getItem(`${key}__ffv`);
      if (version !== null) {
        localStorage.setItem(`${nextKey}__ffv`, version);
        localStorage.removeItem(`${key}__ffv`);
      }
      localStorage.removeItem(key);
    } catch {
      // Best-effort migration only.
    }
  }
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
    if (key.endsWith('__ffv')) continue;
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
    if (typeof value === 'string') items.push({ key, value, baseVersion: getStoredVersion(key) });
  }
  return items;
}

export function rememberRemoteStateVersion(key: string, version?: number) {
  setStoredVersion(key, version);
}
