import { cleanupOldAiRateLimitBuckets } from "./ai_limits";
import { hardDeleteAccount } from "./account_delete";
import { logAdminEvent } from "./admin_audit";

export interface CleanupDeletedAccountsOptions {
  limit?: number;
  actorUserId?: string;
  logAction?: string;
}

export interface CleanupDeletedAccountsResult {
  ok: true;
  found: number;
  deleted: number;
  oldAiRateBucketsDeleted: number;
  limit: number;
}

export async function cleanupDeletedAccounts(
  db: D1Database,
  options: CleanupDeletedAccountsOptions = {},
): Promise<CleanupDeletedAccountsResult> {
  const limit = Math.min(200, Math.max(1, Math.floor(Number(options.limit || 50))));
  const rows = await db
    .prepare("SELECT id FROM users WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= datetime('now') LIMIT ?")
    .bind(limit)
    .all<{ id: string }>();

  const ids = (rows.results || []).map((row) => String(row.id)).filter(Boolean);
  let deleted = 0;

  for (const id of ids) {
    try {
      await hardDeleteAccount(db, id);
      deleted++;
    } catch {
      // Continue the batch; one broken user must not block GDPR cleanup for others.
    }
  }

  let oldAiRateBucketsDeleted = 0;
  try {
    oldAiRateBucketsDeleted = await cleanupOldAiRateLimitBuckets(db, Date.now() - 14 * 24 * 60 * 60 * 1000, 1000);
  } catch {
    oldAiRateBucketsDeleted = 0;
  }

  try {
    await logAdminEvent(db, {
      adminUserId: options.actorUserId || "system:cleanup",
      action: options.logAction || "cleanup_deleted",
      meta: { found: ids.length, deleted, limit, oldAiRateBucketsDeleted },
    });
  } catch {
    // Audit logging is useful, but cleanup must still return a deterministic result.
  }

  return { ok: true, found: ids.length, deleted, oldAiRateBucketsDeleted, limit };
}
