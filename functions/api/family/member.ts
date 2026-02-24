// /api/family/member
// PATCH: update current member profile (goal + optional stats) for Family mode.
// Body: { goal?: 'LOSS'|'MAINTAIN', sex?: 'MALE'|'FEMALE', age?: number, height_cm?: number, weight_kg?: number, activity?: number }
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, nowMs, toApiError } from "../_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function clampNum(v: any, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body: any = await request.json().catch(() => ({}));

    const goalRaw = (body?.goal || "").toString().toUpperCase();
    const goal = goalRaw === "LOSS" ? "LOSS" : goalRaw === "MAINTAIN" ? "MAINTAIN" : null;

    const sexRaw = (body?.sex || "").toString().toUpperCase();
    const sex = sexRaw === "MALE" ? "MALE" : sexRaw === "FEMALE" ? "FEMALE" : null;

    const age = clampNum(body?.age, 10, 100);
    const height_cm = clampNum(body?.height_cm, 120, 230);
    const weight_kg = clampNum(body?.weight_kg, 30, 250);
    const activity = clampNum(body?.activity, 1.1, 2.5);

    // find family + ensure active member
    const fam = await db
      .prepare(
        `SELECT f.id AS family_id
         FROM families f
         JOIN family_members m ON m.family_id = f.id
         WHERE m.user_id = ? AND (m.status='active' OR m.is_active=1)
         LIMIT 1`
      )
      .bind(user.sub)
      .first<any>();
    if (!fam) throw new Error("NOT_FOUND");

    const ts = Math.floor(nowMs() / 1000);

    // build dynamic update
    const sets: string[] = [];
    const binds: any[] = [];
    if (goal) { sets.push("goal=?"); binds.push(goal); }
    if (sex) { sets.push("sex=?"); binds.push(sex); }
    if (age !== null) { sets.push("age=?"); binds.push(age); }
    if (height_cm !== null) { sets.push("height_cm=?"); binds.push(height_cm); }
    if (weight_kg !== null) { sets.push("weight_kg=?"); binds.push(weight_kg); }
    if (activity !== null) { sets.push("activity=?"); binds.push(activity); }
    sets.push("updated_at=?"); binds.push(ts);

    if (sets.length === 1) return json({ ok: true, updated: false }, 200);

    binds.push(fam.family_id, user.sub);

    await db
      .prepare(
        `UPDATE family_members SET ${sets.join(", ")}
         WHERE family_id=? AND user_id=?`
      )
      .bind(...binds)
      .run();

    return json({ ok: true, updated: true }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
