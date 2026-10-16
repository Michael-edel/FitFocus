import { handleAchievementsGet, type AchievementEnv } from "../_lib/achievement_handlers";
import { logApiEvent, requestIdFor, withRequestId } from "../_lib/observability";

type Env = AchievementEnv;

/** Correlates achievement reads without recording unlocked records or user data. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleAchievementsGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("achievements.read.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
