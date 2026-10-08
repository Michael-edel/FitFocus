import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../../_lib/request_body";
import { asOptionalString, isJsonObject } from "../../_lib/json";
import { writeProfileCas } from "../../_lib/profile_cas";
import { loadActivePlan } from "../../_lib/plans";
import {
  ensureHuaweiConnectionsSchema,
  fetchHuaweiDailySnapshot,
  huaweiProviderId,
  huaweiChangedFields,
  buildHuaweiSyncedProfile,
  protectHuaweiProfile,
  markHuaweiSynced,
  loadHuaweiProfile,
  parseHuaweiBaseVersion,
  loadHuaweiAccessToken,
  type HuaweiHealthEnv,
} from "../../_lib/huawei_health";
import { logApiEvent, requestIdFor, withRequestId } from '../../_lib/observability';

type Env = HuaweiHealthEnv & { DB: D1Database };


const handleHuaweiSyncPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  let body: unknown = {};
  try {
    body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }

  const db = requireDB(env);
  await ensureHuaweiConnectionsSchema(db);
  const credential = await loadHuaweiAccessToken(env, request, db, user.sub);
  if (credential.kind === 'not-connected') return json({ error: "HUAWEI_NOT_CONNECTED" }, 409);
  if (credential.kind === 'refresh-token-missing') return json({ error: "HUAWEI_REFRESH_TOKEN_MISSING" }, 409);
  const { provider, accessToken } = credential;

  const timezone = asOptionalString(isJsonObject(body) ? body.timezone : undefined);
  const date = asOptionalString(isJsonObject(body) ? body.date : undefined);
  const hasExplicitBaseVersion = isJsonObject(body) && Object.prototype.hasOwnProperty.call(body, "baseVersion");
  const requestedBaseVersion = parseHuaweiBaseVersion(isJsonObject(body) ? body.baseVersion : undefined);
  if (requestedBaseVersion === null) return json({ error: "BAD_BASE_VERSION" }, 400);
  const snapshot = await fetchHuaweiDailySnapshot(env, request, accessToken, { timezone, date });
  const updatedFields = huaweiChangedFields(snapshot);
  if (!updatedFields.length) {
    return json({ error: "NO_HUAWEI_DATA", provider, updatedFields: [] }, 422);
  }

  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const current = await loadHuaweiProfile(db, user.sub);
  const currentProfile = current.profile;
  if (hasExplicitBaseVersion && requestedBaseVersion !== current.version) {
    return json({ error: "PROFILE_CONFLICT", profile: protectHuaweiProfile(user, { ...currentProfile, version: current.version }), version: current.version }, 409);
  }
  const expectedVersion = hasExplicitBaseVersion ? requestedBaseVersion : current.version;
  const version = expectedVersion + 1;
  const plan = await loadActivePlan(db, user.sub);
  const nextProfile = buildHuaweiSyncedProfile({ user, currentProfile, plan, version, timestamp, date, snapshot });

  const profileWritten = await writeProfileCas(db, user.sub, nextProfile, expectedVersion, now);
  if (!profileWritten) {
    const latest = await loadHuaweiProfile(db, user.sub);
    return json({
      error: "PROFILE_CONFLICT",
      profile: protectHuaweiProfile(user, { ...latest.profile, version: latest.version }),
      version: latest.version,
    }, 409);
  }

  await markHuaweiSynced(db, user.sub, now);

  return json({ provider, profile: nextProfile, updatedFields, version });
};

/** Correlates Huawei sync outcomes without recording OAuth tokens or health data. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleHuaweiSyncPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('wearable.huawei.sync.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
