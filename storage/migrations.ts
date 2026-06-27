import { STORAGE_KEYS } from "./keys";
import { safeGetItem, safeSetItem } from "./utils";

export type Migration = (ctx: { from: number; to: number }) => void;

const LATEST_VERSION = 3;

function generateUserUid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getVersion(): number {
  const v = safeGetItem<number>(STORAGE_KEYS.schemaVersion, 0);
  return Number.isFinite(v) ? v : 0;
}

function setVersion(v: number) {
  safeSetItem(STORAGE_KEYS.schemaVersion, v);
}

function snapshotDataKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(STORAGE_KEYS.dataPrefix)) keys.push(k);
  }
  return keys;
}

function ensureProfileDefaults(obj: Record<string, unknown>): boolean {
  let changed = false;
  if (!("lossDeficit" in obj)) {
    obj.lossDeficit = 500;
    changed = true;
  }
  if (!("gainSurplus" in obj)) {
    obj.gainSurplus = 300;
    changed = true;
  }
  if (!("tenantId" in obj)) {
    obj.tenantId = "default";
    changed = true;
  }
  if (!("role" in obj)) {
    obj.role = "user";
    changed = true;
  }
  if (!("userUid" in obj)) {
    obj.userUid = generateUserUid();
    changed = true;
  }
  return changed;
}

function migrateStoredValue(raw: string, includeArrays = false): string | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      if (!includeArrays) return null;
      let changed = false;
      const next = parsed.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
        const copy = { ...(entry as Record<string, unknown>) };
        if (ensureProfileDefaults(copy)) changed = true;
        return copy;
      });
      return changed ? JSON.stringify(next) : null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const copy = { ...(parsed as Record<string, unknown>) };
    return ensureProfileDefaults(copy) ? JSON.stringify(copy) : null;
  } catch {
    return null;
  }
}

// NOTE: current app stores user profiles under keys "fitfocus_data_<userId>"
// This migrator upgrades each stored user profile in-place.
const migrations: Record<number, Migration> = {
  1: () => {
    // v1: ensure lossDeficit/gainSurplus exist (older builds sometimes missed them)
    for (const k of snapshotDataKeys()) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const next = migrateStoredValue(raw, k.endsWith("_all_users"));
      if (next) localStorage.setItem(k, next);
    }
  },
  2: () => {
    // v2: add tenantId/role/userUid (for future B2B + cloud sync)
    for (const k of snapshotDataKeys()) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const next = migrateStoredValue(raw, k.endsWith("_all_users"));
      if (next) localStorage.setItem(k, next);
    }
  },
  3: () => {
    // v3: ensure legacy all-users snapshots are migrated too, and avoid mutating
    // localStorage while iterating over it.
    for (const k of snapshotDataKeys()) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const next = migrateStoredValue(raw, k.endsWith("_all_users"));
      if (next) localStorage.setItem(k, next);
    }
  },
};

export function runStorageMigrations(): void {
  const current = getVersion();
  if (current >= LATEST_VERSION) return;

  for (let v = current + 1; v <= LATEST_VERSION; v++) {
    migrations[v]?.({ from: v - 1, to: v });
    setVersion(v);
  }
}
