import { useCallback, useLayoutEffect, useMemo, useState, type MutableRefObject } from 'react';
import {
  allowAiRetryNow,
  getCoachAdvice,
  getLastAiAction,
  setLastAiAction,
  type CoachAdviceResult,
} from '../../geminiService';
import { getTodayKey } from '../../habits';
import type { OutboxCommitGuard, OutboxOperation, OutboxReadGuard } from '../../storage/durableOutbox';
import type { UserStateRepository } from '../../storage/userStateRepository';
import type { UserProfile } from '../../types';
import { assertAiSession, prepareAiSession, type AiSession } from '../../services/aiSession';
import { isSoftWeeklyAiError } from '../../services/frontendErrors';
import { buildCoachAdviceRequest, type NutritionSnapshot } from './coachAdvice';
import { AiActionScope } from './actionScope';

type CoachAdviceRepository = Pick<UserStateRepository, 'writeJson'>;
type AiAction = NonNullable<ReturnType<typeof getLastAiAction>>;

function sameAiAction(left: AiAction | null, right: AiAction | null): boolean {
  if (left === null || right === null) return left === right;
  return left.feature === right.feature && left.type === right.type && left.userId === right.userId
    && left.actionId === right.actionId;
}

export type CoachAdviceRunParams = {
  currentUser: UserProfile | null;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  controller: AbortController;
  profileEditRevisionRef: MutableRefObject<number>;
  targets: NutritionSnapshot;
  dailyStats: NutritionSnapshot;
  canUseCoachAdvice: () => boolean;
  openPaywall: () => void;
  incrementUsage: (guard: OutboxCommitGuard) => Promise<OutboxOperation | null>;
  repository: CoachAdviceRepository | null;
  setCoachCard: (advice: CoachAdviceResult) => void;
  setLoading: (loading: boolean) => void;
  checkAchievements: () => unknown;
  requestAdvice?: typeof getCoachAdvice;
  prepareSession?: typeof prepareAiSession;
  getLastAction?: typeof getLastAiAction;
  allowRetry?: typeof allowAiRetryNow;
  expectedLastAction?: AiAction;
  retryOptions?: { force?: boolean };
  recordLastAction?: typeof setLastAiAction;
  getTodayKeyImpl?: typeof getTodayKey;
  logError?: (error: unknown) => void;
};

/** Runs the coach-advice use case while keeping the UI independent from AI and storage details. */
export async function requestCoachAdvice({
  currentUser,
  loginGuard,
  isCurrentSession,
  controller,
  profileEditRevisionRef,
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
  prepareSession = prepareAiSession,
  getLastAction = getLastAiAction,
  allowRetry = allowAiRetryNow,
  expectedLastAction,
  retryOptions,
  recordLastAction = setLastAiAction,
  getTodayKeyImpl = getTodayKey,
  logError = console.error,
}: CoachAdviceRunParams): Promise<CoachAdviceResult | null> {
  if (!currentUser || !repository || !loginGuard || loginGuard.accountId !== currentUser.id || !isCurrentSession()) return null;
  const actionBeforeProof = getLastAction();
  if (expectedLastAction && !sameAiAction(actionBeforeProof, expectedLastAction)) return null;
  if (!canUseCoachAdvice()) {
    openPaywall();
    return null;
  }
  setLoading(true);
  let sourceProfileRevision = profileEditRevisionRef.current;
  const sourceIsCurrent = () => isCurrentSession() && sourceProfileRevision === profileEditRevisionRef.current;
  const requestedAction = { feature: 'coach_advice', type: 'coach', userId: currentUser.id, actionId: crypto.randomUUID() };
  try {
    const session = await prepareSession(currentUser.id, controller, isCurrentSession, { previous: loginGuard });
    if (!sourceIsCurrent() || !sameAiAction(getLastAction(), actionBeforeProof)) return null;
    if (expectedLastAction && (!sameAiAction(getLastAction(), expectedLastAction) || !allowRetry(expectedLastAction.feature, retryOptions))) return null;
    recordLastAction(requestedAction);
    const currentAction = getLastAction();
    if (!sameAiAction(currentAction, requestedAction)) return null;
    const isCurrentAction = () => sourceIsCurrent() && sameAiAction(getLastAction(), currentAction);
    const advice = await requestAdvice(buildCoachAdviceRequest(
      currentUser,
      targets,
      dailyStats,
      currentUser.dailyHabits?.[getTodayKeyImpl()],
    ), session);
    if (!isCurrentAction()) return null;
    const cardOperation = await repository.writeJson('last_coach_card', advice, {
      readGuard: { ...session.guard }, canCommit: isCurrentAction,
    });
    if (!isCurrentAction() || cardOperation?.status !== 'pending') throw new Error('COACH_ADVICE_SAVE_FAILED');
    const profileRevisionBeforeUsage = profileEditRevisionRef.current;
    const usageOperation = await incrementUsage({
      readGuard: { ...session.guard }, canCommit: isCurrentAction,
    });
    if (!sameAiAction(getLastAction(), currentAction) || controller.signal.aborted) return null;
    if (usageOperation?.status === 'pending') {
      const committedRevision = profileEditRevisionRef.current;
      if (committedRevision !== profileRevisionBeforeUsage + 1) return null;
      sourceProfileRevision = committedRevision;
    }
    await assertAiSession(session);
    if (usageOperation?.status !== 'pending') throw new Error('COACH_ADVICE_USAGE_SAVE_FAILED');
    setCoachCard(advice);
    void checkAchievements();
    return advice;
  } catch (error) {
    if (isCurrentSession() && !isSoftWeeklyAiError(error)) logError(error);
    return null;
  } finally {
    if (isCurrentSession()) setLoading(false);
  }
}

type UseCoachAdviceParams = {
  currentUser: UserProfile | null;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  profileEditRevisionRef: MutableRefObject<number>;
  targets: NutritionSnapshot;
  dailyStats: NutritionSnapshot;
  canUseCoachAdvice: () => boolean;
  openPaywall: () => void;
  incrementUsage: (guard: OutboxCommitGuard) => Promise<OutboxOperation | null>;
  repository: CoachAdviceRepository | null;
  checkAchievements: () => unknown;
};

export function useCoachAdvice({
  currentUser,
  loginGuard,
  isCurrentSession,
  profileEditRevisionRef,
  targets,
  dailyStats,
  canUseCoachAdvice,
  openPaywall,
  incrementUsage,
  repository,
  checkAchievements,
}: UseCoachAdviceParams) {
  const [coachCard, setCoachCard] = useState<CoachAdviceResult | null>(null);
  const scope = useMemo(() => new AiActionScope(isCurrentSession), [currentUser?.id, isCurrentSession]);
  const [loadingState, setLoadingState] = useState({ scope, loading: false });

  useLayoutEffect(() => {
    scope.activate();
    const hide = () => { scope.invalidate(); setLoadingState({ scope, loading: false }); };
    const show = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      scope.activate(); setLoadingState({ scope, loading: false });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', hide);
      window.addEventListener('pageshow', show);
    }
    return () => {
      scope.invalidate();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', hide);
        window.removeEventListener('pageshow', show);
      }
    };
  }, [scope]);

  const handleGetCoachAdvice = useCallback((expectedLastAction?: AiAction, retryOptions?: { force?: boolean }) => {
    if (!loginGuard || !currentUser) return Promise.resolve(null);
    const attempt = scope.begin();
    if (!attempt) return Promise.resolve(null);
    return requestCoachAdvice({
      currentUser,
      loginGuard,
      isCurrentSession: attempt.isCurrent,
      controller: attempt.controller,
      profileEditRevisionRef,
      targets,
      dailyStats,
      canUseCoachAdvice,
      openPaywall,
      incrementUsage,
      repository,
      checkAchievements,
      setCoachCard,
      setLoading: loading => { if (attempt.isCurrent()) setLoadingState({ scope, loading }); },
      expectedLastAction,
      retryOptions,
    }).finally(attempt.finish);
  }, [
    canUseCoachAdvice,
    checkAchievements,
    currentUser,
    dailyStats,
    incrementUsage,
    isCurrentSession,
    loginGuard,
    openPaywall,
    profileEditRevisionRef,
    repository,
    scope,
    targets,
  ]);

  return {
    coachCard,
    setCoachCard,
    coachLoading: loadingState.scope === scope && loadingState.loading,
    handleGetCoachAdvice,
  };
}
