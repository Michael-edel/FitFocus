import { nowMs } from './db';
import { requireActiveFamilyForUser } from './family_access';
import { isJsonObject, safeJsonParseObject } from './json';

type MutationResult = { meta?: { changes?: number }; changes?: number };

type FamilyMemberPatch = {
  goal: string | null;
  sex: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: number | null;
  restrictionsJson: string | null;
};

export type FamilyMemberProfileResult =
  | { ok: true; updatedAt: number }
  | { ok: false; error: 'BAD_JSON' | 'BAD_GOAL' | 'BAD_SEX' | 'BAD_AGE' | 'BAD_HEIGHT' | 'BAD_WEIGHT' | 'BAD_ACTIVITY' | 'NOT_IN_FAMILY' | 'NOT_FOUND' };

function changedRows(result: MutationResult): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function normalizeGoal(value: unknown) {
  if (value == null) return null;
  const goal = String(value).trim().toUpperCase();
  return goal === 'LOSS' || goal === 'MAINTAIN' ? goal : '';
}

function normalizeSex(value: unknown) {
  if (value == null) return null;
  const sex = String(value).trim().toUpperCase();
  return sex === 'MALE' || sex === 'FEMALE' ? sex : '';
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
    : typeof value === 'string'
      ? value.split(/[,;\n]/)
      : [];

  return raw
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 80))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, maxItems);
}

function normalizeRestrictions(input: unknown): string | null {
  if (input === undefined) return null;

  let data: unknown = input;
  if (typeof input === 'string') {
    data = safeJsonParseObject(input) ?? { notes: input };
  }

  if (!isJsonObject(data)) {
    return JSON.stringify({ allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' });
  }

  const severity = String(data.severity || '').toLowerCase() === 'soft' ? 'soft' : 'strict';
  const notes = String(data.notes || '').trim().slice(0, 500);

  return JSON.stringify({
    allergens: textList(data.allergens),
    intolerances: textList(data.intolerances),
    excludedFoods: textList(data.excludedFoods || data.exclusions || data.forbidden),
    severity,
    notes,
  });
}

export function parseFamilyMemberPatch(body: unknown): FamilyMemberPatch | FamilyMemberProfileResult {
  if (!isJsonObject(body)) return { ok: false, error: 'BAD_JSON' };

  const patch: FamilyMemberPatch = {
    goal: normalizeGoal(body.goal),
    sex: normalizeSex(body.sex),
    age: normalizeNumber(body.age, 1, 120, true),
    heightCm: normalizeNumber(body.height_cm, 50, 260, true),
    weightKg: normalizeNumber(body.weight_kg, 20, 500),
    activity: normalizeNumber(body.activity, 1, 5),
    restrictionsJson: normalizeRestrictions(body.dietary ?? body.restrictions_json),
  };

  if (patch.goal === '') return { ok: false, error: 'BAD_GOAL' };
  if (patch.sex === '') return { ok: false, error: 'BAD_SEX' };
  if (Number.isNaN(patch.age)) return { ok: false, error: 'BAD_AGE' };
  if (Number.isNaN(patch.heightCm)) return { ok: false, error: 'BAD_HEIGHT' };
  if (Number.isNaN(patch.weightKg)) return { ok: false, error: 'BAD_WEIGHT' };
  if (Number.isNaN(patch.activity)) return { ok: false, error: 'BAD_ACTIVITY' };
  return patch;
}

function isPatch(value: FamilyMemberPatch | FamilyMemberProfileResult): value is FamilyMemberPatch {
  return !('ok' in value);
}

/** Applies a validated profile patch only to the caller's active family membership. */
export async function updateActiveFamilyMemberProfile({
  db,
  userId,
  body,
}: {
  db: D1Database;
  userId: string;
  body: unknown;
}): Promise<FamilyMemberProfileResult> {
  const patch = parseFamilyMemberPatch(body);
  if (!isPatch(patch)) return patch;

  const family = await requireActiveFamilyForUser(db, userId).catch(() => null);
  if (!family) return { ok: false, error: 'NOT_IN_FAMILY' };

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
       WHERE family_id = ? AND user_id = ? AND status = 'active' AND is_active = 1`,
    )
    .bind(
      patch.goal,
      patch.sex,
      patch.age,
      patch.heightCm,
      patch.weightKg,
      patch.activity,
      patch.restrictionsJson,
      updatedAt,
      family.id,
      userId,
    )
    .run();

  return changedRows(result) === 0
    ? { ok: false, error: 'NOT_FOUND' }
    : { ok: true, updatedAt };
}
