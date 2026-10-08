// Cloudflare Pages Function: /api/wearable/sync
// Accepts wearable snapshots from an iOS bridge (Apple Health / HealthKit)
// or other providers and writes the normalized data into the user profile.

import { requireMobileUser, json } from "../_lib/auth";
import { requireBetaAccess } from "../_lib/access";
import { requireDB } from "../_lib/db";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { isJsonObject } from "../_lib/json";
import { normalizeWearableSyncSnapshot } from "../../../wearableSync";
import { syncWearableProfile } from '../_lib/wearable_profile_sync';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

const handleWearableSyncPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireMobileUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try {
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  const db = requireDB(env);
  let body: unknown = null;
  try {
    body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  if (!isJsonObject(body)) return json({ error: "BAD_JSON" }, 400);

  const payload = normalizeWearableSyncSnapshot(body);
  if (!payload) {
    return json({ error: "NO_WEARABLE_DATA" }, 400);
  }

  const result = await syncWearableProfile({
    db,
    user,
    payload,
    baseVersion: body.baseVersion,
    hasExplicitBaseVersion: Object.prototype.hasOwnProperty.call(body, 'baseVersion'),
  });
  if (result.kind === 'bad-base-version') return json({ error: 'BAD_BASE_VERSION' }, 400);
  if (result.kind === 'conflict') return json({ error: 'PROFILE_CONFLICT', profile: result.profile, version: result.version }, 409);
  return json({ profile: result.profile, updatedFields: result.updatedFields, source: result.source, version: result.version }, 200);
};

/** Correlates mobile wearable sync outcomes without recording health readings or identity. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleWearableSyncPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('wearable.sync.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
