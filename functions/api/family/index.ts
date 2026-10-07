// /api/family
// GET: returns current user's family (if any) and members (active)
// POST: create a new family (owner) and add creator as member
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { createFamily, type FamilyRecord } from "../_lib/family_create";
import { getActiveFamilyForUser } from "../_lib/family_access";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const access = await getActiveFamilyForUser(db, user.sub);
    const fam = access
      ? await db.prepare("SELECT id, name, owner_user_id, created_at FROM families WHERE id = ? LIMIT 1").bind(access.id).first<FamilyRecord>()
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
    const result = await createFamily({ db, userId: user.sub, body });
    if (result.kind === 'conflict') return json({ error: 'FAMILY_CREATE_CONFLICT' }, 409);
    if (result.kind === 'existing') return json({ family: result.family, alreadyMember: true }, 200);
    return json({ family: result.family }, 201);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
