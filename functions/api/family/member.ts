// /api/family/member
// PATCH: update current user's member profile inside their active family (goal + basic params)
// Body: { goal?: 'LOSS'|'MAINTAIN', sex?: 'MALE'|'FEMALE', age?: number, height_cm?: number, weight_kg?: number, activity?: number }
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, nowMs, toApiError } from "../_lib/db";
import { requireActiveFamilyForUser } from "../_lib/family_access";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body: any = await request.json().catch(() => ({}));

    const goal = body?.goal ? String(body.goal).toUpperCase() : null; // LOSS | MAINTAIN
    const sex = body?.sex ? String(body.sex).toUpperCase() : null; // MALE | FEMALE
    const age = body?.age !== undefined ? Number(body.age) : null;
    const height_cm = body?.height_cm !== undefined ? Number(body.height_cm) : null;
    const weight_kg = body?.weight_kg !== undefined ? Number(body.weight_kg) : null;
    const activity = body?.activity !== undefined ? Number(body.activity) : null;

    const fam = await requireActiveFamilyForUser(db, user.sub).catch(() => null);
    if (!fam) return json({ ok: false, error: "NOT_IN_FAMILY" }, 400);

    const updatedAt = Math.floor(nowMs() / 1000);

    await db
      .prepare(
        `UPDATE family_members
         SET goal = COALESCE(?, goal),
             sex = COALESCE(?, sex),
             age = COALESCE(?, age),
             height_cm = COALESCE(?, height_cm),
             weight_kg = COALESCE(?, weight_kg),
             activity = COALESCE(?, activity),
             updated_at = ?
         WHERE family_id = ? AND user_id = ?`
      )
      .bind(goal, sex, age, height_cm, weight_kg, activity, updatedAt, fam.id, user.sub)
      .run();

    return json({ ok: true, updated_at: updatedAt }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
