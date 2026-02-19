// /api/admin/invites
// GET: list invite codes (admin only)
// POST: create invite code (admin only)
// PUT: revoke/unrevoke invite code (admin only)
import { json, requireUser } from "../_lib/auth";
import { requireDB, randomCode, nowMs, toApiError } from "../_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

function requireAdmin(user: { roles?: string[] }) {
  const roles = user?.roles || [];
  if (!roles.includes("admin")) throw new Error("FORBIDDEN");
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    requireAdmin(user);
    const db = requireDB(env);

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
    requireAdmin(user);
    const db = requireDB(env);

    const body = await request.json<any>().catch(() => ({}));
    const note = body?.note ? String(body.note).slice(0, 200) : null;
    const maxUses = body?.maxUses == null ? 1 : Math.max(1, Math.min(1000, Number(body.maxUses)));
    const expiresInHours = body?.expiresInHours == null ? null : Math.max(1, Math.min(24 * 60, Number(body.expiresInHours)));

    const now = Math.floor(nowMs() / 1000);
    const createdAt = now;
    const expiresAt = expiresInHours ? now + expiresInHours * 3600 : null;

    let code = randomCode(10);
    for (let i = 0; i < 10; i++) {
      const exists = await db.prepare("SELECT code FROM invite_codes WHERE code = ?").bind(code).first();
      if (!exists) break;
      code = randomCode(10);
    }

    await db
      .prepare(
        "INSERT INTO invite_codes (code, created_at, created_by, note, max_uses, uses, expires_at, revoked) VALUES (?, ?, ?, ?, ?, 0, ?, 0)"
      )
      .bind(code, createdAt, user.sub, note, maxUses, expiresAt)
      .run();

    return json({ code, createdAt, createdBy: user.sub, note, maxUses, uses: 0, expiresAt, revoked: 0 }, 201);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    requireAdmin(user);
    const db = requireDB(env);

    const body = await request.json<any>().catch(() => ({}));
    const code = String(body?.code || "").trim();
    if (!code) throw new Error("BAD_REQUEST");
    const revoked = body?.revoked ? 1 : 0;

    const r = await db.prepare("UPDATE invite_codes SET revoked = ? WHERE code = ?").bind(revoked, code).run();
    if (!r?.changes) throw new Error("NOT_FOUND");

    return json({ ok: true, code, revoked }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
