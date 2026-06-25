import { cleanupOldAiRateLimitBuckets } from "./ai_limits";
import { hardDeleteAccount } from "./account_delete";
import { logAdminEvent } from "./admin_audit";
import type { SupportAttachmentBucket } from "./support_attachments";

export interface CleanupDeletedAccountsOptions {
  limit?: number;
  actorUserId?: string;
  logAction?: string;
  supportAttachments?: SupportAttachmentBucket;
}

export interface CleanupDeletedAccountsResult {
  ok: true;
  found: number;
  deleted: number;
  failed: number;
  failures: Array<{ id: string; error: string }>;
  oldAiRateBucketsDeleted: number;
  limit: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || "ERROR");
  return String(error || "ERROR");
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
  const failures: Array<{ id: string; error: string }> = [];

  for (const id of ids) {
    try {
      await hardDeleteAccount(db, id, { supportAttachments: options.supportAttachments });
      deleted++;
    } catch (error) {
      failures.push({ id, error: errorMessage(error) });
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
      meta: { found: ids.length, deleted, failed: failures.length, failures: failures.slice(0, 20), limit, oldAiRateBucketsDeleted },
    });
  } catch {
    // Audit logging is useful, but cleanup must still return a deterministic result.
  }

  return { ok: true, found: ids.length, deleted, failed: failures.length, failures: failures.slice(0, 20), oldAiRateBucketsDeleted, limit };
}
