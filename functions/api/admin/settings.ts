// /api/admin/settings
// Admin-only management of feature_settings (string/number settings stored in D1).
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { logAdminEvent } from "../_lib/admin_audit";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

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

  await db.prepare(
    "INSERT INTO feature_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(key, value).run();

  await logAdminEvent(db, { adminUserId: user.sub, action: "setting_update", targetUserId: null, meta: { key, value } });

  return json({ ok: true, key, value });
};
