// GET /api/admin/admins - list admin users (admin-only)
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };
type AdminRow = {
  id: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  created_at?: number | null;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const { results } = await db.prepare(`
    SELECT u.id, u.email, u.name, u.picture, u.created_at
    FROM users u
    JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
    WHERE u.deleted_at IS NULL
    ORDER BY u.created_at DESC
    LIMIT 200
  `).all<AdminRow>();

  return json({ ok: true, admins: results || [] });
};
