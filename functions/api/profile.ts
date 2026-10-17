// Cloudflare Pages Function: /api/profile
// Server-driven source-of-truth for UserProfile (stored as JSON in D1)

import { json } from "./_lib/auth";
import { requireScopedStateUser } from './_lib/state_session';
import { requireBetaAccess } from "./_lib/access";
import { requireDB } from "./_lib/db";
import { readJsonRequest, RequestBodyTooLargeError } from "./_lib/request_body";
import { isJsonObject } from "./_lib/json";
import { writeProfile, type ProfileWriteOutcome, type ProfileWriteUser } from './_lib/profile_write';
import { loadCurrentProfile } from './_lib/profile_read';
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';
export { writeProfileCas } from "./_lib/profile_cas";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };
const PROFILE_JSON_BODY_LIMIT_BYTES = 512 * 1024;

function respond(request: Request, requestId: string, body: unknown, status: number): Response {
  logApiEvent('profile.response', { requestId, status });
  const response = withRequestId(json(body, status), requestId);
  response.headers.set('X-FitFocus-Profile-Protocol', '1');
  response.headers.set('X-FitFocus-Profile-Guard', '1');
  for (const header of ['X-FitFocus-State-Account', 'X-FitFocus-State-Session']) {
    const value = request.headers.get(header);
    if (value !== null) response.headers.set(header, value);
  }
  return response;
}

function profileWriteResponse(request: Request, requestId: string, result: ProfileWriteOutcome): Response {
  if (result.kind === 'saved') {
    return respond(request, requestId, {
      profile: result.profile,
      updatedFields: result.updatedFields,
      stateItems: result.stateItems,
      mode: result.mode,
      version: result.version,
    }, 200);
  }
  if (result.kind === 'conflict') {
    return respond(request, requestId, { error: 'PROFILE_CONFLICT', profile: result.profile, version: result.version }, 409);
  }
  if (result.kind === 'forbidden-keyspace') return respond(request, requestId, { error: 'FORBIDDEN_KEYSPACE' }, 403);
  if (result.kind === 'state-items-not-supported') return respond(request, requestId, { error: 'STATE_ITEMS_USE_STATE_ENDPOINT' }, 400);
  if (result.kind === 'empty-patch') return respond(request, requestId, { error: 'EMPTY_PATCH' }, 400);
  if (result.kind === 'invalid-weekly-menu') return respond(request, requestId, { error: 'PROFILE_INVALID_WEEKLY_MENU' }, 422);
  return respond(request, requestId, { error: 'BAD_BASE_VERSION' }, 400);
}

async function handleProfileWrite(
  request: Request,
  db: D1Database,
  user: ProfileWriteUser,
  mode: 'replace' | 'patch',
  requestId: string,
): Promise<Response> {
  let body: unknown = null;
  try {
    body = await readJsonRequest(request, PROFILE_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return respond(request, requestId, { error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
    }
    throw err;
  }
  if (!isJsonObject(body)) return respond(request, requestId, { error: 'BAD_JSON' }, 400);
  return profileWriteResponse(request, requestId, await writeProfile(db, user, body, mode));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireScopedStateUser(request, env);
  } catch {
    return respond(request, requestId, { error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return respond(request, requestId, { error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  return respond(request, requestId, { profile: await loadCurrentProfile(db, user) }, 200);
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireScopedStateUser(request, env);
  } catch {
    return respond(request, requestId, { error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return respond(request, requestId, { error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  return handleProfileWrite(request, db, user, 'replace', requestId);
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireScopedStateUser(request, env);
  } catch {
    return respond(request, requestId, { error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return respond(request, requestId, { error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  return handleProfileWrite(request, db, user, 'patch', requestId);
};
