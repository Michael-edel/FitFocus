// Admin session tracking (SOC2-lite)
// Records when an admin uses the admin API, tied to ff_session sid.

export async function touchAdminSession(db: D1Database, params: {
  adminUserId: string;
  sessionId: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const now = Date.now();
  const id = params.sessionId; // stable id per session
  const ip = (params.ip || "").slice(0, 128);
  const ua = (params.userAgent || "").slice(0, 512);

  // Insert once; then update last_seen_at on every admin request.
  await db.prepare(`
    INSERT OR IGNORE INTO admin_sessions (id, admin_user_id, session_id, ip, user_agent, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, params.adminUserId, params.sessionId, ip, ua, now, now).run();

  await db.prepare(`
    UPDATE admin_sessions
    SET last_seen_at = ?
    WHERE session_id = ?
  `).bind(now, params.sessionId).run();
}
