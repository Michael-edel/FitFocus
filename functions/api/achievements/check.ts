import { ACHIEVEMENT_CATALOG } from '../../../achievements/catalog';
import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { isEnabled, loadFeatures } from '../_lib/features';
import { checkAchievements } from '../_lib/achievement_check';
import type { JsonObject } from '../_lib/json';
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from '../_lib/request_body';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

const handleAchievementCheckPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  const features = await loadFeatures(env, String(user.sub));
  if (!isEnabled(features, 'achievements_enabled', true)) {
    return json({ enabled: false, catalog: [], newlyUnlocked: [] }, 200);
  }
  let body: JsonObject = {};
  try {
    body = (await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES)) ?? {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
    return json({ error: 'BAD_JSON' }, 400);
  }
  const result = await checkAchievements(requireDB(env), user.sub, body);
  return json({ enabled: true, ...result }, 200);
};

/** Correlates an achievement check without recording profile or client context. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleAchievementCheckPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('achievements.check.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
