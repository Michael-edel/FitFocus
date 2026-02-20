// Account deletion helpers (B2C-safe): soft delete + scheduled hard delete
// NOTE: D1/SQLite. Use db.batch for atomic-ish multi-statement operations.

export async function softDeleteAccount(db: D1Database, userId: string): Promise<void> {
  const nowMs = Date.now();
  // Soft delete user + schedule hard delete in 30 days
  await db.prepare(`
    UPDATE users
    SET
      deleted_at = datetime('now'),
      deletion_scheduled_at = datetime('now', '+30 days'),
      is_active = 0
    WHERE id = ?
  `).bind(userId).run();

  // Best-effort: remove family membership; if owner, mark family deleted and detach members/menus
  const fam = await db.prepare("SELECT id FROM families WHERE owner_user_id = ? LIMIT 1").bind(userId).first<any>();
  if (fam?.id) {
    await db.prepare("DELETE FROM family_menus WHERE family_id = ?").bind(fam.id).run();
    await db.prepare("DELETE FROM family_members WHERE family_id = ?").bind(fam.id).run();
    // keep families row for audit; will be hard-deleted when user hard-deleted
  } else {
    await db.prepare("DELETE FROM family_members WHERE user_id = ?").bind(userId).run();
  }

  // Revoke all sessions (logout everywhere)
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();

  // Optional: reduce PII immediately (keep email for restore window; you can anonymize after hard delete)
  // You may choose to null name/picture here, but keep minimal for restore UX.
}

export async function hardDeleteAccount(db: D1Database, userId: string): Promise<void> {
  // Hard delete all user-linked data. Order matters.
  const stmts = [
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_kv WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM usage_daily WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM subscriptions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM invite_redemptions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM ai_events WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_profiles WHERE user_id = ?").bind(userId),
    // Recipes: some builds use owner_user_id
    db.prepare("DELETE FROM recipes WHERE owner_user_id = ?").bind(userId),
  ];

  // Family: if owner, remove family entities; otherwise membership already removed by soft delete
  const fam = await db.prepare("SELECT id FROM families WHERE owner_user_id = ? LIMIT 1").bind(userId).first<any>();
  if (fam?.id) {
    stmts.push(db.prepare("DELETE FROM family_menus WHERE family_id = ?").bind(fam.id));
    stmts.push(db.prepare("DELETE FROM family_members WHERE family_id = ?").bind(fam.id));
    stmts.push(db.prepare("DELETE FROM families WHERE id = ?").bind(fam.id));
  } else {
    stmts.push(db.prepare("DELETE FROM family_members WHERE user_id = ?").bind(userId));
  }

  stmts.push(db.prepare("DELETE FROM users WHERE id = ?").bind(userId));

  // D1 batch executes sequentially; if one fails, others may still have executed.
  await db.batch(stmts);
}
