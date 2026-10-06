// Cloudflare Pages Function: /api/profile
// Server-driven source-of-truth for UserProfile (stored as JSON in D1)

import { requireUser, json } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { requireDB } from "./_lib/db";
import { readJsonRequest, RequestBodyTooLargeError } from "./_lib/request_body";
import { isJsonObject } from "./_lib/json";
import { loadActivePlan as loadActivePlanShared, loadActivePlanByEmail as loadActivePlanByEmailShared } from "./_lib/plans";
import {
  migrateLegacyAccountByEmail as migrateLegacyAccountByEmailShared,
  withProtectedFields as withProtectedFieldsShared,
} from "./_lib/legacy_sync";
import { loadStoredProfile, writeProfile, type ProfileWriteOutcome, type ProfileWriteUser } from './_lib/profile_write';
export { writeProfileCas } from "./_lib/profile_cas";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };
const PROFILE_JSON_BODY_LIMIT_BYTES = 512 * 1024;

function profileWriteResponse(result: ProfileWriteOutcome): Response {
  if (result.kind === 'saved') {
    return json({
      profile: result.profile,
      updatedFields: result.updatedFields,
      stateItems: result.stateItems,
      mode: result.mode,
      version: result.version,
    }, 200);
  }
  if (result.kind === 'conflict') {
    return json({ error: 'PROFILE_CONFLICT', profile: result.profile, version: result.version }, 409);
  }
  if (result.kind === 'forbidden-keyspace') return json({ error: 'FORBIDDEN_KEYSPACE' }, 403);
  if (result.kind === 'state-items-not-supported') return json({ error: 'STATE_ITEMS_USE_STATE_ENDPOINT' }, 400);
  if (result.kind === 'empty-patch') return json({ error: 'EMPTY_PATCH' }, 400);
  return json({ error: 'BAD_BASE_VERSION' }, 400);
}

async function handleProfileWrite(
  request: Request,
  db: D1Database,
  user: ProfileWriteUser,
  mode: 'replace' | 'patch',
): Promise<Response> {
  let body: unknown = null;
  try {
    body = await readJsonRequest(request, PROFILE_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
    }
    throw err;
  }
  if (!isJsonObject(body)) return json({ error: 'BAD_JSON' }, 400);
  return profileWriteResponse(await writeProfile(db, user, body, mode));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return json({ error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  const profile = await loadStoredProfile(db, user.sub);
  if (!profile) {
    const migrated = await migrateLegacyAccountByEmailShared(db, user);
    if (!migrated) return json({ profile: null }, 200);
    return json({ profile: migrated }, 200);
  }
  const serverPlan = await loadActivePlanShared(db, user.sub);
  const effectivePlan = serverPlan === 'free' ? await loadActivePlanByEmailShared(db, user.email || '') : serverPlan;
  return json({ profile: withProtectedFieldsShared(user, { ...profile, plan: effectivePlan }) }, 200);
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return json({ error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  return handleProfileWrite(request, db, user, 'replace');
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env, user); } catch { return json({ error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  return handleProfileWrite(request, db, user, 'patch');
};
