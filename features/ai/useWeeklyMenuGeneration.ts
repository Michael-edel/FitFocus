import { useCallback, useLayoutEffect, useMemo, useState, type MutableRefObject } from 'react';
import { generateWeeklyMenu } from '../../geminiService';
import type { UserProfile, WeeklyMenu } from '../../types';
import { prepareAiSession } from '../../services/aiSession';
import type { useProfilePersistence } from '../profile/useProfilePersistence';
import { AiActionScope } from './actionScope';

export const WEEKLY_MENU_GENERATION_ERROR = 'Не удалось сгенерировать меню на неделю.';
export const WEEKLY_MENU_SAVE_ERROR = 'Меню не сохранено. Проверьте сообщение о хранилище и повторите попытку.';
export const WEEKLY_MENU_PROFILE_CHANGED = 'Профиль изменился. Сгенерируйте меню ещё раз.';

export type WeeklyMenuGenerationParams = {
  currentUser: UserProfile | null;
  persistUser: ReturnType<typeof useProfilePersistence>;
  isCurrentSession: () => boolean;
  canCommitProfile: () => boolean;
  controller: AbortController;
  checkAchievements: (trigger: string, context: { hasWeeklyMenu: boolean }) => unknown;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  requestMenu?: typeof generateWeeklyMenu;
  prepareSession?: typeof prepareAiSession;
};

/** Generates and persists a personal weekly menu as one recoverable UI action. */
export async function generatePersonalWeeklyMenu({
  currentUser,
  persistUser,
  isCurrentSession,
  canCommitProfile,
  controller,
  checkAchievements,
  setLoading,
  setError,
  requestMenu = generateWeeklyMenu,
  prepareSession = prepareAiSession,
}: WeeklyMenuGenerationParams): Promise<WeeklyMenu | null> {
  const current = () => !controller.signal.aborted && isCurrentSession();
  if (!currentUser?.aiPlan || !current()) return null;

  setError(null);
  setLoading(true);
  let saving = false;
  try {
    const session = await prepareSession(currentUser.id, controller, current, { requireMenuProjection: true });
    if (!current()) return null;
    if (!canCommitProfile()) throw new Error(WEEKLY_MENU_PROFILE_CHANGED);
    const weeklyMenu = await requestMenu(currentUser, currentUser.aiPlan, session);
    if (!current()) return null;
    if (!canCommitProfile()) throw new Error(WEEKLY_MENU_PROFILE_CHANGED);
    saving = true;
    const operation = await persistUser(previous => {
      if (!previous.aiPlan) throw new Error(WEEKLY_MENU_PROFILE_CHANGED);
      return { ...previous, aiPlan: { ...previous.aiPlan, weeklyMenu } };
    }, { readGuard: session.guard, canCommit: () => current() && canCommitProfile() });
    if (!current()) return null;
    if (!operation || operation.status !== 'pending') { setError(WEEKLY_MENU_SAVE_ERROR); return null; }
    void checkAchievements('weekly_menu_generated', { hasWeeklyMenu: true });
    if (!current()) return null;
    return weeklyMenu;
  } catch {
    if (current()) setError(!canCommitProfile() ? WEEKLY_MENU_PROFILE_CHANGED : saving ? WEEKLY_MENU_SAVE_ERROR : WEEKLY_MENU_GENERATION_ERROR);
    return null;
  } finally {
    if (current()) setLoading(false);
  }
}

type UseWeeklyMenuGenerationParams = Pick<
  WeeklyMenuGenerationParams,
  'currentUser' | 'persistUser' | 'checkAchievements' | 'isCurrentSession'
> & { profileEditRevisionRef: MutableRefObject<number> };

export function useWeeklyMenuGeneration({
  currentUser,
  persistUser,
  checkAchievements,
  isCurrentSession,
  profileEditRevisionRef,
}: UseWeeklyMenuGenerationParams) {
  const scope = useMemo(() => new AiActionScope(isCurrentSession), [currentUser?.id, isCurrentSession]);
  const [status, setStatus] = useState({ scope, loading: false, error: null as string | null });
  useLayoutEffect(() => {
    scope.activate();
    const hide = () => scope.invalidate();
    const show = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      scope.activate(); setStatus({ scope, loading: false, error: null });
    };
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => { scope.invalidate(); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); };
  }, [scope]);

  const handleGenerateWeeklyMenu = useCallback(() => {
    const attempt = scope.begin();
    if (!attempt) return Promise.resolve(null);
    const revision = profileEditRevisionRef.current;
    return generatePersonalWeeklyMenu({
      currentUser, persistUser, checkAchievements, controller: attempt.controller,
      isCurrentSession: attempt.isCurrent, canCommitProfile: () => revision === profileEditRevisionRef.current,
      setLoading: loading => setStatus(previous => ({ scope, loading, error: previous.scope === scope ? previous.error : null })),
      setError: error => setStatus(previous => ({ scope, error, loading: previous.scope === scope && previous.loading })),
    }).finally(attempt.finish);
  }, [checkAchievements, currentUser, persistUser, profileEditRevisionRef, scope]);

  return {
    weeklyMenuLoading: status.scope === scope && status.loading,
    weeklyMenuError: status.scope === scope ? status.error : null,
    handleGenerateWeeklyMenu,
  };
}
