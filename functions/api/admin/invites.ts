// /api/admin/invites
// GET: list invite codes (admin only)
// POST: create invite code (admin only)
// PUT: revoke/unrevoke invite code (admin only)
import { json, requireUser } from "../_lib/auth";
import { requireDB, randomCode, nowMs, toApiError } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { logAdminEvent } from "../_lib/admin_audit";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    requireRole(user, "admin");
    const db = requireDB(env);
    await requireAdminRequest(user, request, db);

    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 100)));

    const rows = await db
      .prepare(
        `SELECT code, created_at, created_by, note, max_uses, uses, expires_at, revoked
         FROM invite_codes
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

    for (let idx = 0; idx < count; idx += 1) {
      const code = randomCode(10);
      const rowNote = count > 1 ? `${note || "invite"} #${idx + 1}` : note;

      await db
        .prepare(
          `INSERT INTO invite_codes (code, created_at, created_by, note, max_uses, uses, expires_at, revoked)
           VALUES (?, ?, ?, ?, ?, 0, ?, 0)`
        )
        .bind(code, createdAt, user.sub, rowNote, maxUses, expiresAt)
        .run();

      codes.push(code);
    }

    await logAdminEvent(db, {
      adminUserId: user.sub,
      action: "invite_create",
      targetUserId: null,
      meta: { codes, count, max_uses: maxUses, note, expires_at: expiresAt, expiry_cap_days: 30 },
    });

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
    const revoked = body?.revoked ? 1 : 0;
    if (!code) throw new Error("BAD_REQUEST");

    await db.prepare("UPDATE invite_codes SET revoked = ? WHERE code = ?").bind(revoked, code).run();

    await logAdminEvent(db, { adminUserId: user.sub, action: "invite_update", targetUserId: null, meta: { code, revoked } });

    return json({ ok: true, code, revoked: revoked === 1 }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
