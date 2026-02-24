import { requireDB } from "./db";

export async function logAdminEvent(db: D1Database, params: {
  adminUserId: string;
  action: string;
  targetUserId?: string | null;
  meta?: any;
}) {
  const ts = Date.now();
  const id = crypto.randomUUID();
  const meta_json = params.meta ? JSON.stringify(params.meta) : null;

  await db.prepare(
    "INSERT INTO admin_events (id, admin_user_id, ts, action, target_user_id, meta_json) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, params.adminUserId, ts, params.action, params.targetUserId || null, meta_json).run();
}
