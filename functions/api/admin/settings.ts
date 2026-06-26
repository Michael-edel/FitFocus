// /api/admin/settings
// Admin-only management of feature_settings (string/number settings stored in D1).
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { buildAdminEventStatement } from "../_lib/admin_audit";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

const SETTING_VALIDATORS: Record<string, (value: string) => string | null> = {
  ai_cost_input_per_1m_usd: nonNegativeDecimal,
  ai_cost_output_per_1m_usd: nonNegativeDecimal,
  ai_max_calls_per_user_day: nonNegativeInteger,
  ai_max_cost_per_user_day_usd: nonNegativeDecimal,
  ai_max_cost_total_day_usd: nonNegativeDecimal,
  ai_on_limit_action: limitAction,
};

function nonNegativeDecimal(value: string): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(n);
}

function nonNegativeInteger(value: string): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(Math.floor(n));
}

function limitAction(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized === "fallback" || normalized === "block" ? normalized : null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const { results } = await db.prepare("SELECT key, value FROM feature_settings ORDER BY key").all();
  return json({ settings: results || [] });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const body = (await request.json().catch(() => null)) as any;
  const key = String(body?.key || "").trim();
  const value = String(body?.value ?? "").trim();
  if (!key) return json({ error: "BAD_REQUEST", message: "key required" }, 400);
  const validator = SETTING_VALIDATORS[key];
  if (!validator) return json({ error: "BAD_SETTING", message: "Unknown setting" }, 400);
  const normalizedValue = validator(value);
  if (normalizedValue == null) return json({ error: "BAD_VALUE", message: "Invalid setting value" }, 400);

  const settingStatement = db.prepare(
    "INSERT INTO feature_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(key, normalizedValue);

  const auditStatement = buildAdminEventStatement(db, {
    adminUserId: user.sub,
    action: "setting_update",
    targetUserId: null,
    meta: { key, value: normalizedValue },
  });
  await db.batch([settingStatement, auditStatement]);

  return json({ ok: true, key, value: normalizedValue });
};
