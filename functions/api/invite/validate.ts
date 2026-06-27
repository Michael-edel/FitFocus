// /api/invite/validate?code=XXXX
// Public endpoint to validate beta invite code (no auth)
import { json } from "../_lib/auth";
import { requireDB, nowMs, toApiError } from "../_lib/db";

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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDB(env);
    const url = new URL(request.url);
    const code = String(url.searchParams.get("code") || "").trim();
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

    if (!row) return json({ valid: false }, 404);
    const revoked = Number(row.revoked || 0) === 1;
    const expired = row.expires_at != null && Number(row.expires_at) <= now;
    const maxUses = row.max_uses == null ? 1 : Number(row.max_uses);
    const uses = Number(row.uses || 0);
    const exhausted = uses >= maxUses;

    const valid = !revoked && !expired && !exhausted;

    return json(
      {
        valid,
        code: row.code,
        note: row.note ?? null,
        expiresAt: row.expires_at ?? null,
        remainingUses: Math.max(0, maxUses - uses),
        revoked,
      },
      valid ? 200 : 200
    );
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return json({ valid: false, error: apiErr }, 400);
  }
};
