import { ACHIEVEMENT_BY_KEY, ACHIEVEMENT_CATALOG } from '../../../achievements/catalog';
import { evaluateAchievements, mergeAchievementContext, type AchievementEvaluationContext } from '../../../achievements/engine';
import { nowMs, uuid } from './db';
import { isJsonObject, safeJsonParseObject, type JsonObject } from './json';
import { normalizeProfileRecord } from './profile_contract';

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
    profileExists: !!profile, profileDetailsCompleted: !!profile?.profileDetailsCompleted,
    hasAiPlan: !!aiPlan, hasWeeklyMenu: Boolean(aiPlan?.weeklyMenu) || Boolean(aiPlan?.familyWeeklyMenu),
    weightHistoryCount: weightHistory.length, initialWeight: firstWeight, latestWeight,
    measurementsCount: measurementsHistory.length,
    familyActive: Array.isArray(profile?.familyMembers) && profile.familyMembers.length > 0,
    sleepHours: numberOrNull(profile?.wearableSleepHoursLastNight),
  };
}

function safeClientContext(input: unknown): AchievementEvaluationContext {
  if (!isJsonObject(input)) return {};
  const allowed: (keyof AchievementEvaluationContext)[] = [
    'source', 'profileExists', 'profileDetailsCompleted', 'hasAiPlan', 'hasWeeklyMenu', 'foodDiaryCount',
    'hasAiPhoto', 'aiPhotoCount', 'foodStreak', 'weightHistoryCount', 'initialWeight', 'latestWeight',
    'measurementsCount', 'wisCount', 'wisShareCount', 'shoppingCheckedCount', 'pdfReportCount',
    'familyActive', 'waterToday', 'sleepHours',
  ];
  const output: AchievementEvaluationContext = {};
  for (const key of allowed) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      output[key] = value as never;
    }
  }
  return output;
}

/** Derives trusted achievement context and writes only achievements not already held by the user. */
export async function checkAchievements(db: D1Database, userId: string, body: JsonObject) {
  const row = await db.prepare('SELECT profile_json FROM user_profiles WHERE user_id = ? LIMIT 1')
    .bind(userId).first<{ profile_json?: string }>();
  const parsedProfile = row?.profile_json ? safeJsonParseObject(row.profile_json) : null;
  const profile = parsedProfile ? normalizeProfileRecord(parsedProfile) : null;
  const context = mergeAchievementContext(contextFromProfile(profile), safeClientContext(body.context || body));
  const candidates = evaluateAchievements(context);
  if (!candidates.length) return { catalog: ACHIEVEMENT_CATALOG, newlyUnlocked: [] };

  const existingRows = await db.prepare('SELECT achievement_key FROM user_achievements WHERE user_id = ?')
    .bind(userId).all<{ achievement_key?: string }>();
  const existing = new Set((existingRows.results || []).map((item) => String(item.achievement_key || '')));
  const now = nowMs();
  const newlyUnlocked: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    if (existing.has(candidate.key)) continue;
    const definition = ACHIEVEMENT_BY_KEY.get(candidate.key);
    if (!definition) continue;
    const snapshotJson = candidate.snapshot ? JSON.stringify(candidate.snapshot).slice(0, 1500) : null;
    const result = await db.prepare(
      `INSERT OR IGNORE INTO user_achievements
        (id, user_id, achievement_key, unlocked_at, tier, source, snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), userId, candidate.key, now, definition.tier, candidate.source || context.source || null, snapshotJson, now).run();
    const meta = isJsonObject(result?.meta) ? result.meta : null;
    if (Number(meta?.changes || 0) > 0) {
      existing.add(candidate.key);
      newlyUnlocked.push({ ...definition, unlocked_at: now, source: candidate.source || context.source || null });
    }
  }
  return { catalog: ACHIEVEMENT_CATALOG, newlyUnlocked };
}
