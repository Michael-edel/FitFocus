// /api/family/invite
// POST: creates an invite code for current family (owner only)
import { requireUser } from "../_lib/auth";
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { createFamilyInvite } from "../_lib/family_invite_create";
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
        return familyResponse('family.invite.create', requestId, { error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
    const result = await createFamilyInvite({ db, userId: user.sub, body });
    if (result.ok === false) return familyResponse('family.invite.create', requestId, { error: result.error }, 409);

    return familyResponse('family.invite.create', requestId, { code: result.code, expiresAt: result.expiresAt }, 201);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return familyResponse('family.invite.create', requestId, { error: apiErr }, apiErr.code === "UNAUTH" ? 401 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};
