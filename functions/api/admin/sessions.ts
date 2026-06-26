// Cloudflare Pages Function: /api/admin/sessions
// Admin-only sessions viewer/revoker.
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { buildAdminEventAfterChangeStatement } from "../_lib/admin_audit";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

function changedRows(result: any): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }
  const db = requireDB(env);
  await requireAdminRequest(user, request, db);


  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || "").trim();
  if (!userId) return json({ sessions: [] });

  const target = await db
    .prepare("SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1")
    .bind(userId)
    .first<{ id: string }>();
  if (!target) return json({ error: "NOT_FOUND", message: "User not found" }, 404);

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
  const db = requireDB(env);
  await requireAdminRequest(user, request, db);


  let body: any = null;
  try {
    body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  const userId = String(body?.user_id || "").trim();
  const sessionId = String(body?.session_id || "").trim();
  const action = String(body?.action || "revoke");
  if (!userId || !sessionId) return json({ error: "BAD_REQUEST" }, 400);
  if (action !== "revoke") return json({ error: "BAD_ACTION" }, 400);

  const target = await db
    .prepare("SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1")
    .bind(userId)
    .first<{ id: string }>();
  if (!target) return json({ error: "NOT_FOUND", message: "User not found" }, 404);

  const revokeStatement = db.prepare("UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ?").bind(sessionId, userId);
  const auditStatement = buildAdminEventAfterChangeStatement(db, {
    adminUserId: user.sub,
    action: "session_revoke",
    targetUserId: userId,
    meta: { session_id: sessionId },
  });
  const [revokeResult] = await db.batch([revokeStatement, auditStatement]);
  if (changedRows(revokeResult) === 0) return json({ error: "NOT_FOUND", message: "Session not found" }, 404);

  return json({ ok: true });
};
