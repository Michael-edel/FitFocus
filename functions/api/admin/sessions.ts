// Cloudflare Pages Function: /api/admin/sessions
// Admin-only sessions viewer/revoker.
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || "").trim();
  if (!userId) return json({ sessions: [] });

  const db = requireDB(env);
  const { results } = await db
    .prepare("SELECT id, created_at, expires_at, revoked, user_agent, ip FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .bind(userId)
    .all();

  return json({ sessions: results || [] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const body = await request.json().catch(() => null) as any;
  const userId = String(body?.user_id || "").trim();
  const sessionId = String(body?.session_id || "").trim();
  const action = String(body?.action || "revoke");
  if (!userId || !sessionId) return json({ error: "BAD_REQUEST" }, 400);
  if (action !== "revoke") return json({ error: "BAD_ACTION" }, 400);

  const db = requireDB(env);
  await db.prepare("UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ?").bind(sessionId, userId).run();
  return json({ ok: true });
};
