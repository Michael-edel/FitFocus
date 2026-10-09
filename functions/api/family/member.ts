// /api/family/member
// PATCH: update current user's member profile inside their active family (goal + basic params)
// Body: { goal?: 'LOSS'|'MAINTAIN', sex?: 'MALE'|'FEMALE', age?: number, height_cm?: number, weight_kg?: number, activity?: number, dietary?: {...} }
import { requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { updateActiveFamilyMemberProfile } from "../_lib/family_member_profile";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { requestIdFor } from '../_lib/observability';
import { familyResponse } from '../_lib/family_response';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);

    let body: unknown = {};
    try {
      body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES) ?? {};
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return familyResponse('family.member.update', requestId, { error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
    const result = await updateActiveFamilyMemberProfile({ db, userId: user.sub, body });
    if (result.ok === false) {
      const status = result.error === 'NOT_FOUND' ? 404 : 400;
      return familyResponse('family.member.update', requestId, result.error === 'NOT_IN_FAMILY' ? { ok: false, error: result.error } : { error: result.error }, status);
    }

    return familyResponse('family.member.update', requestId, { ok: true, updated_at: result.updatedAt }, 200);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return familyResponse('family.member.update', requestId, { error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FORBIDDEN" ? 403 : 400);
  }
};
