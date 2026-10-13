import { useCallback, useLayoutEffect, useMemo, type MutableRefObject } from 'react';
import {
  allowAiRetryNow,
  generatePlateauExplanation,
  getLastAiAction,
  setLastAiAction,
} from '../../geminiService';
import { assertAiSession, prepareAiSession } from '../../services/aiSession';
import { isSoftWeeklyAiError } from '../../services/frontendErrors';
import type { OutboxReadGuard } from '../../storage/durableOutbox';
import type { Goal } from '../../types';
import { AiActionScope } from './actionScope';

export type PlateauExplanationInput = {
  name: string;
  goal: Goal;
  compliancePct: number;
  weightDeltaN: number;
  expectedN: number;
  adaptationIndex: number;
  suggestion: unknown;
};

type AiAction = NonNullable<ReturnType<typeof getLastAiAction>>;
type RetryOptions = { force?: boolean };

function sameAiAction(left: AiAction | null, right: AiAction | null): boolean {
  if (left === null || right === null) return left === right;
  return left.feature === right.feature && left.type === right.type && left.userId === right.userId
    && left.actionId === right.actionId;
}

type PlateauExplanationRunParams = {
  currentUserId: string;
  loginGuard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  profileEditRevisionRef: MutableRefObject<number>;
  input: PlateauExplanationInput;
  setLoading: (loading: boolean) => void;
  setNote: (note: string) => void;
  expectedLastAction?: AiAction;
  retryOptions?: RetryOptions;
  requestExplanation?: typeof generatePlateauExplanation;
  prepareSession?: typeof prepareAiSession;
  getLastAction?: typeof getLastAiAction;
  recordLastAction?: typeof setLastAiAction;
  allowRetry?: typeof allowAiRetryNow;
  logError?: (error: unknown) => void;
};

export async function runPlateauExplanation({
  currentUserId,
  loginGuard,
  controller,
  isCurrentSession,
  profileEditRevisionRef,
  input,
  setLoading,
  setNote,
  expectedLastAction,
  retryOptions,
  requestExplanation = generatePlateauExplanation,
  prepareSession = prepareAiSession,
  getLastAction = getLastAiAction,
  recordLastAction = setLastAiAction,
  allowRetry = allowAiRetryNow,
  logError = console.error,
}: PlateauExplanationRunParams): Promise<string | null> {
  if (!isCurrentSession() || loginGuard.accountId !== currentUserId) return null;
  const actionBeforeProof = getLastAction();
  if (expectedLastAction && !sameAiAction(actionBeforeProof, expectedLastAction)) return null;
  let sourceProfileRevision = profileEditRevisionRef.current;
  const sourceIsCurrent = () => isCurrentSession() && sourceProfileRevision === profileEditRevisionRef.current;
  setLoading(true);
  try {
    const session = await prepareSession(currentUserId, controller, isCurrentSession, { previous: loginGuard });
    if (!sourceIsCurrent() || !sameAiAction(getLastAction(), actionBeforeProof)) return null;
    if (expectedLastAction && (!sameAiAction(getLastAction(), expectedLastAction)
      || !allowRetry(expectedLastAction.feature, retryOptions))) return null;

    const nextAction = { feature: 'plateau', type: 'plateau', userId: currentUserId, actionId: crypto.randomUUID() };
    recordLastAction(nextAction);
    const currentAction = getLastAction();
    if (!sameAiAction(currentAction, nextAction)) return null;
    const isCurrentAction = () => sourceIsCurrent() && sameAiAction(getLastAction(), currentAction);

    const note = await requestExplanation(input, session);
    if (!isCurrentAction()) return null;
    await assertAiSession(session);
    if (!isCurrentAction()) return null;
    setNote(note);
    return note;
  } catch (error) {
    if (isCurrentSession() && !isSoftWeeklyAiError(error)) logError(error);
    return null;
  } finally {
    if (isCurrentSession()) setLoading(false);
  }
}

export function usePlateauExplanation({
  currentUserId,
  loginGuard,
  isCurrentSession,
  profileEditRevisionRef,
  setLoading,
  setNote,
}: {
  currentUserId: string | null;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  profileEditRevisionRef: MutableRefObject<number>;
  setLoading: (loading: boolean) => void;
  setNote: (note: string) => void;
}) {
  const scope = useMemo(() => new AiActionScope(isCurrentSession), [currentUserId, isCurrentSession]);

  useLayoutEffect(() => {
    scope.activate();
    const hide = () => { scope.invalidate(); setLoading(false); };
    const show = (event: PageTransitionEvent) => { if (event.persisted) scope.activate(); };
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
  }, [scope, setLoading]);

  return useCallback((
    input: PlateauExplanationInput,
    expectedLastAction?: AiAction,
    retryOptions?: RetryOptions,
  ) => {
    if (!currentUserId || !loginGuard) return Promise.resolve(null);
    const attempt = scope.begin();
    if (!attempt) return Promise.resolve(null);
    return runPlateauExplanation({
      currentUserId,
      loginGuard,
      controller: attempt.controller,
      isCurrentSession: attempt.isCurrent,
      profileEditRevisionRef,
      input,
      setLoading: loading => { if (attempt.isCurrent()) setLoading(loading); },
      setNote: note => { if (attempt.isCurrent()) setNote(note); },
      expectedLastAction,
      retryOptions,
    }).finally(attempt.finish);
  }, [currentUserId, isCurrentSession, loginGuard, profileEditRevisionRef, scope, setLoading, setNote]);
}
