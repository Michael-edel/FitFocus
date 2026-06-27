// /api/family
// GET: returns current user's family (if any) and members (active)
// POST: create a new family (owner) and add creator as member
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../_lib/db";
import { getActiveFamilyForUser } from "../_lib/family_access";
import { requireFamilyPlan } from "../_lib/plans";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { asString, isJsonObject } from "../_lib/json";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
type MutationResult = { meta?: { changes?: number }; changes?: number };
type FamilyRow = { id: string; name: string; owner_user_id: string; created_at: number };
type FamilyMemberRow = {
  user_id: string;
  role: string;
  status: string;
  sex?: string | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  activity?: number | null;
  goal?: string | null;
  created_at?: number;
  updated_at?: number;
  restrictions_json?: string | null;
};

function changedRows(result: MutationResult): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const access = await getActiveFamilyForUser(db, user.sub);
    const fam = access
      ? await db.prepare("SELECT id, name, owner_user_id, created_at FROM families WHERE id = ? LIMIT 1").bind(access.id).first<FamilyRow>()
      : null;

    if (!fam) return json({ family: null, members: [] }, 200);

    const members = await db
      .prepare(
        `SELECT user_id, role, status, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at
                , restrictions_json
         FROM family_members
         WHERE family_id = ? AND status = 'active' AND is_active = 1
         ORDER BY role DESC, created_at ASC`
      )
      .bind(fam.id)
      .all<FamilyMemberRow>();

    return json({ family: fam, members: members.results || [] }, 200);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    let body: unknown = {};
    try {
      body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES) ?? {};
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
    const payload = isJsonObject(body) ? body : {};
    const name = asString(payload.name, "Моя семья").slice(0, 60);
    await requireFamilyPlan(db, user.sub);

    // If user already in a family, return it
    const existingAccess = await getActiveFamilyForUser(db, user.sub);
    const existing = existingAccess
      ? await db.prepare("SELECT id, name, owner_user_id, created_at FROM families WHERE id = ? LIMIT 1").bind(existingAccess.id).first<FamilyRow>()
      : null;
    if (existing) return json({ family: existing, alreadyMember: true }, 200);

    const familyId = uuid();
    const ts = Math.floor(nowMs() / 1000);

    await db.prepare("INSERT INTO families (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(familyId, name, user.sub, ts)
      .run();

    const memberInsert = await db.prepare(
      `INSERT INTO family_members
       (id, family_id, user_id, role, status, is_active, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at)
       SELECT ?, ?, ?, 'owner', 'active', 1, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?
       WHERE NOT EXISTS (
         SELECT 1
         FROM family_members fm
         JOIN families f ON f.id = fm.family_id
         WHERE fm.user_id = ?
           AND fm.status = 'active'
           AND fm.is_active = 1
           AND f.is_active = 1
       )`
    ).bind(uuid(), familyId, user.sub, ts, ts, user.sub).run();

    if (changedRows(memberInsert) === 0) {
      await db.prepare("DELETE FROM families WHERE id = ?").bind(familyId).run();
      const latestAccess = await getActiveFamilyForUser(db, user.sub);
      const latestFamily = latestAccess
        ? await db.prepare("SELECT id, name, owner_user_id, created_at FROM families WHERE id = ? LIMIT 1").bind(latestAccess.id).first<FamilyRow>()
        : null;
      if (latestFamily) return json({ family: latestFamily, alreadyMember: true }, 200);
      return json({ error: "FAMILY_CREATE_CONFLICT" }, 409);
    }

    return json({ family: { id: familyId, name, owner_user_id: user.sub, created_at: ts } }, 201);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
