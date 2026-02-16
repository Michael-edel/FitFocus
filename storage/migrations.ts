import { STORAGE_KEYS } from "./keys";
import { safeGetItem, safeSetItem } from "./utils";

export type Migration = (ctx: { from: number; to: number }) => void;

const LATEST_VERSION = 2;

function getVersion(): number {
  const v = safeGetItem<number>(STORAGE_KEYS.schemaVersion, 0);
  return Number.isFinite(v) ? v : 0;
}

function setVersion(v: number) {
  safeSetItem(STORAGE_KEYS.schemaVersion, v);
}

// NOTE: current app stores user profiles under keys "fitfocus_data_<userId>"
// This migrator upgrades each stored user profile in-place.
const migrations: Record<number, Migration> = {
  1: () => {
    // v1: ensure lossDeficit/gainSurplus exist (older builds sometimes missed them)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith(STORAGE_KEYS.dataPrefix)) continue;
      try {
        const obj = JSON.parse(localStorage.getItem(k) || "{}");
        if (obj && typeof obj === "object") {
          if (!("lossDeficit" in obj)) obj.lossDeficit = 500;
          if (!("gainSurplus" in obj)) obj.gainSurplus = 300;
          localStorage.setItem(k, JSON.stringify(obj));
        }
      } catch {}
    }
  },
  2: () => {
    // v2: add tenantId/role/userUid (for future B2B + cloud sync)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith(STORAGE_KEYS.dataPrefix)) continue;
      try {
        const obj = JSON.parse(localStorage.getItem(k) || "{}");
        if (obj && typeof obj === "object") {
          if (!("tenantId" in obj)) obj.tenantId = "default";
          if (!("role" in obj)) obj.role = "user";
          if (!("userUid" in obj)) obj.userUid = (crypto as any)?.randomUUID?.() || String(Date.now()) + "_" + Math.random().toString(16).slice(2);
          localStorage.setItem(k, JSON.stringify(obj));
        }
      } catch {}
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
