// /api/family/join
// POST: join a family by invite code
import { requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { joinFamilyByInvite } from "../_lib/family_join_by_invite";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { requestIdFor } from '../_lib/observability';
import { familyResponse } from '../_lib/family_response';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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
        return familyResponse('family.invite.join', requestId, { error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
    const result = await joinFamilyByInvite({ db, userId: user.sub, body });
    return familyResponse('family.invite.join', requestId, { ok: true, familyId: result.familyId, ...(result.alreadyMember ? { alreadyMember: true } : {}) }, 200);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return familyResponse('family.invite.join', requestId, { error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "FAMILY_PLAN_INACTIVE" ? 402 : 400);
  }
};
