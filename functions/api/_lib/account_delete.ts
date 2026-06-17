// Account deletion helpers (B2C-safe): soft delete + scheduled hard delete
// NOTE: D1/SQLite. Use db.batch for atomic-ish multi-statement operations.

import { logAdminEvent } from "./admin_audit";

export interface DeleteUserResult {
  ok: boolean;
  message?: string;
}

export async function deleteUserAccountAndAllData(
  db: D1Database,
  userId: string,
  dryRun = false,
  logAsAdminId?: string,
): Promise<DeleteUserResult> {
  const stmts: ReturnType<D1Database["prepare"]>[] = [];

  const isAdmin = await db
    .prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1")
    .bind(userId)
    .first<any>();

  if (isAdmin) {
    const activeAdminsCountRow = await db.prepare(`
      SELECT COUNT(*) as c
      FROM user_roles ur
      JOIN users u ON u.id = ur.user_id
      WHERE ur.role = 'admin' AND u.is_active = 1 AND u.deleted_at IS NULL
    `).first<any>();

    const activeAdminsCount = Number(activeAdminsCountRow?.c || 0);

    if (activeAdminsCount <= 1) {
      if (logAsAdminId) {
        await logAdminEvent(db, {
          adminUserId: logAsAdminId,
          action: "delete_user_failed_last_admin",
          targetUserId: userId,
        });
      }

      return { ok: false, message: "Нельзя удалить последнего активного администратора." };
    }
  }

  const familyOwnerRow = await db
    .prepare("SELECT id FROM families WHERE owner_user_id = ? AND is_active = 1 LIMIT 1")
    .bind(userId)
    .first<any>();

  if (familyOwnerRow) {
    if (logAsAdminId) {
      await logAdminEvent(db, {
        adminUserId: logAsAdminId,
        action: "delete_user_failed_family_owner",
        targetUserId: userId,
        meta: { familyId: familyOwnerRow.id },
      });
    }

    return { ok: false, message: "Нельзя удалить пользователя, который является владельцем активной семьи." };
  }

  if (dryRun) {
    return { ok: true, message: "Dry run: no changes made." };
  }

  stmts.push(db.prepare("UPDATE sessions SET revoked = 1 WHERE user_id = ?").bind(userId));

  const ownedFam = await db
    .prepare("SELECT id FROM families WHERE owner_user_id = ? LIMIT 1")
    .bind(userId)
    .first<any>();

  if (ownedFam?.id) {
    stmts.push(
      db.prepare("DELETE FROM family_menus WHERE family_id = ?").bind(ownedFam.id),
      db.prepare("DELETE FROM weekly_menu_portions WHERE weekly_menu_id IN (SELECT id FROM weekly_menus WHERE family_id = ?)").bind(ownedFam.id),
      db.prepare("DELETE FROM weekly_menus WHERE family_id = ?").bind(ownedFam.id),
      db.prepare("DELETE FROM weekly_menu_items WHERE family_id = ?").bind(ownedFam.id),
      db.prepare("DELETE FROM family_invites WHERE family_id = ?").bind(ownedFam.id),
      db.prepare("DELETE FROM family_members WHERE family_id = ?").bind(ownedFam.id),
      db.prepare("DELETE FROM families WHERE id = ?").bind(ownedFam.id),
    );
  } else {
    stmts.push(db.prepare("DELETE FROM family_members WHERE user_id = ?").bind(userId));
  }

  stmts.push(
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_kv WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM usage_daily WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM subscriptions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM invite_redemptions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM ai_events WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_profiles WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM recipes WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM weekly_menu_items WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM shopping_checked WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM family_invites WHERE created_by_user_id = ? OR used_by_user_id = ?").bind(userId, userId),
    db.prepare("DELETE FROM weekly_menu_portions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM food_records WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM weights WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  );

  try {
    await db.batch(stmts);

    if (logAsAdminId) {
      await logAdminEvent(db, {
        adminUserId: logAsAdminId,
        action: "delete_user_atomic_successful",
        targetUserId: userId,
      });
    }

    return { ok: true };
  } catch (e: any) {
    console.error(`Failed to delete user ${userId} data:`, e);

    if (logAsAdminId) {
      await logAdminEvent(db, {
        adminUserId: logAsAdminId,
        action: "delete_user_atomic_failed",
        targetUserId: userId,
        meta: { error: e?.message || String(e) },
      });
    }

    return { ok: false, message: "Ошибка при удалении данных пользователя." };
  }
}

export async function softDeleteAccount(db: D1Database, userId: string): Promise<void> {
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE users
    SET
      deleted_at = ?,
      deletion_scheduled_at = datetime(?, '+30 days'),
      is_active = 0
    WHERE id = ?
  `).bind(now, now, userId).run();

  const fam = await db
    .prepare("SELECT id FROM families WHERE owner_user_id = ? LIMIT 1")
    .bind(userId)
    .first<any>();

  if (fam?.id) {
    await db.prepare("DELETE FROM family_menus WHERE family_id = ?").bind(fam.id).run();
    await db.prepare("DELETE FROM weekly_menu_portions WHERE weekly_menu_id IN (SELECT id FROM weekly_menus WHERE family_id = ?)").bind(fam.id).run();
    await db.prepare("DELETE FROM weekly_menus WHERE family_id = ?").bind(fam.id).run();
    await db.prepare("DELETE FROM weekly_menu_items WHERE family_id = ?").bind(fam.id).run();
    await db.prepare("DELETE FROM family_invites WHERE family_id = ?").bind(fam.id).run();
    await db.prepare("DELETE FROM family_members WHERE family_id = ?").bind(fam.id).run();
  } else {
    await db.prepare("DELETE FROM family_members WHERE user_id = ?").bind(userId).run();
  }

  await db.prepare("UPDATE sessions SET revoked = 1 WHERE user_id = ?").bind(userId).run();
}

export async function hardDeleteAccount(db: D1Database, userId: string): Promise<void> {
  await deleteUserAccountAndAllData(db, userId, false, undefined);
}

export async function ensureNotLastAdmin(db: D1Database, userId: string): Promise<void> {
  const isAdminRow = await db
    .prepare("SELECT 1 as x FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1")
    .bind(userId)
    .first<any>();

  if (!isAdminRow) return;

  const row = await db.prepare(`
    SELECT COUNT(*) as c
    FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.role = 'admin' AND u.is_active = 1 AND u.deleted_at IS NULL
  `).first<any>();

  const adminsCount = Number(row?.c || 0);

  if (adminsCount <= 1) {
    throw new Error("Нельзя удалить аккаунт последнего администратора.");
  }
}

export async function checkIfOwnerOfActiveFamily(db: D1Database, userId: string): Promise<boolean> {
  const familyOwnerRow = await db
    .prepare("SELECT id FROM families WHERE owner_user_id = ? AND is_active = 1 LIMIT 1")
    .bind(userId)
    .first<any>();

  return Boolean(familyOwnerRow);
}