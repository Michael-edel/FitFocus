// /api/family
// GET: returns current user's family (if any) and members (active)
// POST: create a new family (owner) and add creator as member
import { json, requireUser, errRu } from "../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function safeJsonParse<T = any>(value: unknown, fallback: T): T {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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
        `SELECT
           m.user_id,
           m.role,
           m.status,
           m.sex,
           m.age,
           m.height_cm,
           m.weight_kg,
           m.activity,
           m.goal,
           m.created_at,
           m.updated_at,
           u.name AS user_name,
           u.email AS user_email,
           u.picture AS user_picture,
           up.profile_json
         FROM family_members m
         LEFT JOIN users u ON u.id = m.user_id
         LEFT JOIN user_profiles up ON up.user_id = m.user_id
         WHERE m.family_id = ? AND m.status = 'active'
         ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, m.created_at ASC`
      )
      .bind(fam.id)
      .all<any>();

    const normalizedMembers = (members.results || []).map((m: any) => {
      const profile = safeJsonParse<any>(m.profile_json, {});
      return {
        user_id: m.user_id,
        name: profile?.name || m.user_name || m.user_id,
        email: profile?.email || m.user_email || null,
        picture: profile?.picture || m.user_picture || null,
        role: m.role,
        status: m.status,
        sex: m.sex,
        age: m.age,
        height_cm: m.height_cm,
        weight_kg: m.weight_kg,
        activity: m.activity,
        goal: m.goal,
        created_at: m.created_at,
        updated_at: m.updated_at,
        dietary: profile?.dietary || null,
        exclusions: profile?.exclusions || "",
      };
    });

    return json({ family: fam, members: normalizedMembers }, 200);
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
         (id, family_id, user_id, role, status, is_active, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 'active', 1, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`
      ).bind(uuid(), familyId, user.sub, ts, ts),
    ]);

    return json({ family: { id: familyId, name, owner_user_id: user.sub, created_at: ts } }, 201);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
