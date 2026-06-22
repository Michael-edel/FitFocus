// /api/shopping/bulk
// PATCH: bulk update checked states for shopping list items
// Body: { week_start: 'YYYY-MM-DD', family_id?: string, updates: [{ ingredient_name: string, checked: boolean }] }
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError, nowMs } from "../_lib/db";
import { requireFamilyMember } from "../_lib/family_access";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function isIsoDay(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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
    if (family_id) await requireFamilyMember(db, family_id, user.sub);

    const norm = updates
      .map((u: any) => ({
        ingredient_name: String(u.ingredient_name || u.ingredient || "").trim(),
        checked: Boolean(u.checked),
      }))
      .filter((u: any) => u.ingredient_name)
      .slice(0, 500);

    const updated_at = nowMs();

    for (const u of norm) {
      const val = u.checked ? 1 : 0;
      const sharedUserId = family_id ? `family:${family_id}` : user.sub;
      await db
        .prepare(
          `INSERT INTO shopping_checked (user_id, week_start, family_id, ingredient_name, checked, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, week_start, family_id, ingredient_name)
           DO UPDATE SET checked=excluded.checked, updated_at=excluded.updated_at`
        )
        .bind(sharedUserId, week_start, family_id, u.ingredient_name, val, updated_at)
        .run();
    }

    return json({ ok: true, updated: norm.length, week_start });
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
