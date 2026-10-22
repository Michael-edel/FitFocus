import { buildAdminEventStatement } from './admin_audit';

export const ALLOWED_FEATURE_FLAGS = new Set([
  'achievements_enabled', 'ai_budget_guard_enabled', 'ai_emergency_fallback', 'ai_safe_mode', 'ai_fallback_mode',
]);

function nonNegativeDecimal(value: string): string | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? String(n) : null;
}
function nonNegativeInteger(value: string): string | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : null;
}
function limitAction(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized === 'fallback' || normalized === 'block' ? normalized : null;
}
export const SETTING_VALIDATORS: Record<string, (value: string) => string | null> = {
  ai_cost_input_per_1m_usd: nonNegativeDecimal,
  ai_cost_output_per_1m_usd: nonNegativeDecimal,
  ai_max_calls_per_user_day: nonNegativeInteger,
  ai_max_cost_per_user_day_usd: nonNegativeDecimal,
  ai_max_cost_total_day_usd: nonNegativeDecimal,
  ai_on_limit_action: limitAction,
};

export async function readAdminFeatureFlags(db: D1Database) {
  const { results } = await db.prepare('SELECT key, enabled, rollout_percentage FROM feature_flags ORDER BY key').all();
  return { flags: results || [] };
}
export async function readAdminSettings(db: D1Database) {
  const { results } = await db.prepare('SELECT key, value FROM feature_settings ORDER BY key').all();
  return { settings: results || [] };
}

export type AdminFeatureFlagUpdate = { key: string; enabled: unknown; rollout: unknown; adminUserId: string };
export async function updateAdminFeatureFlag(input: { db: D1Database; update: AdminFeatureFlagUpdate }) {
  const { db, update } = input;
  if (!ALLOWED_FEATURE_FLAGS.has(update.key)) return { kind: 'bad_flag' as const };
  if (typeof update.enabled !== 'boolean') return { kind: 'bad_enabled' as const };
  if (typeof update.rollout !== 'number' || !Number.isFinite(update.rollout)) return { kind: 'bad_rollout' as const };
  const enabled = update.enabled ? 1 : 0;
  const rollout = Math.max(0, Math.min(100, Math.floor(update.rollout)));
  const flagStatement = db.prepare(
    'INSERT INTO feature_flags (key, enabled, rollout_percentage) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, rollout_percentage = excluded.rollout_percentage'
  ).bind(update.key, enabled, rollout);
  const auditStatement = buildAdminEventStatement(db, { adminUserId: update.adminUserId, action: 'flag_update', targetUserId: null, meta: { key: update.key, enabled, rollout } });
  await db.batch([flagStatement, auditStatement]);
  return { kind: 'ok' as const, key: update.key, enabled: enabled === 1, rollout_percentage: rollout };
}

export async function updateAdminSetting(input: { db: D1Database; key: string; value: string; adminUserId: string }) {
  const validator = SETTING_VALIDATORS[input.key];
  if (!validator) return { kind: 'bad_setting' as const };
  const value = validator(input.value);
  if (value == null) return { kind: 'bad_value' as const };
  const settingStatement = input.db.prepare('INSERT INTO feature_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(input.key, value);
  const auditStatement = buildAdminEventStatement(input.db, { adminUserId: input.adminUserId, action: 'setting_update', targetUserId: null, meta: { key: input.key, value } });
  await input.db.batch([settingStatement, auditStatement]);
  return { kind: 'ok' as const, key: input.key, value };
}
