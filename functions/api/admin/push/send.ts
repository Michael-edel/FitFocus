// Cloudflare Pages Function: /api/admin/push/send
// Admin-only push broadcast / segmented push sender.

import { requireUser, json } from "../../_lib/auth";
import { requireDB } from "../../_lib/db";
import { requireRole } from "../../_lib/rbac";
import { requireAdminRequest } from "../../_lib/admin_guard";
import { logApiEvent, requestIdFor, withRequestId } from '../../_lib/observability';
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../../_lib/request_body";
import { executeAdminPushSend, type AdminPushSendEnv } from "../../_lib/admin_push_send";

type Env = AdminPushSendEnv;


const handlePushSend: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try {
    requireRole(user, "admin");
  } catch {
    return json({ error: "FORBIDDEN" }, 403);
  }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  let body = null;
  try {
    body = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }

  return json(await executeAdminPushSend({
    db,
    env,
    adminUserId: user.sub,
    body,
  }), 200);
};

/** Correlates every administrative push response with a body-free server event. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handlePushSend(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('admin.push.send.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
