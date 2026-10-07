import { ACHIEVEMENT_CATALOG } from '../../../achievements/catalog';
import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { isEnabled, loadFeatures } from '../_lib/features';
import { readUserAchievements } from '../_lib/achievement_read';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

const handleAchievementsGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  const features = await loadFeatures(env, String(user.sub));
  if (!isEnabled(features, 'achievements_enabled', true)) {
    return json({ enabled: false, catalog: [], unlocked: [] }, 200);
  }
  return json({ enabled: true, catalog: ACHIEVEMENT_CATALOG, unlocked: await readUserAchievements(requireDB(env), user.sub) }, 200);
};

/** Correlates achievement reads without recording unlocked records or user data. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleAchievementsGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('achievements.read.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
