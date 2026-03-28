// /api/family/member
// PATCH: update current user's member profile inside their active family
// Body: { name?, goal?, sex?, age?, height_cm?, weight_kg?, activity?, exclusions?, dietary? }
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, nowMs, toApiError } from "../_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

const normalizeDietary = (raw: any) => {
  if (!raw || typeof raw !== "object") return null;
  const list = (v: any) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    allergens: list(raw.allergens),
    intolerances: list(raw.intolerances),
    excludedFoods: list(raw.excludedFoods),
    severity: raw.severity === "avoid" ? "avoid" : "strict",
    notes: raw.notes ? String(raw.notes).trim().slice(0, 300) : "",
  };
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body: any = await request.json().catch(() => ({}));

    const name = body?.name !== undefined ? String(body.name).trim().slice(0, 80) : null;
    const goal = body?.goal ? String(body.goal).toUpperCase() : null;
    const sex = body?.sex ? String(body.sex).toUpperCase() : null;
    const age = body?.age !== undefined && body.age !== null && body.age !== "" ? Number(body.age) : null;
    const height_cm = body?.height_cm !== undefined && body.height_cm !== null && body.height_cm !== "" ? Number(body.height_cm) : null;
    const weight_kg = body?.weight_kg !== undefined && body.weight_kg !== null && body.weight_kg !== "" ? Number(body.weight_kg) : null;
    const activity = body?.activity !== undefined && body.activity !== null && body.activity !== "" ? Number(body.activity) : null;
    const exclusions = body?.exclusions !== undefined ? String(body.exclusions || "").trim().slice(0, 500) : null;
    const dietary = body?.dietary !== undefined ? normalizeDietary(body.dietary) : null;

    // Find active family
    const fam = await db
      .prepare(
        `SELECT f.id AS family_id
         FROM families f
         JOIN family_members m ON m.family_id = f.id
         WHERE m.user_id = ? AND m.status = 'active'
         LIMIT 1`
      )
      .bind(user.sub)
      .first<any>();

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
      .bind(goal, sex, age, height_cm, weight_kg, activity, updatedAt, fam.family_id, user.sub)
      .run();

    const existingProfile = await db
      .prepare("SELECT profile_json FROM user_profiles WHERE user_id = ?")
      .bind(user.sub)
      .first<{ profile_json: string }>();

    let profile: any = {};
    if (existingProfile?.profile_json) {
      try { profile = JSON.parse(existingProfile.profile_json); } catch { profile = {}; }
    }

    const nextProfile = {
      ...profile,
      id: user.sub,
      googleSub: user.sub,
      email: profile?.email || user.email,
      picture: profile?.picture || user.picture,
      name: name || profile?.name || user.name || profile?.email || user.email || user.sub,
      goal: goal || profile?.goal,
      exclusions: exclusions !== null ? exclusions : (profile?.exclusions || ""),
      dietary: dietary !== null ? dietary : (profile?.dietary || undefined),
      age: age !== null ? age : profile?.age,
      height: height_cm !== null ? height_cm : profile?.height,
      weight: weight_kg !== null ? weight_kg : profile?.weight,
    };

    await db
      .prepare(
        "INSERT INTO user_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at"
      )
      .bind(user.sub, JSON.stringify(nextProfile), nowMs())
      .run();

    if (name) {
      await db
        .prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name, nowMs(), user.sub)
        .run();
    }

    return json({ ok: true, updated_at: updatedAt, profile: nextProfile }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 400);
  }
};
