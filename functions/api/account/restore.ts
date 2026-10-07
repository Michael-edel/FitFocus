// Cloudflare Pages Function: POST /api/account/restore
// Compatibility endpoint. Soft-deleted accounts are restored only after
// re-authentication in the Google/Apple OAuth callbacks.

import { json } from "../_lib/auth";
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

const handleAccountRestorePost: PagesFunction<Env> = async () => {
  return json(
    {
      ok: false,
      restored: false,
      error: "RESTORE_REQUIRES_REAUTH",
      message: "Войдите снова через Google или Apple, чтобы восстановить аккаунт в течение периода восстановления.",
    },
    409,
  );
};

/** Correlates the re-authentication-only restore response without session data. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleAccountRestorePost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('account.restore.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
