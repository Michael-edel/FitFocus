// Cloudflare Pages Function: POST /api/account/restore
// Restores a soft-deleted account if still within the grace window.

import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);

    const row = await db.prepare("SELECT deleted_at, deletion_scheduled_at FROM users WHERE id = ? LIMIT 1")
      .bind(user.sub)
      .first<any>();

    if (!row?.deleted_at) return json({ ok: true, restored: false, reason: "NOT_DELETED" }, 200);

    // If past scheduled deletion time, deny restore (data may be gone soon/now)
    const okRow = await db.prepare(
      "SELECT 1 ok FROM users WHERE id = ? AND deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at > datetime('now') LIMIT 1"
    ).bind(user.sub).first<any>();

    if (!okRow?.ok) return json({ ok: false, restored: false, reason: "EXPIRED" }, 403);

    await db.prepare(`
      UPDATE users
      SET deleted_at = NULL, deletion_scheduled_at = NULL, is_active = 1
      WHERE id = ?
    `).bind(user.sub).run();

    return json({ ok: true, restored: true }, 200);
  } catch {
    return json({ ok: false, error: "UNAUTH" }, 401);
  }
};
