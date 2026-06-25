// /api/family/join
// POST: join a family by invite code
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, uuid, nowMs, toApiError } from "../_lib/db";
import { getActiveFamilyForUser } from "../_lib/family_access";
import { loadActivePlan } from "../_lib/plans";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function changedRows(result: any): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const body = await request.json().catch(() => ({}));
    const code = (body?.code || "").toString().trim().toUpperCase();
    if (!code) throw new Error("BAD_REQUEST");

    // already in a family?
    const existing = await getActiveFamilyForUser(db, user.sub);
    if (existing) return json({ ok: true, familyId: existing.id, alreadyMember: true }, 200);

    const inv = await db
      .prepare(
        `SELECT code, family_id, expires_at, used_by_user_id
         FROM family_invites WHERE code = ? LIMIT 1`
      )
      .bind(code)
      .first<any>();

    const now = Math.floor(nowMs() / 1000);
    if (!inv || inv.used_by_user_id || now > inv.expires_at) throw new Error("INVITE_INVALID");

    const activeFamily = await db
      .prepare("SELECT id, owner_user_id FROM families WHERE id = ? AND is_active = 1 LIMIT 1")
      .bind(inv.family_id)
      .first<any>();
    if (!activeFamily) throw new Error("INVITE_INVALID");

    const ownerPlan = await loadActivePlan(db, String(activeFamily.owner_user_id || ""));
    if (ownerPlan !== "family") throw new Error("FAMILY_PLAN_INACTIVE");

    // enforce max 5 active members
    const cnt = await db
      .prepare("SELECT COUNT(*) as c FROM family_members WHERE family_id = ? AND status = 'active' AND is_active = 1")
      .bind(inv.family_id)
      .first<any>();
    if ((cnt?.c || 0) >= 5) throw new Error("FAMILY_LIMIT");

    const inviteUpdate = await db
      .prepare("UPDATE family_invites SET used_by_user_id = ?, used_at = ? WHERE code = ? AND used_by_user_id IS NULL")
      .bind(user.sub, now, code)
      .run();
    if (changedRows(inviteUpdate) !== 1) throw new Error("INVITE_INVALID");

    const memberInsert = await db.prepare(
      `INSERT INTO family_members
       (id, family_id, user_id, role, status, is_active, sex, age, height_cm, weight_kg, activity, goal, created_at, updated_at)
       SELECT ?, ?, ?, 'member', 'active', 1, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?
       WHERE (SELECT COUNT(*) FROM family_members WHERE family_id = ? AND status = 'active' AND is_active = 1) < 5`
    ).bind(uuid(), inv.family_id, user.sub, now, now, inv.family_id).run();

    if (changedRows(memberInsert) !== 1) {
      await db
        .prepare("UPDATE family_invites SET used_by_user_id = NULL, used_at = NULL WHERE code = ? AND used_by_user_id = ?")
        .bind(code, user.sub)
        .run();
      throw new Error("FAMILY_LIMIT");
    }

    return json({ ok: true, familyId: inv.family_id }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FAMILY_PLAN_INACTIVE" ? 402 : 400);
  }
};
