export async function revokeSession(db: D1Database, sessionId: string, userId: string) {
  await db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ?').bind(sessionId, userId).run();
}

export async function revokeAllUserSessions(db: D1Database, userId: string) {
  await db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').bind(userId).run();
}
