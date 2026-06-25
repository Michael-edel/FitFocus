// Account deletion helpers (B2C-safe): soft delete + scheduled hard delete
// NOTE: D1/SQLite. Use db.batch for atomic-ish multi-statement operations.

import { logAdminEvent } from "./admin_audit";
import { parseAttachmentsJson, type SupportAttachmentBucket } from "./support_attachments";

export interface DeleteUserResult {
  ok: boolean;
  message?: string;
}

export interface DeleteUserAccountOptions {
  supportAttachments?: SupportAttachmentBucket;
}

function changedRows(result: any): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

async function collectSupportStorageKeys(db: D1Database, userId: string): Promise<string[]> {
  const keys = new Set<string>();
  const rows = await db.prepare(
    `SELECT attachments_json
     FROM support_feedback
     WHERE user_id = ?
     UNION ALL
     SELECT attachments_json
     FROM support_feedback_messages
     WHERE author_user_id = ?
        OR ticket_id IN (SELECT id FROM support_feedback WHERE user_id = ?)`
  ).bind(userId, userId, userId).all<{ attachments_json?: string | null }>();

  for (const row of rows.results || []) {
    for (const attachment of parseAttachmentsJson(row.attachments_json)) {
      if (attachment.storage_key) keys.add(attachment.storage_key);
    }
  }
  return [...keys];
}

async function deleteSupportStorageKeys(bucket: SupportAttachmentBucket | undefined, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  if (!bucket?.delete) {
    throw new Error("SUPPORT_ATTACHMENTS_DELETE_UNAVAILABLE");
  }
  await bucket.delete(keys);
}

async function guardHardDeleteAccount(db: D1Database, userId: string): Promise<void> {
  const result = await db.prepare(`
    UPDATE users
    SET updated_at = ?
    WHERE id = ?
      AND (
        NOT EXISTS (
          SELECT 1
          FROM user_roles ur_self
          WHERE ur_self.user_id = ?
            AND ur_self.role = 'admin'
        )
        OR is_active != 1
        OR deleted_at IS NOT NULL
        OR (
          SELECT COUNT(*)
          FROM user_roles ur
          JOIN users u ON u.id = ur.user_id
          WHERE ur.role = 'admin'
            AND u.is_active = 1
            AND u.deleted_at IS NULL
        ) > 1
      )
  `).bind(Date.now(), userId, userId).run();

  if (changedRows(result) !== 0) return;

  const activeAdmin = await db.prepare(`
    SELECT 1 as x
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = ?
      AND ur.role = 'admin'
      AND u.is_active = 1
      AND u.deleted_at IS NULL
    LIMIT 1
  `).bind(userId).first<any>();

  if (activeAdmin) throw new Error("Нельзя удалить последнего активного администратора.");
}

export async function deleteUserAccountAndAllData(
  db: D1Database,
  userId: string,
  dryRun = false,
  logAsAdminId?: string,
  options: DeleteUserAccountOptions = {},
): Promise<DeleteUserResult> {
  const stmts: ReturnType<D1Database["prepare"]>[] = [];

  const isActiveAdmin = await db
    .prepare(`
      SELECT 1
      FROM user_roles ur
      JOIN users u ON u.id = ur.user_id
      WHERE ur.user_id = ?
        AND ur.role = 'admin'
        AND u.is_active = 1
        AND u.deleted_at IS NULL
      LIMIT 1
    `)
    .bind(userId)
    .first<any>();

  if (isActiveAdmin) {
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

  try {
    await guardHardDeleteAccount(db, userId);
  } catch (e: any) {
    const message = e?.message || "Не удалось заблокировать удаление пользователя.";
    if (logAsAdminId && String(message).includes("последнего активного администратора")) {
      await logAdminEvent(db, {
        adminUserId: logAsAdminId,
        action: "delete_user_failed_last_admin",
        targetUserId: userId,
      });
    }
    return { ok: false, message };
  }

  let supportStorageKeys: string[] = [];
  try {
    supportStorageKeys = await collectSupportStorageKeys(db, userId);
    await deleteSupportStorageKeys(options.supportAttachments, supportStorageKeys);
  } catch (e: any) {
    return { ok: false, message: e?.message || "Не удалось удалить вложения поддержки." };
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
      db.prepare("DELETE FROM shopping_checked WHERE family_id = ? OR scope_id = ?").bind(ownedFam.id, `family:${ownedFam.id}`),
      db.prepare("DELETE FROM family_invites WHERE family_id = ?").bind(ownedFam.id),
      db.prepare("DELETE FROM family_members WHERE family_id = ?").bind(ownedFam.id),
      db.prepare("DELETE FROM families WHERE id = ?").bind(ownedFam.id),
    );
  } else {
    stmts.push(db.prepare("DELETE FROM family_members WHERE user_id = ?").bind(userId));
  }

  stmts.push(
    db.prepare("DELETE FROM support_feedback_messages WHERE ticket_id IN (SELECT id FROM support_feedback WHERE user_id = ?) OR author_user_id = ?").bind(userId, userId),
    db.prepare("UPDATE support_feedback SET assigned_admin_user_id = NULL, updated_at = ? WHERE assigned_admin_user_id = ?").bind(Date.now(), userId),
    db.prepare("DELETE FROM support_feedback WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM admin_sessions WHERE admin_user_id = ?").bind(userId),
    db.prepare("DELETE FROM admin_events WHERE admin_user_id = ? OR target_user_id = ?").bind(userId, userId),
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM ai_rate_limits WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_cost_daily WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_achievements WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_kv WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM usage_daily WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM subscriptions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM invite_redemptions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM ai_events WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_profiles WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM recipes WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM weekly_menu_portions WHERE weekly_menu_id IN (SELECT id FROM weekly_menus WHERE created_by_user_id = ?)").bind(userId),
    db.prepare("DELETE FROM weekly_menus WHERE created_by_user_id = ?").bind(userId),
    db.prepare("DELETE FROM weekly_menu_items WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM shopping_checked WHERE scope_id = ? OR scope_id = ?").bind(`personal:${userId}`, userId),
    db.prepare("DELETE FROM family_invites WHERE created_by_user_id = ? OR used_by_user_id = ?").bind(userId, userId),
    db.prepare("DELETE FROM weekly_menu_portions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  );

  try {
    await db.batch(stmts);

    if (logAsAdminId && logAsAdminId !== userId) {
      await logAdminEvent(db, {
        adminUserId: logAsAdminId,
        action: "delete_user_atomic_successful",
        meta: { targetDeleted: true, supportStorageObjectsDeleted: supportStorageKeys.length },
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

  const updateResult = await db.prepare(`
    UPDATE users
    SET
      deleted_at = ?,
      deletion_scheduled_at = datetime(?, '+30 days'),
      is_active = 0
    WHERE id = ?
      AND (
        NOT EXISTS (
          SELECT 1
          FROM user_roles ur_self
          WHERE ur_self.user_id = ?
            AND ur_self.role = 'admin'
        )
        OR (
          SELECT COUNT(*)
          FROM user_roles ur
          JOIN users u ON u.id = ur.user_id
          WHERE ur.role = 'admin'
            AND u.is_active = 1
            AND u.deleted_at IS NULL
        ) > 1
      )
  `).bind(now, now, userId, userId).run();

  if (changedRows(updateResult) === 0) {
    const activeUser = await db
      .prepare("SELECT id, is_active, deleted_at FROM users WHERE id = ? LIMIT 1")
      .bind(userId)
      .first<any>();
    if (!activeUser || !activeUser.is_active || activeUser.deleted_at) return;

    const isAdminRow = await db
      .prepare("SELECT 1 as x FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1")
      .bind(userId)
      .first<any>();
    if (isAdminRow) {
      throw new Error("Нельзя удалить аккаунт последнего администратора.");
    }
    throw new Error("Failed to soft-delete account.");
  }

  const fam = await db
    .prepare("SELECT id FROM families WHERE owner_user_id = ? LIMIT 1")
    .bind(userId)
    .first<any>();

  if (fam?.id) {
    await db.prepare("UPDATE families SET is_active = 0 WHERE id = ?").bind(fam.id).run();
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

export async function hardDeleteAccount(
  db: D1Database,
  userId: string,
  options: DeleteUserAccountOptions = {},
): Promise<DeleteUserResult> {
  const result = await deleteUserAccountAndAllData(db, userId, false, undefined, options);
  if (!result.ok) {
    throw new Error(result.message || "Failed to hard-delete account.");
  }
  return result;
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
