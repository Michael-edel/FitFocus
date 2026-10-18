// keys.ts — central place for storage keys
export const STORAGE_KEYS = {
  schemaVersion: "fitfocus_schema_version",
  dataPrefix: "fitfocus_data_",
  aiCachePrefix: "fitfocus_ai_cache_",
  recipeUsagePrefix: "fitfocus_usage_counters_v1:",
  councilHistorySuffix: "_council_history",
} as const;
