// Cloudflare Pages Function: /api/admin/users
// Admin-only user search (by email or id).
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const url = new URL(request.url);
  const q = String(url.searchParams.get("query") || "").trim();
  if (!q) return json({ users: [] });

  const db = requireDB(env);
  const like = `%${q}%`;

  const { results } = await db
    .prepare("SELECT id, email, created_at FROM users WHERE id LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT 30")
    .bind(like, like)
    .all();

  return json({ users: results || [] });
};
