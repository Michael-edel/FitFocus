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
