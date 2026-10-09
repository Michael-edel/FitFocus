import { useCallback, useState } from 'react';
import {
  getCoachAdvice,
  setLastAiAction,
  type CoachAdviceResult,
} from '../../geminiService';
import { getTodayKey } from '../../habits';
import type { UserStateRepository } from '../../storage/userStateRepository';
import type { UserProfile } from '../../types';
import { buildCoachAdviceRequest, type NutritionSnapshot } from './coachAdvice';

type CoachAdviceRepository = Pick<UserStateRepository, 'writeJson'>;

export type CoachAdviceRunParams = {
  currentUser: UserProfile | null;
  targets: NutritionSnapshot;
  dailyStats: NutritionSnapshot;
  canUseCoachAdvice: () => boolean;
  openPaywall: () => void;
  incrementUsage: () => void;
  repository: CoachAdviceRepository | null;
  setCoachCard: (advice: CoachAdviceResult) => void;
  setLoading: (loading: boolean) => void;
  checkAchievements: () => unknown;
  requestAdvice?: typeof getCoachAdvice;
  recordLastAction?: typeof setLastAiAction;
  getTodayKeyImpl?: typeof getTodayKey;
  logError?: (error: unknown) => void;
};

/** Runs the coach-advice use case while keeping the UI independent from AI and storage details. */
export async function requestCoachAdvice({
  currentUser,
  targets,
  dailyStats,
  canUseCoachAdvice,
  openPaywall,
  incrementUsage,
  repository,
  setCoachCard,
  setLoading,
  checkAchievements,
  requestAdvice = getCoachAdvice,
  recordLastAction = setLastAiAction,
  getTodayKeyImpl = getTodayKey,
  logError = console.error,
}: CoachAdviceRunParams): Promise<CoachAdviceResult | null> {
  if (!currentUser) return null;
  if (!canUseCoachAdvice()) {
    openPaywall();
    return null;
  }

  recordLastAction({ feature: 'coach_advice', type: 'coach', userId: currentUser.id });
  setLoading(true);
  try {
    const advice = await requestAdvice(buildCoachAdviceRequest(
      currentUser,
      targets,
      dailyStats,
      currentUser.dailyHabits?.[getTodayKeyImpl()],
    ));
    setCoachCard(advice);
    incrementUsage();
    repository?.writeJson('last_coach_card', advice);
    void checkAchievements();
    return advice;
  } catch (error) {
    logError(error);
    return null;
  } finally {
    setLoading(false);
  }
}

type UseCoachAdviceParams = {
  currentUser: UserProfile | null;
  targets: NutritionSnapshot;
  dailyStats: NutritionSnapshot;
  canUseCoachAdvice: () => boolean;
  openPaywall: () => void;
  incrementUsage: () => void;
  repository: CoachAdviceRepository | null;
  checkAchievements: () => unknown;
};

export function useCoachAdvice({
  currentUser,
  targets,
  dailyStats,
  canUseCoachAdvice,
  openPaywall,
  incrementUsage,
  repository,
  checkAchievements,
}: UseCoachAdviceParams) {
  const [coachCard, setCoachCard] = useState<CoachAdviceResult | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const handleGetCoachAdvice = useCallback(() => requestCoachAdvice({
    currentUser,
    targets,
    dailyStats,
    canUseCoachAdvice,
    openPaywall,
    incrementUsage,
    repository,
    checkAchievements,
    setCoachCard,
    setLoading: setCoachLoading,
  }), [
    canUseCoachAdvice,
    checkAchievements,
    currentUser,
    dailyStats,
    incrementUsage,
    openPaywall,
    repository,
    targets,
  ]);

  return {
    coachCard,
    setCoachCard,
    coachLoading,
    handleGetCoachAdvice,
  };
}
