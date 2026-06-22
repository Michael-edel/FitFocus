// /api/shopping/check
// PATCH/POST: set checked state for a shopping list item (per user/week, optional family scope)
// Body: { week_start: 'YYYY-MM-DD', ingredient_name: string, checked: boolean, family_id?: string }
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError, nowMs } from "../_lib/db";
import { requireFamilyMember } from "../_lib/family_access";
import { normalizeShoppingIngredient } from "../_lib/ingredients";
import { requireFamilyPlan } from "../_lib/plans";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function isIsoDay(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function handle(request: Request, env: Env) {
  const user = await requireUser(request, env);
  const db = requireDB(env);
  await ensureUserRow(db, user);

  const body: any = await request.json().catch(() => ({}));
  const week_start = String(body.week_start || "").slice(0, 10);
  const ingredient_name = normalizeShoppingIngredient(body.ingredient_name || body.ingredient, 1).name;
  const checked = Boolean(body.checked);
  const family_id = body.family_id ? String(body.family_id) : null;

  if (!isIsoDay(week_start)) return json({ error: "BAD_WEEK" }, 400);
  if (!ingredient_name) return json({ error: "BAD_INGREDIENT" }, 400);
  if (family_id) {
    const fam = await requireFamilyMember(db, family_id, user.sub);
    await requireFamilyPlan(db, fam.owner_user_id);
  }

  const updated_at = nowMs();
  const val = checked ? 1 : 0;
  const sharedUserId = family_id ? `family:${family_id}` : user.sub;

  // SQLite UPSERT on composite PK
  await db
    .prepare(
      `INSERT INTO shopping_checked (user_id, week_start, family_id, ingredient_name, checked, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, week_start, family_id, ingredient_name)
       DO UPDATE SET checked=excluded.checked, updated_at=excluded.updated_at`
    )
    .bind(sharedUserId, week_start, family_id, ingredient_name, val, updated_at)
    .run();

  return json({ ok: true, week_start, ingredient_name, checked });
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    return await handle(request, env);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    return await handle(request, env);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
