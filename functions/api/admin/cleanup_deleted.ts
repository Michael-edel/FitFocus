// Cloudflare Pages Function: POST /api/admin/cleanup_deleted
// Hard-deletes accounts past deletion_scheduled_at. Admin-only.

import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { hardDeleteAccount } from "../_lib/account_delete";
import { logAdminEvent } from "../_lib/admin_audit";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ ok: false, error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ ok: false, error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  // Optional body.limit
  let limit = 50;
  try {
    const body = await request.json();
    if (body?.limit) limit = Math.min(200, Math.max(1, Number(body.limit)));
  } catch {}

  const rows = await db.prepare(
    "SELECT id FROM users WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= datetime('now') LIMIT ?"
  ).bind(limit).all<{ id: string }>();

  const ids = (rows.results || []).map(r => String(r.id)).filter(Boolean);
  let deleted = 0;

  for (const id of ids) {
    try {
      await hardDeleteAccount(db, id);
      deleted++;
    } catch {}
  }

  await logAdminEvent(db, { adminUserId: user.sub, action: 'cleanup_deleted', meta: { found: ids.length, deleted, limit } });

  return json({ ok: true, found: ids.length, deleted }, 200);
};
