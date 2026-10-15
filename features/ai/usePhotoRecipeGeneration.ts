import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { getRecipeFromPhoto } from '../../geminiService';
import { bumpRecipeUsage } from '../../usage';
import type { FoodInsight } from '../../types';
import { assertAiSession, prepareAiSession, type AiSession } from '../../services/aiSession';
import type { OutboxCommitGuard, OutboxReadGuard } from '../../storage/durableOutbox';
import { isSoftWeeklyAiError } from '../../services/frontendErrors';
import { AiActionScope } from './actionScope';

export type PhotoRecipeCommit = (
  insight: FoodInsight,
  guard: OutboxCommitGuard,
  isCurrent: () => boolean,
) => Promise<boolean>;

export type PhotoRecipeGenerationParams = {
  userId: string | null | undefined;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  controller: AbortController;
  photo: string;
  insight: FoodInsight;
  commitInsight: PhotoRecipeCommit;
  requestRecipe?: typeof getRecipeFromPhoto;
  prepareSession?: typeof prepareAiSession;
  assertSession?: typeof assertAiSession;
  incrementUsage?: typeof bumpRecipeUsage;
};

type PhotoRecipeHookParams = Pick<PhotoRecipeGenerationParams, 'userId' | 'loginGuard' | 'isCurrentSession'> & {
  sourceId: string;
};

export async function runPhotoRecipeGeneration({
  userId,
  loginGuard,
  isCurrentSession,
  controller,
  photo,
  insight,
  commitInsight,
  requestRecipe = getRecipeFromPhoto,
  prepareSession = prepareAiSession,
  assertSession = assertAiSession,
  incrementUsage = bumpRecipeUsage,
}: PhotoRecipeGenerationParams): Promise<boolean> {
  const isCurrent = () => !controller.signal.aborted && isCurrentSession();
  if (!userId || !loginGuard || loginGuard.accountId !== userId || !isCurrent()) return false;

  let session: AiSession | undefined;
  try {
    session = await prepareSession(userId, controller, isCurrent, { previous: loginGuard });
    if (!isCurrent()) return false;

    const recipe = await requestRecipe(photo, session);
    if (!isCurrent()) return false;
    await assertSession(session);
    if (!isCurrent()) return false;

    const guard: OutboxCommitGuard = { readGuard: session.guard, canCommit: isCurrent };
    const committed = await commitInsight({ ...insight, recipe }, guard, isCurrent);
    if (!committed || !isCurrent()) return false;
    await assertSession(session);
    if (!isCurrent()) return false;

    incrementUsage();
    return true;
  } catch (error) {
    if (!isCurrent()) return false;
    if (session) {
      try { await assertSession(session); } catch { return false; }
    }
    if (isSoftWeeklyAiError(error)) return false;
    throw error;
  }
}

export function usePhotoRecipeGeneration({
  userId,
  loginGuard,
  sourceId,
  isCurrentSession,
}: PhotoRecipeHookParams) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = useMemo(
    () => new AiActionScope(isCurrentSession),
    [isCurrentSession, sourceId, userId],
  );

  useLayoutEffect(() => {
    scope.activate();
    const hide = () => {
      scope.invalidate();
      setLoading(false);
    };
    const show = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      scope.activate();
      setLoading(false);
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      scope.invalidate();
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [scope]);

  const generateRecipe = useCallback(async (
    photo: string,
    insight: FoodInsight,
    commitInsight: PhotoRecipeCommit,
  ): Promise<boolean> => {
    if (!userId || !loginGuard) return false;
    const attempt = scope.begin();
    if (!attempt) return false;
    setError(null);
    setLoading(true);
    try {
      return await runPhotoRecipeGeneration({
        userId,
        loginGuard,
        isCurrentSession: attempt.isCurrent,
        controller: attempt.controller,
        photo,
        insight,
        commitInsight,
      });
    } catch {
      if (attempt.isCurrent()) setError('Не удалось получить рецепт');
      return false;
    } finally {
      if (attempt.isCurrent()) setLoading(false);
      attempt.finish();
    }
  }, [loginGuard, scope, sourceId, userId]);

  return { loading, error, setError, generateRecipe };
}
