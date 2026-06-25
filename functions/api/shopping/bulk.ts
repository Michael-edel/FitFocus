// /api/shopping/bulk
// PATCH: bulk update checked states for shopping list items
// Body: { week_start: 'YYYY-MM-DD', family_id?: string, updates: [{ ingredient_name: string, checked: boolean }] }
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError, nowMs } from "../_lib/db";
import { requireFamilyMember } from "../_lib/family_access";
import { normalizeShoppingIngredient } from "../_lib/ingredients";
import { requireFamilyPlan } from "../_lib/plans";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function isIsoDay(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function getShoppingScopeId(userId: string, familyId?: string | null) {
  return familyId ? `family:${familyId}` : `personal:${userId}`;
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body: any = await request.json().catch(() => ({}));
    const week_start = String(body.week_start || "").slice(0, 10);
    const family_id = body.family_id ? String(body.family_id) : null;
    const updates = Array.isArray(body.updates) ? body.updates : [];

    if (!isIsoDay(week_start)) return json({ error: "BAD_WEEK" }, 400);
    if (family_id) {
      const fam = await requireFamilyMember(db, family_id, user.sub);
      await requireFamilyPlan(db, fam.owner_user_id);
    }

    const norm = updates
      .map((u: any) => ({
        ingredient_name: normalizeShoppingIngredient(u.ingredient_name || u.ingredient, 1).name,
        checked: Boolean(u.checked),
      }))
      .filter((u: any) => u.ingredient_name)
      .slice(0, 500);

    const updated_at = nowMs();
    const scopeId = getShoppingScopeId(user.sub, family_id);
    const statements = norm.map((u: any) => {
      const val = u.checked ? 1 : 0;
      return db
        .prepare(
          `INSERT INTO shopping_checked (scope_id, week_start, family_id, ingredient_name, checked, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(scope_id, week_start, ingredient_name)
           DO UPDATE SET checked=excluded.checked, updated_at=excluded.updated_at`
        )
        .bind(scopeId, week_start, family_id, u.ingredient_name, val, updated_at);
    });
    await db.batch(statements);

    return json({ ok: true, updated: norm.length, week_start });
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
