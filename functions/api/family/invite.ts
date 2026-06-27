// /api/family/invite
// POST: creates an invite code for current family (owner only)
import { json, requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, randomCode, nowMs, toApiError } from "../_lib/db";
import { requireFamilyOwner } from "../_lib/family_access";
import { requireFamilyPlan } from "../_lib/plans";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { isJsonObject } from "../_lib/json";

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
type MutationResult = { meta?: { changes?: number }; changes?: number };

function changedRows(result: MutationResult): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function normalizeTtlHours(value: unknown): number {
  const parsedTtlHours = Number(value || 72);
  const ttlHours = Number.isFinite(parsedTtlHours) ? parsedTtlHours : 72;
  return Math.max(1, Math.min(24 * 14, ttlHours));
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    const fam = await requireFamilyOwner(db, user.sub);
    await requireFamilyPlan(db, user.sub);

    let body: unknown = {};
    try {
      body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES) ?? {};
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
    const payload = isJsonObject(body) ? body : null;
    const ttlHours = normalizeTtlHours(payload?.ttlHours);
    const now = Math.floor(nowMs() / 1000);
    const expires = now + ttlHours * 3600;

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
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return json({ error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
