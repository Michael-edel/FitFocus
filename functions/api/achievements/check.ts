import { ACHIEVEMENT_BY_KEY, ACHIEVEMENT_CATALOG } from "../../../achievements/catalog";
import {
  evaluateAchievements,
  mergeAchievementContext,
  type AchievementEvaluationContext,
} from "../../../achievements/engine";
import { requireUser, json } from "../_lib/auth";
import { nowMs, requireDB, uuid } from "../_lib/db";
import { isEnabled, loadFeatures } from "../_lib/features";
import { isJsonObject, safeJsonParseObject, type JsonObject } from "../_lib/json";
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

function numberOrNull(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function contextFromProfile(profile: JsonObject | null): AchievementEvaluationContext {
  const weightHistory = Array.isArray(profile?.weightHistory) ? profile.weightHistory : [];
  const measurementsHistory = Array.isArray(profile?.measurementsHistory) ? profile.measurementsHistory : [];
  const aiPlan = isJsonObject(profile?.aiPlan) ? profile.aiPlan : null;
  const firstWeight = isJsonObject(weightHistory[0]) ? numberOrNull(weightHistory[0].weight) : null;
  const latestWeightEntry = weightHistory[weightHistory.length - 1];
  const latestWeight = numberOrNull((isJsonObject(latestWeightEntry) ? latestWeightEntry.weight : undefined) ?? profile?.weight);
  return {
    profileExists: !!profile,
    profileDetailsCompleted: !!profile?.profileDetailsCompleted,
    hasAiPlan: !!aiPlan,
    hasWeeklyMenu: Boolean(aiPlan?.weeklyMenu) || Boolean(aiPlan?.familyWeeklyMenu),
    weightHistoryCount: weightHistory.length,
    initialWeight: firstWeight,
    latestWeight,
    measurementsCount: measurementsHistory.length,
    familyActive: Array.isArray(profile?.familyMembers) && profile.familyMembers.length > 0,
    sleepHours: numberOrNull(profile?.wearableSleepHoursLastNight),
  };
}

function safeClientContext(input: unknown): AchievementEvaluationContext {
  if (!isJsonObject(input)) return {};
  const allowed: (keyof AchievementEvaluationContext)[] = [
    "source",
    "profileExists",
    "profileDetailsCompleted",
    "hasAiPlan",
    "hasWeeklyMenu",
    "foodDiaryCount",
    "hasAiPhoto",
    "aiPhotoCount",
    "foodStreak",
    "weightHistoryCount",
    "initialWeight",
    "latestWeight",
    "measurementsCount",
    "wisCount",
    "wisShareCount",
    "shoppingCheckedCount",
    "pdfReportCount",
    "familyActive",
    "waterToday",
    "sleepHours",
  ];
  const output: AchievementEvaluationContext = {};
  for (const key of allowed) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      output[key] = value as never;
    }
  }
  return output;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const features = await loadFeatures(env, String(user.sub));
  if (!isEnabled(features, "achievements_enabled", true)) {
    return json({ enabled: false, catalog: [], newlyUnlocked: [] }, 200);
  }

  let body: JsonObject = {};
  try {
    body = (await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES)) ?? {};
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    return json({ error: "BAD_JSON" }, 400);
  }
  const db = requireDB(env);
  const row = await db
    .prepare("SELECT profile_json FROM user_profiles WHERE user_id = ? LIMIT 1")
    .bind(user.sub)
    .first<{ profile_json?: string }>();

  const profile = row?.profile_json ? safeJsonParseObject(row.profile_json) : null;

  const context = mergeAchievementContext(contextFromProfile(profile), safeClientContext(body?.context || body));
  const candidates = evaluateAchievements(context);
  if (!candidates.length) {
    return json({ enabled: true, catalog: ACHIEVEMENT_CATALOG, newlyUnlocked: [] }, 200);
  }

  const existingRows = await db
    .prepare("SELECT achievement_key FROM user_achievements WHERE user_id = ?")
    .bind(user.sub)
    .all();
  const existing = new Set((existingRows.results || []).map((item) => String(item.achievement_key || "")));
  const now = nowMs();
  const newlyUnlocked: Array<Record<string, unknown>> = [];

  for (const candidate of candidates) {
    if (existing.has(candidate.key)) continue;
    const definition = ACHIEVEMENT_BY_KEY.get(candidate.key);
    if (!definition) continue;
    const snapshotJson = candidate.snapshot ? JSON.stringify(candidate.snapshot).slice(0, 1500) : null;
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO user_achievements
          (id, user_id, achievement_key, unlocked_at, tier, source, snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(uuid(), user.sub, candidate.key, now, definition.tier, candidate.source || context.source || null, snapshotJson, now)
      .run();
    const meta = isJsonObject(result?.meta) ? result.meta : null;
    if (Number(meta?.changes || 0) > 0) {
      existing.add(candidate.key);
      newlyUnlocked.push({
        ...definition,
        unlocked_at: now,
        source: candidate.source || context.source || null,
      });
    }
  }

  return json({ enabled: true, catalog: ACHIEVEMENT_CATALOG, newlyUnlocked }, 200);
};
