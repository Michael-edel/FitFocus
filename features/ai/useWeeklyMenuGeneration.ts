import { useCallback, useState } from 'react';
import { generateWeeklyMenu } from '../../geminiService';
import type { UserProfile, WeeklyMenu } from '../../types';

export const WEEKLY_MENU_GENERATION_ERROR = 'Не удалось сгенерировать меню на неделю.';

export type WeeklyMenuGenerationParams = {
  currentUser: UserProfile | null;
  persistUser: (user: UserProfile) => void;
  checkAchievements: (trigger: string, context: { hasWeeklyMenu: boolean }) => unknown;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  requestMenu?: typeof generateWeeklyMenu;
};

/** Generates and persists a personal weekly menu as one recoverable UI action. */
export async function generatePersonalWeeklyMenu({
  currentUser,
  persistUser,
  checkAchievements,
  setLoading,
  setError,
  requestMenu = generateWeeklyMenu,
}: WeeklyMenuGenerationParams): Promise<WeeklyMenu | null> {
  if (!currentUser?.aiPlan) return null;

  setError(null);
  setLoading(true);
  try {
    const weeklyMenu = await requestMenu(currentUser, currentUser.aiPlan);
    persistUser({ ...currentUser, aiPlan: { ...currentUser.aiPlan, weeklyMenu } });
    void checkAchievements('weekly_menu_generated', { hasWeeklyMenu: true });
    return weeklyMenu;
  } catch {
    setError(WEEKLY_MENU_GENERATION_ERROR);
    return null;
  } finally {
    setLoading(false);
  }
}

type UseWeeklyMenuGenerationParams = Pick<
  WeeklyMenuGenerationParams,
  'currentUser' | 'persistUser' | 'checkAchievements'
>;

export function useWeeklyMenuGeneration({
  currentUser,
  persistUser,
  checkAchievements,
}: UseWeeklyMenuGenerationParams) {
  const [weeklyMenuLoading, setWeeklyMenuLoading] = useState(false);
  const [weeklyMenuError, setWeeklyMenuError] = useState<string | null>(null);

  const handleGenerateWeeklyMenu = useCallback(() => generatePersonalWeeklyMenu({
    currentUser,
    persistUser,
    checkAchievements,
    setLoading: setWeeklyMenuLoading,
    setError: setWeeklyMenuError,
  }), [checkAchievements, currentUser, persistUser]);

  return {
    weeklyMenuLoading,
    weeklyMenuError,
    handleGenerateWeeklyMenu,
  };
}
