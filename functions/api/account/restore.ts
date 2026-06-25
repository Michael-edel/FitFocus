// Cloudflare Pages Function: POST /api/account/restore
// Compatibility endpoint. Soft-deleted accounts are restored only after
// re-authentication in the Google/Apple OAuth callbacks.

import { json } from "../_lib/auth";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

export const onRequestPost: PagesFunction<Env> = async () => {
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
