// Cloudflare Pages Function: /api/profile
// Server-driven source-of-truth for UserProfile (stored as JSON in D1)

import { requireUser, json } from "./_lib/auth";
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

function respond(requestId: string, body: unknown, status: number): Response {
  logApiEvent('profile.response', { requestId, status });
  return withRequestId(json(body, status), requestId);
}

function profileWriteResponse(requestId: string, result: ProfileWriteOutcome): Response {
  if (result.kind === 'saved') {
    return respond(requestId, {
      profile: result.profile,
      updatedFields: result.updatedFields,
      stateItems: result.stateItems,
      mode: result.mode,
      version: result.version,
    }, 200);
  }
  if (result.kind === 'conflict') {
    return respond(requestId, { error: 'PROFILE_CONFLICT', profile: result.profile, version: result.version }, 409);
  }
  if (result.kind === 'forbidden-keyspace') return respond(requestId, { error: 'FORBIDDEN_KEYSPACE' }, 403);
  if (result.kind === 'state-items-not-supported') return respond(requestId, { error: 'STATE_ITEMS_USE_STATE_ENDPOINT' }, 400);
  if (result.kind === 'empty-patch') return respond(requestId, { error: 'EMPTY_PATCH' }, 400);
  return respond(requestId, { error: 'BAD_BASE_VERSION' }, 400);
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
      return respond(requestId, { error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
    }
    throw err;
  }
  if (!isJsonObject(body)) return respond(requestId, { error: 'BAD_JSON' }, 400);
  return profileWriteResponse(requestId, await writeProfile(db, user, body, mode));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return respond(requestId, { error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return respond(requestId, { error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  return respond(requestId, { profile: await loadCurrentProfile(db, user) }, 200);
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return respond(requestId, { error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return respond(requestId, { error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  return handleProfileWrite(request, db, user, 'replace', requestId);
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return respond(requestId, { error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return respond(requestId, { error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  return handleProfileWrite(request, db, user, 'patch', requestId);
};
