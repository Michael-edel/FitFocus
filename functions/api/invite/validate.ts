// /api/invite/validate
// POST { code: "XXXX" }; the code stays in the request body instead of the URL.
import { json } from "../_lib/auth";
import { requireDB, nowMs, toApiError } from "../_lib/db";
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { asString } from "../_lib/json";

type Env = { DB: D1Database };
type InviteCodeRow = {
  code: string;
  created_at?: number;
  note?: string | null;
  max_uses?: number | null;
  uses?: number | null;
  expires_at?: number | null;
  revoked?: number | null;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDB(env);
    let body;
    try {
      body = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) return json({ valid: false, error: "PAYLOAD_TOO_LARGE" }, 413);
      throw error;
    }
    const code = asString(body?.code).trim();
    if (!code) return json({ valid: false, error: "BAD_REQUEST" }, 400);

    const now = Math.floor(nowMs() / 1000);

    const row = await db
      .prepare(
        `SELECT code, created_at, note, max_uses, uses, expires_at, revoked
         FROM invite_codes
         WHERE code = ?
         LIMIT 1`
      )
      .bind(code)
      .first<InviteCodeRow>();

    // Do not distinguish a missing code from an invalid one: this endpoint is
    // intentionally only a yes/no preflight for the registration screen.
    if (!row) return json({ valid: false }, 200);
    const revoked = Number(row.revoked || 0) === 1;
    const expired = row.expires_at != null && Number(row.expires_at) <= now;
    const maxUses = row.max_uses == null ? 1 : Number(row.max_uses);
    const uses = Number(row.uses || 0);
    const exhausted = uses >= maxUses;

    const valid = !revoked && !expired && !exhausted;

    return json({ valid }, 200);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return json({ valid: false, error: apiErr }, 400);
  }
};
