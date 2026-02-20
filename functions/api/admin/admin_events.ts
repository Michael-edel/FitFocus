// GET /api/admin/admin_events - recent admin audit events (admin-only)
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));
  const db = requireDB(env);

  const { results } = await db.prepare(`
    SELECT e.id, e.ts, e.action, e.admin_user_id, au.email as admin_email, e.target_user_id, tu.email as target_email, e.meta_json
    FROM admin_events e
    LEFT JOIN users au ON au.id = e.admin_user_id
    LEFT JOIN users tu ON tu.id = e.target_user_id
    ORDER BY e.ts DESC
    LIMIT ?
  `).bind(limit).all<any>();

  return json({ ok: true, events: results || [] });
};
