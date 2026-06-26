// /api/admin/invites
// GET: list invite codes (admin only)
// POST: create invite code (admin only)
// PUT: revoke/unrevoke invite code (admin only)
import { json, requireUser } from "../_lib/auth";
import { requireDB, randomCode, nowMs, toApiError } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { buildAdminEventAfterChangeStatement, buildAdminEventStatement } from "../_lib/admin_audit";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

function changedRows(result: any): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    requireRole(user, "admin");
    const db = requireDB(env);
    await requireAdminRequest(user, request, db);

    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(200, toInt(url.searchParams.get("limit"), 100)));

    const rows = await db
      .prepare(
        `SELECT ic.code, ic.created_at, ic.created_by, ic.note, ic.max_uses, ic.uses, ic.expires_at, ic.revoked,
                COALESCE(r.redemption_count, 0) AS redemption_count,
                r.last_redeemed_at
         FROM invite_codes ic
         LEFT JOIN (
           SELECT code, COUNT(*) AS redemption_count, MAX(redeemed_at) AS last_redeemed_at
           FROM invite_redemptions
           GROUP BY code
         ) r ON r.code = ic.code
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<any>();

    return json({ invites: rows.results || [] }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    requireRole(user, "admin");
    const db = requireDB(env);
    await requireAdminRequest(user, request, db);

    const body = (await request.json().catch(() => null)) as any;
    const note = String(body?.note || "").trim();
    const count = Math.max(1, Math.min(50, Number.isFinite(body?.count) ? Math.floor(Number(body.count)) : 1));
    const maxUses = Number.isFinite(body?.max_uses) ? Math.max(1, Math.min(1000, Number(body.max_uses))) : 1;
    const maxExpiryMs = nowMs() + 30 * 24 * 60 * 60 * 1000;
    const requestedExpiresAt = body?.expires_at ? Number(body.expires_at) : null;
    const expiresAt = Number.isFinite(requestedExpiresAt) && requestedExpiresAt > 0
      ? Math.min(requestedExpiresAt, maxExpiryMs)
      : null;

    const createdAt = nowMs();
    const codes: string[] = [];
    const statements: D1PreparedStatement[] = [];

    for (let idx = 0; idx < count; idx += 1) {
      const code = randomCode(10);
      const rowNote = count > 1 ? `${note || "invite"} #${idx + 1}` : note;

      statements.push(db
        .prepare(
          `INSERT INTO invite_codes (code, created_at, created_by, note, max_uses, uses, expires_at, revoked)
           VALUES (?, ?, ?, ?, ?, 0, ?, 0)`
        )
        .bind(code, createdAt, user.sub, rowNote, maxUses, expiresAt));

      codes.push(code);
    }

    statements.push(buildAdminEventStatement(db, {
      adminUserId: user.sub,
      action: "invite_create",
      targetUserId: null,
      meta: { codes, count, max_uses: maxUses, note, expires_at: expiresAt, expiry_cap_days: 30 },
    }));

    await db.batch(statements);

    return json({ ok: true, code: codes[0], codes }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    requireRole(user, "admin");
    const db = requireDB(env);
    await requireAdminRequest(user, request, db);

    const body = (await request.json().catch(() => null)) as any;
    const code = String(body?.code || "").trim();
    if (typeof body?.revoked !== "boolean") throw new Error("BAD_REQUEST");
    const revoked = body.revoked ? 1 : 0;
    if (!code) throw new Error("BAD_REQUEST");

    const inviteStatement = db.prepare("UPDATE invite_codes SET revoked = ? WHERE code = ?").bind(revoked, code);
    const auditStatement = buildAdminEventAfterChangeStatement(db, {
      adminUserId: user.sub,
      action: "invite_update",
      targetUserId: null,
      meta: { code, revoked },
    });
    const [inviteResult] = await db.batch([inviteStatement, auditStatement]);
    if (changedRows(inviteResult) === 0) {
      return json({ error: "NOT_FOUND", message: "invite code not found" }, 404);
    }

    return json({ ok: true, code, revoked: revoked === 1 }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
