import { calculateDailyTargets } from './profileMath';
import { Goal, type AIPlan, type UserProfile } from './types';

const clampList = (items: string[], limit: number) => items.slice(0, limit).map((s) => String(s).trim()).filter(Boolean);

export function buildFallbackAiPlan(user: UserProfile): AIPlan {
  const targets = calculateDailyTargets(user);
  const isLoss = user.goal === Goal.LOSS;
  const isGain = user.goal === Goal.GAIN;

  const title = isLoss
    ? 'Дефицит + белок'
    : isGain
      ? 'Профицит + сила'
      : 'Стабильный режим';

  const strategySummary = isLoss
    ? 'Сначала удерживаем умеренный дефицит, повышаем белок и фиксируем регулярность. Упор на простые повторяемые приёмы пищи и контроль шагов.'
    : isGain
      ? 'Делаем контролируемый профицит, держим белок и силовую нагрузку. Сохраняем стабильный режим питания и отслеживаем динамику веса.'
      : 'Держим калории около поддержки, стабилизируем привычки и следим за белком. Фокус на качественном режиме без лишних скачков.';

  const weeklyFocus = isLoss
    ? 'Неделя контроля порций, воды и шагов.'
    : isGain
      ? 'Неделя стабильного питания и восстановления.'
      : 'Неделя стабилизации режима и трекинга.';

  const rules = clampList([
    'Белок в каждом приёме пищи.',
    'Овощи в обед и ужин.',
    'Вода каждый день, без пропусков.',
    isLoss ? 'Держать дефицит без жёстких срывов.' : 'Не пропускать основные приёмы пищи.',
    'Шаги и сон важнее идеальности меню.',
    'Отмечать прогресс ежедневно, а не по настроению.'
  ], 6);

  const firstTasks = clampList([
    'Заполнить дневник питания за сегодня.',
    'Собрать 3 простых приёма пищи на завтра.',
    'Проверить воду, шаги и сон вечером.'
  ], 3);

  const mealTemplate = isLoss
    ? {
        breakfast: 'Завтрак: белок + сложные углеводы + фрукт.',
        lunch: 'Обед: мясо/рыба + гарнир + овощи.',
        dinner: 'Ужин: белок + овощи, без лишних перекусов.',
        snack: 'Перекус: йогурт/творог/фрукт.'
      }
    : isGain
      ? {
          breakfast: 'Завтрак: каша + белок + фрукт.',
          lunch: 'Обед: белок + гарнир + овощи + дополнительная порция.',
          dinner: 'Ужин: полноценный белковый приём пищи.',
          snack: 'Перекус: творог, орехи или йогурт.'
        }
      : {
          breakfast: 'Завтрак: каша/йогурт + белок + фрукт.',
          lunch: 'Обед: белок + гарнир + овощи.',
          dinner: 'Ужин: белок + овощи.',
          snack: 'Перекус: йогурт, фрукт или творог.'
        };

  return {
    title,
    strategySummary,
    weeklyFocus,
    dailyKpi: {
      calories: Math.max(0, Math.round(targets.calories)),
      protein: Math.max(0, Math.round(targets.protein)),
      fat: Math.max(0, Math.round(targets.fat)),
      carbs: Math.max(0, Math.round(targets.carbs)),
    },
    rules,
    firstTasks,
    mealTemplate,
    createdAt: new Date().toISOString(),
    model: 'local-fallback',
  };
}
