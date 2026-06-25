// /api/family/member
// PATCH: update current user's member profile inside their active family (goal + basic params)
// Body: { goal?: 'LOSS'|'MAINTAIN', sex?: 'MALE'|'FEMALE', age?: number, height_cm?: number, weight_kg?: number, activity?: number, dietary?: {...} }
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, nowMs, toApiError } from "../_lib/db";
import { requireActiveFamilyForUser } from "../_lib/family_access";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function changedRows(result: any): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function normalizeGoal(value: unknown) {
  if (value == null) return null;
  const goal = String(value).trim().toUpperCase();
  return goal === "LOSS" || goal === "MAINTAIN" ? goal : "";
}

function normalizeSex(value: unknown) {
  if (value == null) return null;
  const sex = String(value).trim().toUpperCase();
  return sex === "MALE" || sex === "FEMALE" ? sex : "";
}

function normalizeNumber(value: unknown, min: number, max: number, integer = false) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return Number.NaN;
  return integer ? Math.floor(num) : num;
}

function textList(value: unknown, maxItems = 20): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];

  return raw
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 80))
    .filter((item, index, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, maxItems);
}

function normalizeRestrictions(input: unknown): string | null {
  if (input === undefined) return null;

  let data: any = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      data = { notes: input };
    }
  }

  if (!data || typeof data !== "object") {
    return JSON.stringify({ allergens: [], intolerances: [], excludedFoods: [], severity: "strict", notes: "" });
  }

  const severity = String(data.severity || "").toLowerCase() === "soft" ? "soft" : "strict";
  const notes = String(data.notes || "").trim().slice(0, 500);

  return JSON.stringify({
    allergens: textList(data.allergens),
    intolerances: textList(data.intolerances),
    excludedFoods: textList(data.excludedFoods || data.exclusions || data.forbidden),
    severity,
    notes,
  });
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body: any = await request.json().catch(() => ({}));

    const goal = normalizeGoal(body?.goal);
    const sex = normalizeSex(body?.sex);
    const age = normalizeNumber(body?.age, 1, 120, true);
    const height_cm = normalizeNumber(body?.height_cm, 50, 260, true);
    const weight_kg = normalizeNumber(body?.weight_kg, 20, 500);
    const activity = normalizeNumber(body?.activity, 1, 5);
    const restrictionsJson = normalizeRestrictions(body?.dietary ?? body?.restrictions_json);

    if (goal === "") return json({ error: "BAD_GOAL" }, 400);
    if (sex === "") return json({ error: "BAD_SEX" }, 400);
    if (Number.isNaN(age)) return json({ error: "BAD_AGE" }, 400);
    if (Number.isNaN(height_cm)) return json({ error: "BAD_HEIGHT" }, 400);
    if (Number.isNaN(weight_kg)) return json({ error: "BAD_WEIGHT" }, 400);
    if (Number.isNaN(activity)) return json({ error: "BAD_ACTIVITY" }, 400);

    const fam = await requireActiveFamilyForUser(db, user.sub).catch(() => null);
    if (!fam) return json({ ok: false, error: "NOT_IN_FAMILY" }, 400);

    const updatedAt = Math.floor(nowMs() / 1000);

    const result = await db
      .prepare(
        `UPDATE family_members
         SET goal = COALESCE(?, goal),
             sex = COALESCE(?, sex),
             age = COALESCE(?, age),
             height_cm = COALESCE(?, height_cm),
             weight_kg = COALESCE(?, weight_kg),
             activity = COALESCE(?, activity),
             restrictions_json = COALESCE(?, restrictions_json),
             updated_at = ?
         WHERE family_id = ? AND user_id = ? AND status = 'active' AND is_active = 1`
      )
      .bind(goal, sex, age, height_cm, weight_kg, activity, restrictionsJson, updatedAt, fam.id, user.sub)
      .run();
    if (changedRows(result) === 0) return json({ error: "NOT_FOUND" }, 404);

    return json({ ok: true, updated_at: updatedAt }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
