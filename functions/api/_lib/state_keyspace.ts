const AI_STATE_KEYS = new Set([
  "ff_gemini_cooldown_until",
  "ff_ai_last_status_v1",
  "ff_ai_last_action_v1",
]);

const AI_STATE_PREFIXES = [
  "ff_ai_feature_lastcall_v1:",
];

export function isAllowedStateKey(userId: string, key: string): boolean {
  if (!key) return false;
  if (key.startsWith(`fitfocus_data_${userId}_`)) return true;
  if (AI_STATE_KEYS.has(key)) return true;
  return AI_STATE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isAllowedStatePrefix(userId: string, prefix: string): boolean {
  if (!prefix) return false;
  if (prefix === `fitfocus_data_${userId}_`) return true;
  if (AI_STATE_KEYS.has(prefix)) return true;
  return AI_STATE_PREFIXES.some((allowed) => prefix === allowed);
}
