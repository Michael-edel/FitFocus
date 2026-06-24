import type { AchievementDefinition } from './catalog';
import { ACHIEVEMENT_BY_KEY } from './catalog';

export type AchievementEvaluationContext = {
  source?: string;
  profileExists?: boolean;
  profileDetailsCompleted?: boolean;
  hasAiPlan?: boolean;
  hasWeeklyMenu?: boolean;
  foodDiaryCount?: number;
  hasAiPhoto?: boolean;
  aiPhotoCount?: number;
  foodStreak?: number;
  weightHistoryCount?: number;
  initialWeight?: number | null;
  latestWeight?: number | null;
  measurementsCount?: number;
  wisCount?: number;
  wisShareCount?: number;
  shoppingCheckedCount?: number;
  pdfReportCount?: number;
  familyActive?: boolean;
  waterToday?: boolean;
  sleepHours?: number | null;
};

export type AchievementCandidate = {
  key: string;
  source?: string;
  snapshot?: Record<string, unknown>;
};

const SOURCE_KEYS = {
  foodManual: 'food_manual_added',
  aiPhoto: 'ai_photo_success',
  aiCoach: 'ai_coach_success',
  aiPlan: 'ai_plan_created',
  wisShare: 'wis_share_success',
  weeklyMenu: 'weekly_menu_generated',
  shoppingChecked: 'shopping_item_checked',
  pdfReport: 'pdf_report_generated',
  family: 'family_join_or_create',
  water: 'habit_water_done',
  sleep: 'sleep_8h_recorded',
};

function numeric(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function buildSnapshot(context: AchievementEvaluationContext, key: string): Record<string, unknown> {
  return {
    key,
    foodDiaryCount: numeric(context.foodDiaryCount),
    foodStreak: numeric(context.foodStreak),
    aiPhotoCount: numeric(context.aiPhotoCount),
    weightHistoryCount: numeric(context.weightHistoryCount),
    measurementsCount: numeric(context.measurementsCount),
    wisCount: numeric(context.wisCount),
    shoppingCheckedCount: numeric(context.shoppingCheckedCount),
    pdfReportCount: numeric(context.pdfReportCount),
    familyActive: !!context.familyActive,
  };
}

function pushIf(
  output: AchievementCandidate[],
  key: string,
  condition: boolean,
  context: AchievementEvaluationContext,
) {
  const definition: AchievementDefinition | undefined = ACHIEVEMENT_BY_KEY.get(key);
  if (!definition || !condition) return;
  output.push({ key, source: context.source, snapshot: buildSnapshot(context, key) });
}

export function evaluateAchievements(context: AchievementEvaluationContext): AchievementCandidate[] {
  const output: AchievementCandidate[] = [];
  const source = context.source || '';
  const weightLossKg =
    typeof context.initialWeight === 'number' && typeof context.latestWeight === 'number'
      ? context.initialWeight - context.latestWeight
      : 0;

  pushIf(output, 'welcome', !!context.profileExists, context);
  pushIf(output, 'first_food_manual', source === SOURCE_KEYS.foodManual, context);
  pushIf(output, 'first_ai_photo', source === SOURCE_KEYS.aiPhoto || !!context.hasAiPhoto || numeric(context.aiPhotoCount) > 0, context);
  pushIf(output, 'first_weight', numeric(context.weightHistoryCount) > 0, context);
  pushIf(output, 'first_measurement', numeric(context.measurementsCount) > 0, context);
  pushIf(output, 'first_ai_coach', source === SOURCE_KEYS.aiCoach, context);
  pushIf(output, 'first_ai_plan', source === SOURCE_KEYS.aiPlan || !!context.hasAiPlan, context);
  pushIf(output, 'profile_details_completed', !!context.profileDetailsCompleted, context);
  pushIf(output, 'food_streak_3', numeric(context.foodStreak) >= 3, context);
  pushIf(output, 'food_streak_7', numeric(context.foodStreak) >= 7, context);
  pushIf(output, 'first_wis', numeric(context.wisCount) > 0, context);
  pushIf(output, 'wis_share_first', source === SOURCE_KEYS.wisShare || numeric(context.wisShareCount) > 0, context);
  pushIf(output, 'first_weekly_menu', source === SOURCE_KEYS.weeklyMenu || !!context.hasWeeklyMenu, context);
  pushIf(output, 'first_shopping_item_checked', source === SOURCE_KEYS.shoppingChecked || numeric(context.shoppingCheckedCount) > 0, context);
  pushIf(output, 'first_pdf_report', source === SOURCE_KEYS.pdfReport || numeric(context.pdfReportCount) > 0, context);
  pushIf(output, 'first_family_join_or_create', source === SOURCE_KEYS.family || !!context.familyActive, context);
  pushIf(output, 'ai_photo_10', numeric(context.aiPhotoCount) >= 10, context);
  pushIf(output, 'weight_loss_1kg', weightLossKg >= 1, context);
  pushIf(output, 'water_first', source === SOURCE_KEYS.water || !!context.waterToday, context);
  pushIf(output, 'sleep_8h_first', source === SOURCE_KEYS.sleep || numeric(context.sleepHours) >= 8, context);

  return output;
}

export function mergeAchievementContext(
  base: AchievementEvaluationContext,
  patch: AchievementEvaluationContext,
): AchievementEvaluationContext {
  return { ...base, ...patch, source: patch.source || base.source };
}
