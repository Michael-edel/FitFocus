// /api/family
// GET: returns current user's family (if any) and members (active)
// POST: create a new family (owner) and add creator as member
import { json, requireUser, errRu } from "../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const fam = await db
      .prepare(
        `SELECT f.id, f.name, f.owner_user_id, f.created_at
         FROM families f
         JOIN family_members m ON m.family_id = f.id
         WHERE m.user_id = ? AND m.status = 'active'
         LIMIT 1`
      )
      .bind(user.sub)
      .first<any>();

    if (!fam) return json({ family: null, members: [] }, 200);

    const members = await db
      .prepare(
        `SELECT user_id, role, status, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at
         FROM family_members
         WHERE family_id = ? AND status = 'active'
         ORDER BY role DESC, created_at ASC`
      )
      .bind(fam.id)
      .all<any>();

    return json({ family: fam, members: members.results || [] }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body = await request.json().catch(() => ({}));
    const name = (body?.name || "Моя семья").toString().slice(0, 60);

    // If user already in a family, return it
    const existing = await db
      .prepare(
        `SELECT f.id, f.name, f.owner_user_id, f.created_at
         FROM families f
         JOIN family_members m ON m.family_id = f.id
         WHERE m.user_id = ? AND m.status = 'active'
         LIMIT 1`
      )
      .bind(user.sub)
      .first<any>();
    if (existing) return json({ family: existing, alreadyMember: true }, 200);

    const familyId = uuid();
    const ts = Math.floor(nowMs() / 1000);

    await db.batch([
      db.prepare("INSERT INTO families (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)").bind(
        familyId,
        name,
        user.sub,
        ts
      ),
      db.prepare(
        `INSERT INTO family_members
         (family_id, user_id, role, status, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at)
         VALUES (?, ?, 'owner', 'active', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`
      ).bind(familyId, user.sub, ts, ts),
    ]);

    return json({ family: { id: familyId, name, owner_user_id: user.sub, created_at: ts } }, 201);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
