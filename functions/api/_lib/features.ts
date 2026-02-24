// Feature flags helpers (Enterprise Layer)

export type FeatureMap = Record<string, boolean>;

export async function loadFeatures(env: { DB?: any }): Promise<FeatureMap> {
  if (!env.DB) return {};
  const rows = await env.DB.prepare("SELECT key, enabled, rollout_percentage FROM feature_flags").all<{
    key: string;
    enabled: number;
    rollout_percentage: number | null;
  }>();
  const features: FeatureMap = {};
  for (const r of rows.results || []) {
    features[String(r.key)] = Number(r.enabled) === 1;
  }
  return features;
}

export function isEnabled(features: FeatureMap, key: string, fallback = false): boolean {
  if (!features) return fallback;
  return typeof features[key] === "boolean" ? features[key] : fallback;
}


export type SettingMap = Record<string, string>;

export async function loadSettings(env: { DB?: any }): Promise<SettingMap> {
  if (!env.DB) return {};
  const rows = await env.DB.prepare("SELECT key, value FROM feature_settings").all<{ key: string; value: string }>();
  const settings: SettingMap = {};
  for (const r of rows.results || []) settings[String(r.key)] = String((r as any).value ?? "");
  return settings;
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
