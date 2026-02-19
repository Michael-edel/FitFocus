// Cloudflare Pages Function: /api/profile
// Premium: server-side source of truth for onboarding/profile used by AI.
// GET returns profile for current user.
// PUT upserts profile fields.

import { json, requireUser } from "./_lib/auth";
import { ensureUserRow, requireDB, toApiError } from "./_lib/db";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

type ProfileInput = {
  name?: string;
  gender?: string;
  age?: number;
  height?: number;
  weight?: number;
  targetWeight?: number;
  activityLevel?: number;
  goal?: string;
  exclusions?: string;
  lossDeficit?: number;
  gainSurplus?: number;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const row = await db
      .prepare(
        `SELECT user_id, name, gender, age, height, weight, target_weight, activity_level, goal, exclusions, loss_deficit, gain_surplus, updated_at
         FROM user_profiles WHERE user_id = ?`
      )
      .bind(user.sub)
      .first();

    // Normalize keys to frontend naming
    const profile = row
      ? {
          userId: row.user_id,
          name: row.name,
          gender: row.gender,
          age: row.age,
          height: row.height,
          weight: row.weight,
          targetWeight: row.target_weight,
          activityLevel: row.activity_level,
          goal: row.goal,
          exclusions: row.exclusions || "",
          lossDeficit: row.loss_deficit,
          gainSurplus: row.gain_surplus,
          updatedAt: row.updated_at,
        }
      : null;

    return json({ profile }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body: ProfileInput = await request.json().catch(() => ({}));
    const now = Math.floor(Date.now() / 1000);

    // basic sanitize
    const name = typeof body.name === "string" ? body.name.slice(0, 80) : null;
    const gender = typeof body.gender === "string" ? body.gender.slice(0, 16) : null;
    const goal = typeof body.goal === "string" ? body.goal.slice(0, 16) : null;
    const exclusions = typeof body.exclusions === "string" ? body.exclusions.slice(0, 500) : "";

    const age = Number.isFinite(body.age as any) ? Math.max(5, Math.min(120, Number(body.age))) : null;
    const height = Number.isFinite(body.height as any) ? Math.max(80, Math.min(250, Number(body.height))) : null;
    const weight = Number.isFinite(body.weight as any) ? Math.max(20, Math.min(500, Number(body.weight))) : null;
    const targetWeight = Number.isFinite(body.targetWeight as any)
      ? Math.max(20, Math.min(500, Number(body.targetWeight)))
      : null;

    const activityLevel = Number.isFinite(body.activityLevel as any)
      ? Math.max(1.0, Math.min(2.5, Number(body.activityLevel)))
      : null;

    const lossDeficit = Number.isFinite(body.lossDeficit as any) ? Math.round(Number(body.lossDeficit)) : null;
    const gainSurplus = Number.isFinite(body.gainSurplus as any) ? Math.round(Number(body.gainSurplus)) : null;

    await db
      .prepare(
        `INSERT INTO user_profiles
          (user_id, name, gender, age, height, weight, target_weight, activity_level, goal, exclusions, loss_deficit, gain_surplus, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           name=excluded.name,
           gender=excluded.gender,
           age=excluded.age,
           height=excluded.height,
           weight=excluded.weight,
           target_weight=excluded.target_weight,
           activity_level=excluded.activity_level,
           goal=excluded.goal,
           exclusions=excluded.exclusions,
           loss_deficit=excluded.loss_deficit,
           gain_surplus=excluded.gain_surplus,
           updated_at=excluded.updated_at`
      )
      .bind(
        user.sub,
        name,
        gender,
        age,
        height,
        weight,
        targetWeight,
        activityLevel,
        goal,
        exclusions,
        lossDeficit,
        gainSurplus,
        now
      )
      .run();

    return json({ ok: true }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : 500);
  }
};
