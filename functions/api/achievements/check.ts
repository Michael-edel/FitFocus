import { handleAchievementCheckPost, type AchievementEnv } from "../_lib/achievement_handlers";
import { logApiEvent, requestIdFor, withRequestId } from "../_lib/observability";

type Env = AchievementEnv;

/** Correlates an achievement check without recording profile or client context. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleAchievementCheckPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("achievements.check.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
