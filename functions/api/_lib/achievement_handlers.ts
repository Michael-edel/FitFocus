import { ACHIEVEMENT_CATALOG } from "../../../achievements/catalog";
import { json } from "./auth";
import { requireStateUser, withSessionGuard } from './state_session';
import { checkAchievements } from "./achievement_check";
import { readUserAchievements } from "./achievement_read";
import { requireDB } from "./db";
import { isEnabled, loadFeatures } from "./features";
import { type JsonObject } from "./json";
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "./request_body";

export type AchievementEnv = { AUTH_JWT_SECRET: string; DB: D1Database };
type AchievementContext = Parameters<PagesFunction<AchievementEnv>>[0];

async function requireEnabledAchievements(request: Request, env: AchievementEnv) {
  try {
    const user = await requireStateUser(request, env);
    const features = await loadFeatures(env, String(user.sub));
    return { user, enabled: isEnabled(features, "achievements_enabled", true) };
  } catch {
    return null;
  }
}

async function readAchievements({ request, env }: AchievementContext): Promise<Response> {
  const auth = await requireEnabledAchievements(request, env);
  if (!auth) return json({ error: "UNAUTH" }, 401);
  if (!auth.enabled) return json({ enabled: false, catalog: [], unlocked: [] }, 200);
  return json({ enabled: true, catalog: ACHIEVEMENT_CATALOG, unlocked: await readUserAchievements(requireDB(env), auth.user.sub) }, 200);
}

async function evaluateAchievements({ request, env }: AchievementContext): Promise<Response> {
  const auth = await requireEnabledAchievements(request, env);
  if (!auth) return json({ error: "UNAUTH" }, 401);
  if (!auth.enabled) return json({ enabled: false, catalog: [], newlyUnlocked: [] }, 200);
  let body: JsonObject = {};
  try {
    const parsed = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
    if (!parsed) return json({ error: "BAD_JSON" }, 400);
    body = parsed;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    return json({ error: "BAD_JSON" }, 400);
  }
  return json({ enabled: true, ...await checkAchievements(requireDB(env), auth.user.sub, body) }, 200);
}

export async function handleAchievementsGet(context: AchievementContext): Promise<Response> {
  return withSessionGuard(await readAchievements(context), context.request, 'Achievements');
}

export async function handleAchievementCheckPost(context: AchievementContext): Promise<Response> {
  return withSessionGuard(await evaluateAchievements(context), context.request, 'Achievements');
}
