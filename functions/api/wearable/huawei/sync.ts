import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../../_lib/request_body";
import {
  ensureHuaweiConnectionsSchema,
  fetchHuaweiDailySnapshot,
  huaweiProviderId,
  huaweiChangedFields,
  parseHuaweiSyncInput,
  loadHuaweiAccessToken,
  type HuaweiHealthEnv,
} from "../../_lib/huawei_health";
import { syncHuaweiProfile } from '../../_lib/huawei_sync';
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

  const { timezone, date, hasExplicitBaseVersion, baseVersion: requestedBaseVersion } = parseHuaweiSyncInput(body);
  if (requestedBaseVersion === null) return json({ error: "BAD_BASE_VERSION" }, 400);
  const snapshot = await fetchHuaweiDailySnapshot(env, request, accessToken, { timezone, date });
  const updatedFields = huaweiChangedFields(snapshot);
  if (!updatedFields.length) {
    return json({ error: "NO_HUAWEI_DATA", provider, updatedFields: [] }, 422);
  }

  const now = Date.now();
  const result = await syncHuaweiProfile({
    db, user, snapshot, date, hasExplicitBaseVersion, requestedBaseVersion, now,
  });
  if (result.kind === 'conflict') {
    return json({
      error: "PROFILE_CONFLICT",
      profile: result.profile,
      version: result.version,
    }, 409);
  }
  return json({ provider, profile: result.profile, updatedFields, version: result.version });
};

/** Correlates Huawei sync outcomes without recording OAuth tokens or health data. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleHuaweiSyncPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('wearable.huawei.sync.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
