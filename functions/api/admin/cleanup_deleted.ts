// Cloudflare Pages Function: POST /api/admin/cleanup_deleted
// Hard-deletes accounts past deletion_scheduled_at. Admin-only.

import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { cleanupDeletedAccounts, normalizeCleanupRequestLimit } from "../_lib/account_cleanup";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import type { SupportAttachmentBucket } from "../_lib/support_attachments";
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };

const handleAdminCleanupPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ ok: false, error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ ok: false, error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  // Optional body.limit
  let limit = 50;
  try {
    const body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
    limit = normalizeCleanupRequestLimit(body, 50);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ ok: false, error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
  }

  const result = await cleanupDeletedAccounts(db, {
    limit,
    actorUserId: user.sub,
    logAction: "cleanup_deleted",
    supportAttachments: env.SUPPORT_ATTACHMENTS,
  });
  return json(result, 200);
};

/** Logs the result only; cleanup targets and attachment failures remain private. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleAdminCleanupPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('admin.cleanup_deleted.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
