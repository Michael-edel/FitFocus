import { Goal, type FoodItem, type UserProfile } from '../../types';

export function calculateNextWeekWeightForecast(
  user: Pick<UserProfile, 'goal' | 'lossDeficit' | 'gainSurplus'> | null | undefined,
  hasWeeklyReport: boolean,
  defaults: { lossDeficit: number; gainSurplus: number },
): number {
  if (!user || !hasWeeklyReport) return 0;
  if (user.goal === Goal.LOSS) return (-(Number(user.lossDeficit ?? defaults.lossDeficit)) * 7) / 7700;
  if (user.goal === Goal.GAIN) return ((Number(user.gainSurplus ?? defaults.gainSurplus)) * 7) / 7700;
  return 0;
}

export function findFoodSearchResults(
  query: string,
  foodHistory: FoodItem[],
  foodFavorites: FoodItem[],
  limit = 5,
): FoodItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  const uniqueByName = Array.from(
    new Map([...foodHistory, ...foodFavorites].map((item) => [item.name, item])).values(),
  );
  return uniqueByName.filter((item) => item.name.toLowerCase().includes(normalizedQuery)).slice(0, limit);
}
