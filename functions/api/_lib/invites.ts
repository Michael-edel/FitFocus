type RunResult = { changes?: number; meta?: { changes?: number } } | null | undefined;

function changedRows(result: RunResult): number {
  return Number(result?.changes ?? result?.meta?.changes ?? 0);
}

export type ConsumeInviteResult =
  | { ok: true; already: boolean }
  | { ok: false; error: "INVITE_INVALID" };

export async function consumeInviteCode(
  db: D1Database,
  code: string,
  userId: string,
  nowSec: number,
): Promise<ConsumeInviteResult> {
  const existing = await db
    .prepare("SELECT 1 as ok FROM invite_redemptions WHERE code = ? AND user_id = ? LIMIT 1")
    .bind(code, userId)
    .first<{ ok?: number }>();

  if (existing?.ok) return { ok: true, already: true };

  const updated = await db
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

  if (changedRows(updated) !== 1) return { ok: false, error: "INVITE_INVALID" };

  const inserted = await db
    .prepare("INSERT OR IGNORE INTO invite_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)")
    .bind(code, userId, nowSec)
    .run();

  if (changedRows(inserted) !== 1) {
    await db
      .prepare("UPDATE invite_codes SET uses = MAX(0, uses - 1) WHERE code = ?")
      .bind(code)
      .run();
    return { ok: true, already: true };
  }

  return { ok: true, already: false };
}
