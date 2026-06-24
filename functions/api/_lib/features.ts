// Feature flags helpers (Enterprise Layer)

export type FeatureMap = Record<string, boolean>;

type FeatureFlagRow = {
  key?: string;
  enabled?: number | boolean;
  rollout_percentage?: number | null;
};

function normalizeRolloutPercentage(value: unknown) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

function stableRolloutBucket(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function isFeatureEnabledForActor(row: FeatureFlagRow, actorKey?: string | null) {
  if (Number(row.enabled) !== 1) return false;

  const rollout = normalizeRolloutPercentage(row.rollout_percentage);
  if (rollout >= 100) return true;
  if (rollout <= 0) return false;
  if (!actorKey) return false;

  const key = String(row.key || "");
  if (!key) return false;
  return stableRolloutBucket(`${key}:${actorKey}`) < rollout;
}

export async function loadFeatures(env: { DB?: any }, actorKey?: string | null): Promise<FeatureMap> {
  if (!env.DB) return {};
  try {
    const rows = await env.DB.prepare("SELECT key, enabled, rollout_percentage FROM feature_flags").all();
    const features: FeatureMap = {};
    for (const r of (rows.results || []) as FeatureFlagRow[]) {
      const key = String(r.key || "");
      if (!key) continue;
      features[key] = isFeatureEnabledForActor(r, actorKey);
    }
    return features;
  } catch {
    return {};
  }
}

export function isEnabled(features: FeatureMap, key: string, fallback = false): boolean {
  if (!features) return fallback;
  return typeof features[key] === "boolean" ? features[key] : fallback;
}


export type SettingMap = Record<string, string>;

export async function loadSettings(env: { DB?: any }): Promise<SettingMap> {
  if (!env.DB) return {};
  try {
    const rows = await env.DB.prepare("SELECT key, value FROM feature_settings").all();
    const settings: SettingMap = {};
    for (const r of rows.results || []) settings[String(r.key)] = String((r as any).value ?? "");
    return settings;
  } catch {
    return {};
  }
}

export function getSetting(settings: SettingMap, key: string, fallback = ""): string {
  if (!settings) return fallback;
  return typeof settings[key] === "string" ? settings[key] : fallback;
}

export function getSettingNumber(settings: SettingMap, key: string, fallback = 0): number {
  const raw = getSetting(settings, key, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
