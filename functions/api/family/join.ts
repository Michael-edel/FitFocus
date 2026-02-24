// /api/family/join
// POST: join a family by invite code
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body = await request.json().catch(() => ({}));
    const code = (body?.code || "").toString().trim().toUpperCase();
    if (!code) throw new Error("BAD_REQUEST");

    // already in a family?
    const existing = await db
      .prepare(
        `SELECT f.id FROM families f
         JOIN family_members m ON m.family_id = f.id
         WHERE m.user_id = ? AND m.status = 'active' LIMIT 1`
      )
      .bind(user.sub)
      .first<any>();
    if (existing) return json({ ok: true, familyId: existing.id, alreadyMember: true }, 200);

    const inv = await db
      .prepare(
        `SELECT code, family_id, expires_at, used_by_user_id
         FROM family_invites WHERE code = ? LIMIT 1`
      )
      .bind(code)
      .first<any>();

    const now = Math.floor(nowMs() / 1000);
    if (!inv || inv.used_by_user_id || now > inv.expires_at) throw new Error("INVITE_INVALID");

    // enforce max 5 active members
    const cnt = await db
      .prepare("SELECT COUNT(*) as c FROM family_members WHERE family_id = ? AND status = 'active'")
      .bind(inv.family_id)
      .first<any>();
    if ((cnt?.c || 0) >= 5) throw new Error("FAMILY_LIMIT");

    await db.batch([
      db.prepare(
        `INSERT INTO family_members
         (id, family_id, user_id, role, status, is_active, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at)
         VALUES (?, ?, ?, 'member', 'active', 1, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`
      ).bind(uuid(), inv.family_id, user.sub, now, now),
      db.prepare("UPDATE family_invites SET used_by_user_id = ?, used_at = ? WHERE code = ?").bind(user.sub, now, code),
    ]);

    return json({ ok: true, familyId: inv.family_id }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
