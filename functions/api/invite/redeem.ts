// /api/invite/redeem
// Public endpoint to redeem (consume) beta invite code for a given local user id.
// Used for local (device) profiles so closed-beta can be enforced even without Google auth.

import { json } from "../_lib/auth";
import { requireDB, nowMs, toApiError } from "../_lib/db";

type Env = { DB: D1Database };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDB(env as any);

    const body = await request.json().catch(() => null);
    const code = String(body?.code || "").trim();
    const userId = String(body?.userId || "").trim();

    if (!code || !userId) return json({ ok: false, error: "BAD_REQUEST" }, 400);

    const nowSec = Math.floor(nowMs() / 1000);

    // Ensure table exists (best-effort; harmless if already created)
    await db.prepare(
      "CREATE TABLE IF NOT EXISTS invite_redemptions (code TEXT NOT NULL, user_id TEXT NOT NULL, redeemed_at INTEGER NOT NULL, PRIMARY KEY(code, user_id))"
    ).run();

    // 1) Try insert redemption first (idempotent).
    const ins = await db
      .prepare("INSERT OR IGNORE INTO invite_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)")
      .bind(code, userId, nowSec)
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
      await db.prepare("DELETE FROM invite_redemptions WHERE code = ? AND user_id = ?").bind(code, userId).run();
      return json({ ok: false, error: "INVITE_INVALID" }, 403);
    }

    return json({ ok: true }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ ok: false, error: apiErr }, 400);
  }
};
