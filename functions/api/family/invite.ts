// /api/family/invite
// POST: creates an invite code for current family (owner only)
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, randomCode, nowMs, toApiError } from "../_lib/db";
import { requireFamilyOwner } from "../_lib/family_access";
import { requireFamilyPlan } from "../_lib/plans";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

function changedRows(result: any): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const fam = await requireFamilyOwner(db, user.sub);
    await requireFamilyPlan(db, user.sub);

    const body = await request.json().catch(() => ({}));
    const ttlHours = Number(body?.ttlHours || 72);
    const now = Math.floor(nowMs() / 1000);
    const expires = now + Math.max(1, Math.min(24 * 14, ttlHours)) * 3600;

    let code = "";
    let inserted = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = randomCode(8);
      const result = await db
        .prepare(
          "INSERT OR IGNORE INTO family_invites (code, family_id, created_by_user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(candidate, fam.id, user.sub, now, expires)
        .run();
      if (changedRows(result) === 1) {
        code = candidate;
        inserted = true;
        break;
      }
    }
    if (!inserted) return json({ error: "INVITE_GENERATION_FAILED" }, 409);

    return json({ code, expiresAt: expires }, 201);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
