// /api/family/invite
// POST: creates an invite code for the explicitly selected family (owner only)
import { requireScopedStateUser, withSessionGuard } from '../_lib/state_session';
import { requireDB, ensureUserRow, toApiError } from "../_lib/db";
import { createFamilyInvite } from "../_lib/family_invite_create";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { requestIdFor } from '../_lib/observability';
import { familyResponse } from '../_lib/family_response';

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

const handlePost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  try {
    const user = await requireScopedStateUser(request, env);
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
    const familyId = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).familyId
      : undefined;
    const result = await createFamilyInvite({ db, userId: user.sub, familyId, body });
    if (result.ok === false) {
      const status = result.error === 'BAD_TARGET' ? 400 : 409;
      return familyResponse('family.invite.create', requestId, { error: result.error }, status);
    }

    return familyResponse('family.invite.create', requestId, { code: result.code, expiresAt: result.expiresAt }, 201);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return familyResponse('family.invite.create', requestId, { error: apiErr }, ['UNAUTH', 'STATE_SESSION_CHANGED', 'STATE_SESSION_REQUIRED'].includes(apiErr.code) ? 401 : apiErr.code === 'FORBIDDEN' ? 403 : apiErr.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async context =>
  withSessionGuard(await handlePost(context), context.request, 'Family');
