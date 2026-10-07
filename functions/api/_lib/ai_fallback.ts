import { safeJsonParseObject, type JsonObject } from './json';

export type AiFallbackProfile = JsonObject & {
  weight?: unknown;
  weight_kg?: unknown;
  weightKg?: unknown;
  goal?: unknown;
  goalType?: unknown;
  activityLevel?: unknown;
  activity_level?: unknown;
  targetWeight?: unknown;
  target_weight_kg?: unknown;
  targetWeightKg?: unknown;
};

/** Loads only the profile fields used by a deterministic AI fallback. */
export async function loadAiFallbackProfile(db: D1Database | undefined, userId: string): Promise<AiFallbackProfile> {
  try {
    const row = await db?.prepare('SELECT profile_json FROM user_profiles WHERE user_id = ?').bind(userId).first<{ profile_json?: string | null }>();
    return row?.profile_json ? safeJsonParseObject(row.profile_json) ?? {} : {};
  } catch {
    return {};
  }
}

export function calcTargetCalories(profile: AiFallbackProfile): number {
  const weight = Number(profile?.weight ?? profile?.weight_kg ?? profile?.weightKg ?? 70);
  const base = Math.round(weight * 30);
  const goal = String(profile.goal || profile.goalType || 'loss');
  const activity = String(profile.activityLevel || profile.activity_level || 'medium');
  const adjustment = goal === 'loss' ? -350 : goal === 'gain' ? 250 : 0;
  const activityAdjustment = activity === 'low' ? -150 : activity === 'high' ? 150 : 0;
  return Math.max(1200, base + adjustment + activityAdjustment);
}

function buildFallbackWeeklyMenu(profile: AiFallbackProfile) {
  const target = calcTargetCalories(profile);
  const perMeal = Math.round(target / 3);
  return {
    fallback: true,
    reason: 'AI temporarily unavailable',
    targetCalories: target,
    days: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'].map((day) => ({
      day,
      targetCalories: target,
      meals: [
        { name: 'Завтрак', calories: perMeal, idea: 'Овсянка + йогурт/творог + ягоды' },
        { name: 'Обед', calories: perMeal, idea: 'Курица/рыба + крупа + овощной салат' },
        { name: 'Ужин', calories: perMeal, idea: 'Омлет/творог/рыба + овощи' },
      ],
    })),
    notes: [
      'Это временный план (fallback), чтобы приложение работало без перебоев.',
      'При восстановлении AI вы сможете сгенерировать более точное меню.',
    ],
  };
}

export function buildFallbackAdvice(profile: AiFallbackProfile) {
  const target = calcTargetCalories(profile);
  const weight = profile?.weight ?? profile?.weight_kg ?? profile?.weightKg;
  const targetWeight = profile?.targetWeight ?? profile?.target_weight_kg ?? profile?.targetWeightKg;
  const activity = profile?.activityLevel ?? profile?.activity_level;
  return {
    fallback: true,
    reason: 'AI temporarily unavailable',
    agreement: 0.88,
    experts: [
      { name: 'Диетолог', summary: [`Цель: ~${target} ккал/день`, 'Белок в каждом приёме пищи', 'Овощи 400–600 г/день'] },
      { name: 'Тренер', summary: ['3–4 тренировки/нед (или 8–10k шагов/день)', 'Прогрессия нагрузки', 'Разминка/заминка'] },
      { name: 'Психолог', summary: ['Планируй 1–2 любимые еды в неделю без чувства вины', 'Сон 7–8 часов', 'Фиксируй триггеры переедания'] },
      { name: 'Стратег', summary: ['Держи дефицит умеренным', 'Следи за средним весом по неделе', 'Одна привычка за раз'] },
    ],
    plan: {
      profileSnapshot: { weight: weight ?? null, targetWeight: targetWeight ?? null, activity: activity ?? null },
      steps: [
        'Собери тарелку: 1/2 овощи, 1/4 белок, 1/4 сложные углеводы.',
        'Пей воду и добавь лёгкую активность каждый день.',
        'Отслеживай питание 3 дня для калибровки.',
      ],
    },
  };
}

export function buildAiFallback(feature: string, profile: AiFallbackProfile) {
  return feature === 'weekly_menu' || feature === 'menu_week' || feature === 'weekly_plan'
    ? buildFallbackWeeklyMenu(profile)
    : buildFallbackAdvice(profile);
}

export function shouldUseAiFallback(status: number) {
  return !status || Number.isNaN(status) || status === 429 || status >= 500;
}
