import { ACHIEVEMENT_BY_KEY, ACHIEVEMENT_CATALOG } from "../../../achievements/catalog";
import {
  evaluateAchievements,
  mergeAchievementContext,
  type AchievementEvaluationContext,
} from "../../../achievements/engine";
import { requireUser, json } from "../_lib/auth";
import { nowMs, requireDB, uuid } from "../_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

function numberOrNull(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function contextFromProfile(profile: any): AchievementEvaluationContext {
  const weightHistory = Array.isArray(profile?.weightHistory) ? profile.weightHistory : [];
  const measurementsHistory = Array.isArray(profile?.measurementsHistory) ? profile.measurementsHistory : [];
  const firstWeight = numberOrNull(weightHistory[0]?.weight);
  const latestWeight = numberOrNull(weightHistory[weightHistory.length - 1]?.weight ?? profile?.weight);
  return {
    profileExists: !!profile,
    profileDetailsCompleted: !!profile?.profileDetailsCompleted,
    hasAiPlan: !!profile?.aiPlan,
    hasWeeklyMenu: !!profile?.aiPlan?.weeklyMenu || !!profile?.aiPlan?.familyWeeklyMenu,
    weightHistoryCount: weightHistory.length,
    initialWeight: firstWeight,
    latestWeight,
    measurementsCount: measurementsHistory.length,
    familyActive: String(profile?.plan || "").toLowerCase() === "family" || (Array.isArray(profile?.familyMembers) && profile.familyMembers.length > 0),
    sleepHours: numberOrNull(profile?.wearableSleepHoursLastNight),
  };
}

function safeClientContext(input: any): AchievementEvaluationContext {
  if (!input || typeof input !== "object") return {};
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
      (output as any)[key] = value;
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

  const body: any = await request.json().catch(() => ({}));
  const db = requireDB(env);
  const row = await db
    .prepare("SELECT profile_json FROM user_profiles WHERE user_id = ? LIMIT 1")
    .bind(user.sub)
    .first<{ profile_json?: string }>();

  let profile: any = null;
  try {
    profile = row?.profile_json ? JSON.parse(row.profile_json) : null;
  } catch {
    profile = null;
  }

  const context = mergeAchievementContext(contextFromProfile(profile), safeClientContext(body?.context || body));
  const candidates = evaluateAchievements(context);
  if (!candidates.length) {
    return json({ catalog: ACHIEVEMENT_CATALOG, newlyUnlocked: [] }, 200);
  }

  const existingRows = await db
    .prepare("SELECT achievement_key FROM user_achievements WHERE user_id = ?")
    .bind(user.sub)
    .all();
  const existing = new Set((existingRows.results || []).map((item: any) => String(item.achievement_key || "")));
  const now = nowMs();
  const newlyUnlocked: any[] = [];

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
    if (Number((result as any)?.meta?.changes || 0) > 0) {
      existing.add(candidate.key);
      newlyUnlocked.push({
        ...definition,
        unlocked_at: now,
        source: candidate.source || context.source || null,
      });
    }
  }

  return json({ catalog: ACHIEVEMENT_CATALOG, newlyUnlocked }, 200);
};
