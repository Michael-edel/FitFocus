// Cloudflare Pages Function: /api/admin/user_roles
// Admin-only role management.

import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { logAdminEvent } from "../_lib/admin_audit";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id") || "";
  if (!userId) return json({ error: "BAD_REQUEST", message: "user_id required" }, 400);

  const db = requireDB(env);
  const { results } = await db.prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role").bind(userId).all<{ role: string }>();
  return json({ user_id: userId, roles: (results || []).map(r => r.role) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const body = await request.json().catch(() => null) as any;
  const userId = String(body?.user_id || "").trim();
  const role = String(body?.role || "").trim();
  const action = String(body?.action || "add").trim(); // add | remove
  if (!userId || !role) return json({ error: "BAD_REQUEST", message: "user_id and role required" }, 400);

  const db = requireDB(env);
  if (action === "remove") {
    await db.prepare("DELETE FROM user_roles WHERE user_id = ? AND role = ?").bind(userId, role).run();
  } else {
    await db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)").bind(userId, role).run();
  }
  await logAdminEvent(db, { adminUserId: user.id, action: action === 'remove' ? 'role_remove' : 'role_add', targetUserId: userId, meta: { role } });


  const { results } = await db.prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role").bind(userId).all<{ role: string }>();
  return json({ ok: true, user_id: userId, roles: (results || []).map(r => r.role) });
};
