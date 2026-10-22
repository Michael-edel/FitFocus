// Cloudflare Pages Function: POST /api/account/delete
// B2C-safe delete: soft delete + schedule hard delete in 30 days.
// Requires confirmation token in body: { confirm: "DELETE" }

import { json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { checkIfOwnerOfActiveFamily, ensureNotLastAdmin, logSelfServiceAccountDeletion, softDeleteAccount } from "../_lib/account_delete";
import { asString } from "../_lib/json";
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';
import { requireScopedStateUser, withSessionGuard } from '../_lib/state_session';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

function publicDeleteError(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) {
    return json({ ok: false, error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
  }
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTH" || code === "AUTH_CONFIG" || code === "DB_CONFIG"
    || code === "STATE_SESSION_CHANGED" || code === "STATE_SESSION_REQUIRED") {
    return json({ ok: false, error: "UNAUTH" }, 401);
  }
  if (code.includes("последнего администратора")) {
    return json({
      ok: false,
      error: "ACCOUNT_DELETE_BLOCKED",
      message: "Удаление аккаунта сейчас заблокировано. Обратитесь в поддержку.",
    }, 409);
  }
  return json({ ok: false, error: "ACCOUNT_DELETE_FAILED" }, 500);
}

const handleAccountDeletePost: PagesFunction<Env> = async ({ request, env }) => {
  const t0 = Date.now();
  try {
    const user = await requireScopedStateUser(request, env);
    const db = requireDB(env);

    const body = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES).catch((error) => {
      if (error instanceof RequestBodyTooLargeError) throw error;
      return null;
    });
    const confirm = asString(body?.confirm).toUpperCase();
    if (confirm !== "DELETE") {
      return json({ ok: false, error: "CONFIRM_REQUIRED" }, 400);
    }

    await ensureNotLastAdmin(db, user.sub);
    const ownsActiveFamily = await checkIfOwnerOfActiveFamily(db, user.sub);
    if (ownsActiveFamily) {
      return json({
        ok: false,
        error: "FAMILY_OWNER_DELETE_BLOCKED",
        message: "Сначала передайте владельца семьи другому участнику или удалите семейный профиль.",
      }, 409);
    }
    await softDeleteAccount(db, user.sub);

    await logSelfServiceAccountDeletion(db, user.sub, Date.now() - t0);

    // The account and all of its sessions are revoked by softDeleteAccount. Do not
    // expire the shared cookie here: a slower response could otherwise erase a
    // different account's cookie installed by another tab after this request.
    return json({ ok: true, scheduled_days: 30 });
  } catch (error: unknown) {
    return publicDeleteError(error);
  }
};

/** Correlates account deletion outcomes without logging identity or deletion details. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleAccountDeletePost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('account.delete.response', { requestId, status: response.status });
  return withRequestId(withSessionGuard(response, context.request, 'Account-Delete'), requestId);
};
