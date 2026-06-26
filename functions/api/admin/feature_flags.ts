// /api/admin/feature_flags
// Admin-only management of feature flags stored in D1.
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { buildAdminEventStatement } from "../_lib/admin_audit";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

const ALLOWED_FEATURE_FLAGS = new Set([
  "achievements_enabled",
  "ai_budget_guard_enabled",
  "ai_emergency_fallback",
  "ai_safe_mode",
  "ai_fallback_mode",
]);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const { results } = await db.prepare("SELECT key, enabled, rollout_percentage FROM feature_flags ORDER BY key").all();
  return json({ flags: results || [] });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const body = (await request.json().catch(() => null)) as any;
  const key = String(body?.key || "").trim();
  if (!key) return json({ error: "BAD_REQUEST", message: "key required" }, 400);
  if (!ALLOWED_FEATURE_FLAGS.has(key)) return json({ error: "BAD_FLAG", message: "Unknown feature flag" }, 400);
  if (typeof body?.enabled !== "boolean") return json({ error: "BAD_ENABLED", message: "enabled must be boolean" }, 400);

  const enabled = body.enabled ? 1 : 0;
  const rawRollout = Number(body?.rollout_percentage ?? 100);
  if (!Number.isFinite(rawRollout)) return json({ error: "BAD_ROLLOUT", message: "rollout_percentage must be a number" }, 400);
  const rollout = Math.max(0, Math.min(100, Math.floor(rawRollout)));

  const flagStatement = db.prepare(
    "INSERT INTO feature_flags (key, enabled, rollout_percentage) VALUES (?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, rollout_percentage = excluded.rollout_percentage"
  ).bind(key, enabled, rollout);

  const auditStatement = buildAdminEventStatement(db, {
    adminUserId: user.sub,
    action: "flag_update",
    targetUserId: null,
    meta: { key, enabled, rollout },
  });
  await db.batch([flagStatement, auditStatement]);

  return json({ ok: true, key, enabled: enabled === 1, rollout_percentage: rollout });
};
