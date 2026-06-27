type AdminEventParams = {
  adminUserId: string;
  action: string;
  targetUserId?: string | null;
  meta?: Record<string, unknown> | null;
};

function adminEventValues(params: AdminEventParams) {
  const ts = Date.now();
  const id = crypto.randomUUID();
  const meta_json = params.meta ? JSON.stringify(params.meta) : null;
  return [id, params.adminUserId, ts, params.action, params.targetUserId || null, meta_json];
}

export function buildAdminEventStatement(db: D1Database, params: AdminEventParams) {
  return db.prepare(
    "INSERT INTO admin_events (id, admin_user_id, ts, action, target_user_id, meta_json) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(...adminEventValues(params));
}

export function buildAdminEventAfterChangeStatement(db: D1Database, params: AdminEventParams) {
  return db.prepare(
    "INSERT INTO admin_events (id, admin_user_id, ts, action, target_user_id, meta_json) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0"
  ).bind(...adminEventValues(params));
}

export async function logAdminEvent(db: D1Database, params: AdminEventParams) {
  await buildAdminEventStatement(db, params).run();
}
