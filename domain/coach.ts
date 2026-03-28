import { weightDelta } from '../weight';
import { UserProfile, Goal, FoodItem, UserHabit } from './types';
import { detectPlateau, plateauAdjustmentCalories } from './plateau';
import { calculateDailyTargets } from './profileMath';
import { calculateCompliance, adaptiveTDEE } from './adaptive';
import { generatePlateauExplanation } from '../geminiService';

export async function generateDailyTask(profile: UserProfile, diary: FoodItem[], habits: UserHabit[]): Promise<string> {
  // 1. Проверка на плато
  const plateau = detectPlateau(profile);
  const compliance = calculateCompliance(diary, habits, profile);
  
  if (plateau && profile.goal === Goal.LOSS) {
    if (compliance > 0.7) {
      // Если пользователь молодец, но вес стоит — зовем AI для объяснения и адаптации
      const adaptedTDEEValue = adaptiveTDEE(profile);
      const deficit = profile.lossDeficit ?? 500;
      const newTarget = adaptedTDEEValue - deficit;
      
      const last14 = profile.weightHistory?.slice(-14) || [];
      const delta = last14.length >= 2 ? last14[last14.length - 1].weight - last14[0].weight : 0;
      
      return await generatePlateauExplanation({
        weightDelta: delta,
        compliance,
        newCalories: newTarget
      });
    } else {
      return 'Мы заметили плато, но комплаенс режима пока не стабилен. Перед корректировкой цифр давай сфокусируемся на 7 днях точного трекинга.';
    }
  }

  // 2. Стандартная логика
  const delta14 = weightDelta(profile.weightHistory, 14);

  if (Math.abs(delta14) < 0.1) {
    return 'Сегодня попробуй добавить 15–20 минут лёгкой прогулки после ужина для разгона метаболизма.';
  }

  if ((profile.goal === Goal.LOSS && delta14 < 0) || (profile.goal === Goal.GAIN && delta14 > 0)) {
    return 'Отличная динамика! Сфокусируйся на достаточном количестве белка в каждом приёме пищи сегодня.';
  }

  return 'Обрати внимание на размеры порций и попробуй есть осознанно и чуть медленнее сегодня.';
}

export async function createTask(profile: UserProfile, diary: FoodItem[], habits: UserHabit[]): Promise<UserProfile> {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = profile.tasks || [];
  
  if (tasks.find(t => t.date === today)) return profile;

  const taskText = await generateDailyTask(profile, diary, habits);

  const nextTasks = [...tasks, {
    date: today,
    text: taskText,
    completed: false,
  }];

  return { 
    ...profile, 
    tasks: nextTasks 
  };
}