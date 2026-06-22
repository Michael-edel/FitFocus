// Cloudflare Pages Function: POST /api/admin/cleanup_deleted
// Hard-deletes accounts past deletion_scheduled_at. Admin-only.

import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { cleanupDeletedAccounts } from "../_lib/account_cleanup";

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

  const result = await cleanupDeletedAccounts(db, { limit, actorUserId: user.sub, logAction: "cleanup_deleted" });
  return json(result, 200);
};
