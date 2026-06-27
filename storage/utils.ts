import { STORAGE_KEYS } from "./keys";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function safeGetItem<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = safeJsonParse(raw);
    if (parsed === null) return fallback;
    if (validate) {
      return validate(parsed) ? parsed : fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function safeSetItem(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error: unknown) {
    // If storage quota is exceeded, try evicting big data and retry once.
    if (error instanceof Error && String(error.name || "").includes("QuotaExceeded")) {
      evictLargeLocalStorage();
      localStorage.setItem(key, JSON.stringify(value));
      return;
    }
    throw error;
  }
}

export function evictLargeLocalStorage(): void {
  try {
    // 1) Drop AI cache (device cache is an optimization, ok to lose)
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(STORAGE_KEYS.aiCachePrefix)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));

    // 2) Trim council histories (keep last 50 messages)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith(STORAGE_KEYS.dataPrefix) || !k.endsWith(STORAGE_KEYS.councilHistorySuffix)) continue;
      try {
        const hist = safeJsonParse(localStorage.getItem(k) || "[]");
        if (Array.isArray(hist) && hist.length > 60) {
          localStorage.setItem(k, JSON.stringify(hist.slice(-50)));
        }
      } catch {}
    }

    // 3) Best-effort: remove full-size photos from food log entries if present
    // (We don't know exact shape here; repo migrations should handle it in future.)
    // 4) Trim large profile snapshots so new progress photos do not blow up quota.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEYS.dataPrefix) || !k.endsWith('_all_users')) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = safeJsonParse(raw);
        if (!Array.isArray(parsed)) continue;
        let changed = false;
        const next = parsed.map((user: unknown) => {
          if (!isRecord(user)) return user;
          const copy = { ...user };
          if (Array.isArray(copy.progressPhotos) && copy.progressPhotos.length > 6) {
            copy.progressPhotos = copy.progressPhotos.slice(0, 6).map((photo: unknown) => {
              if (!isRecord(photo)) return photo;
              return {
                ...photo,
                photo: typeof photo.thumb === 'string' && photo.thumb ? photo.thumb : photo.photo,
              };
            });
            changed = true;
          }
          if (Array.isArray(copy.measurementsHistory) && copy.measurementsHistory.length > 30) {
            copy.measurementsHistory = copy.measurementsHistory.slice(0, 30);
            changed = true;
          }
          return copy;
        });
        if (changed) {
          localStorage.setItem(k, JSON.stringify(next));
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}
