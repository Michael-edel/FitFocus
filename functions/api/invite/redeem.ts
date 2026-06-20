// /api/invite/redeem
// Authenticated endpoint to redeem (consume) beta invite code for the current user.

import { json, requireUser } from "../_lib/auth";
import { requireDB, nowMs, toApiError } from "../_lib/db";

type Env = { DB: D1Database };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env as any);
    const db = requireDB(env as any);

    const body: any = await request.json().catch(() => null);
    const code = String(body?.code || "").trim();

    if (!code) return json({ ok: false, error: "BAD_REQUEST" }, 400);

    const nowSec = Math.floor(nowMs() / 1000);

    // 1) Try insert redemption first (idempotent).
    const ins = await db
      .prepare("INSERT OR IGNORE INTO invite_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)")
      .bind(code, user.sub, nowSec)
      .run();

    // Already redeemed for this user -> ok (do not increment uses again)
    if (ins?.changes === 0) return json({ ok: true, already: true }, 200);

    // 2) Increment uses only if code is valid and has remaining uses.
    const upd = await db
      .prepare(
        `UPDATE invite_codes
         SET uses = uses + 1
         WHERE code = ?
           AND revoked = 0
           AND (expires_at IS NULL OR expires_at > ?)
           AND uses < COALESCE(max_uses, 1)`
      )
      .bind(code, nowSec)
      .run();

    if (!upd?.changes) {
      // rollback redemption insert (so user can try another code)
      await db.prepare("DELETE FROM invite_redemptions WHERE code = ? AND user_id = ?").bind(code, user.sub).run();
      return json({ ok: false, error: "INVITE_INVALID" }, 403);
    }

    return json({ ok: true }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ ok: false, error: apiErr }, 400);
  }
};
