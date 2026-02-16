import { STORAGE_KEYS } from "./keys";

export function safeGetItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeSetItem(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e: any) {
    // If storage quota is exceeded, try evicting big data and retry once.
    if (String(e?.name || "").includes("QuotaExceeded")) {
      evictLargeLocalStorage();
      localStorage.setItem(key, JSON.stringify(value));
      return;
    }
    throw e;
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
      if (!k.startsWith(STORAGE_KEYS.councilHistoryPrefix)) continue;
      try {
        const hist = JSON.parse(localStorage.getItem(k) || "[]");
        if (Array.isArray(hist) && hist.length > 60) {
          localStorage.setItem(k, JSON.stringify(hist.slice(-50)));
        }
      } catch {}
    }

    // 3) Best-effort: remove full-size photos from food log entries if present
    // (We don't know exact shape here; repo migrations should handle it in future.)
  } catch {
    // ignore
  }
}
