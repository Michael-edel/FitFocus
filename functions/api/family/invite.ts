// /api/family/invite
// POST: creates an invite code for current family (owner only)
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, randomCode, nowMs, toApiError } from "../_lib/db";
import { requireFamilyOwner } from "../_lib/family_access";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const fam = await requireFamilyOwner(db, user.sub);

    const body = await request.json().catch(() => ({}));
    const ttlHours = Number(body?.ttlHours || 72);
    const now = Math.floor(nowMs() / 1000);
    const expires = now + Math.max(1, Math.min(24 * 14, ttlHours)) * 3600;

    let code = randomCode(8);
    // ensure uniqueness (retry a few times)
    for (let i = 0; i < 5; i++) {
      const exists = await db.prepare("SELECT code FROM family_invites WHERE code = ?").bind(code).first();
      if (!exists) break;
      code = randomCode(8);
    }

    await db
      .prepare(
        "INSERT INTO family_invites (code, family_id, created_by_user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(code, fam.id, user.sub, now, expires)
      .run();

    return json({ code, expiresAt: expires }, 201);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
