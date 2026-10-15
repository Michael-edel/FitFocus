import {
  allowAiRetryNow,
  generatePersonalPlan,
  getLastAiAction,
  getWeeklyIntelligenceInterpretation,
  isRecoverableAiGenerationError,
  setLastAiAction,
} from '../../geminiService';
import { buildFallbackAiPlan } from '../../aiPlanFallback';
import { getWeekKey } from '../../dateUtils';
import { ensureWeeklyReportWithAI, loadWeeklyReports, type WeeklyStoredReport } from '../../weeklyAutoEngine';
import type { UserProfile } from '../../types';
import type { WeeklyIntelligenceResult } from '../../weeklyIntelligence';
import type { OutboxCommitGuard, OutboxOperation, OutboxReadGuard } from '../../storage/durableOutbox';
import { assertAiSession, prepareAiSession } from '../../services/aiSession';
import { isSoftWeeklyAiError } from '../../services/frontendErrors';
import type { PlateauExplanationInput } from './usePlateauExplanation';
import type { WeeklyReportGenerationMarker, WeeklyReportGenerationRef } from './useWeeklyAiReport';
import {
  buildWeeklyIntelligenceRequest,
  type MacroTargets,
} from './weeklyIntelligenceRequest';

type AiAction = NonNullable<ReturnType<typeof getLastAiAction>>;

export type AiRetryParams = {
  currentUser: UserProfile | null;
  weekly: WeeklyIntelligenceResult | null;
  targets: MacroTargets;
  compliancePct: number;
  weightDeltaN: number;
  expectedN: number;
  adaptationIndex: number;
  refeedSuggestion: unknown;
  persistUser: (action: UserProfile | ((previous: UserProfile) => UserProfile), guard?: OutboxCommitGuard) => Promise<OutboxOperation | null>;
  retryCoachAdvice: (expectedAction: AiAction, opts?: { force?: boolean }) => Promise<unknown>;
  retryPlateauExplanation: (input: PlateauExplanationInput, expectedAction: AiAction, opts?: { force?: boolean }) => Promise<unknown>;
  weeklyReportGenerationRef: WeeklyReportGenerationRef;
  controller: AbortController;
  profileEditRevisionRef: { current: number };
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  setWeeklyReports: (reports: WeeklyStoredReport[]) => void;
  getLastAction?: typeof getLastAiAction;
  allowRetry?: (feature?: string, opts?: { force?: boolean }) => boolean;
  requestPersonalPlan?: typeof generatePersonalPlan;
  buildFallbackPlan?: typeof buildFallbackAiPlan;
  requestWeeklyInterpretation?: typeof getWeeklyIntelligenceInterpretation;
  prepareSession?: typeof prepareAiSession;
  recordLastAction?: typeof setLastAiAction;
  getWeekKeyImpl?: typeof getWeekKey;
  ensureWeeklyReport?: typeof ensureWeeklyReportWithAI;
  loadReports?: typeof loadWeeklyReports;
  logError?: (error: unknown) => void;
};

/** Retries only the current user's most recent AI action and preserves each action's fallback. */
export async function retryLastAiAction({
  currentUser,
  weekly,
  targets,
  compliancePct,
  weightDeltaN,
  expectedN,
  adaptationIndex,
  refeedSuggestion,
  persistUser,
  retryCoachAdvice,
  retryPlateauExplanation,
  weeklyReportGenerationRef,
  loginGuard,
  controller,
  profileEditRevisionRef,
  isCurrentSession,
  setWeeklyReports,
  getLastAction = getLastAiAction,
  allowRetry = allowAiRetryNow,
  requestPersonalPlan = generatePersonalPlan,
  buildFallbackPlan = buildFallbackAiPlan,
  requestWeeklyInterpretation = getWeeklyIntelligenceInterpretation,
  prepareSession = prepareAiSession,
  recordLastAction = setLastAiAction,
  getWeekKeyImpl = getWeekKey,
  ensureWeeklyReport = ensureWeeklyReportWithAI,
  loadReports = loadWeeklyReports,
  logError = console.error,
}: AiRetryParams, opts?: { force?: boolean }): Promise<void> {
  const current = () => !controller.signal.aborted && isCurrentSession();
  let last: AiAction | null;
  try {
    last = getLastAction(currentUser?.id ?? null);
  } catch {
    return;
  }

  if (!last || !currentUser || last.userId !== currentUser.id || !current()) return;
  const stillLast = () => current() && sameAiAction(getLastAction(currentUser.id), last);

  if (last.type === 'coach') {
    if (!loginGuard || loginGuard.accountId !== currentUser.id || !allowRetry(last.feature, opts) || !stillLast()) return;
    await retryCoachAdvice(last, opts);
    return;
  }

  if (last.type === 'plan') {
    if (!loginGuard || loginGuard.accountId !== currentUser.id || !allowRetry(last.feature, opts)) return;
    const sourceProfileRevision = profileEditRevisionRef.current;
    try {
      const session = await prepareSession(currentUser.id, controller, current, { previous: loginGuard });
      if (!stillLast() || sourceProfileRevision !== profileEditRevisionRef.current || !allowRetry(last.feature, opts)) return;
      const retryAction = { ...last, actionId: crypto.randomUUID() };
      recordLastAction(retryAction);
      const isCurrentAttempt = () => current() && sameAiAction(getLastAction(currentUser.id), retryAction)
        && sourceProfileRevision === profileEditRevisionRef.current;
      if (!isCurrentAttempt()) return;
      let aiPlan;
      try {
        aiPlan = await requestPersonalPlan(currentUser, session);
      } catch (error) {
        if (!isCurrentAttempt()) return;
        try {
          await assertAiSession(session);
        } catch {
          return;
        }
        if (!isCurrentAttempt()) return;
        if (!isRecoverableAiGenerationError(error)) {
          if (!isSoftWeeklyAiError(error)) logError(error);
          return;
        }
        logError(error);
        aiPlan = buildFallbackPlan(currentUser);
      }
      if (!isCurrentAttempt()) return;
      const operation = await persistUser(previous => ({ ...previous, aiPlan }), {
        readGuard: { ...session.guard }, canCommit: isCurrentAttempt,
      });
      if (operation?.status !== 'pending' && isCurrentAttempt()) logError(new Error('AI_RETRY_PLAN_COMMIT_FAILED'));
    } catch (error) {
      if (current() && !isSoftWeeklyAiError(error)) logError(error);
    }
    return;
  }

  if (last.type === 'plateau') {
    if (!loginGuard || loginGuard.accountId !== currentUser.id || !allowRetry(last.feature, opts) || !stillLast()) return;
    await retryPlateauExplanation({
      name: currentUser.name,
      goal: currentUser.goal,
      compliancePct,
      weightDeltaN,
      expectedN,
      adaptationIndex,
      suggestion: refeedSuggestion,
    }, last, opts);
    return;
  }

  if (last.type !== 'wis' || !weekly) return;

  if (!loginGuard || loginGuard.accountId !== currentUser.id) return;
  let marker: WeeklyReportGenerationMarker | undefined;
  let retryAction: AiAction | undefined;
  try {
    const session = await prepareSession(currentUser.id, controller, current, { previous: loginGuard });
    if (!current()) return;
    const latestAction = getLastAction(currentUser.id);
    if (!sameAiAction(latestAction, last) || !allowRetry(last.feature, opts)) return;
    const isCurrentRetry = () => current() && sameAiAction(getLastAction(currentUser.id), retryAction ?? last);
    const weekKey = getWeekKeyImpl(new Date());
    const generationKey = `${currentUser.id}_${weekKey}_${weekly.wis}_${session.guard.sessionEpoch}_${session.guard.serverSessionId}_${session.guard.authFence}`;
    const generateAI = async () => {
      if (!isCurrentRetry()) throw new Error('WEEKLY_REPORT_SESSION_CHANGED');
      marker = { generationKey, signal: controller.signal };
      weeklyReportGenerationRef.current = marker;
      retryAction = { feature: 'wis_text', type: 'wis', userId: currentUser.id, actionId: crypto.randomUUID() };
      recordLastAction(retryAction);
      if (!isCurrentRetry()) throw new Error('WEEKLY_REPORT_ACTION_CHANGED');
      const text = await requestWeeklyInterpretation(
        buildWeeklyIntelligenceRequest(currentUser, weekly, targets),
        session,
      );
      if (!isCurrentRetry()) throw new Error('WEEKLY_REPORT_ACTION_CHANGED');
      return text;
    };
    await ensureWeeklyReport(currentUser.id, weekly, generateAI, {
      readGuard: { ...session.guard },
      canCommit: isCurrentRetry,
    });
    if (!isCurrentRetry()) return;
    const reports = await loadReports(currentUser.id);
    if (!current()) return;
    setWeeklyReports(reports);
  } catch (error) {
    if (marker && weeklyReportGenerationRef.current === marker) weeklyReportGenerationRef.current = null;
    if (current() && !isSoftWeeklyAiError(error)) logError(error);
  }
}

function sameAiAction(left: AiAction | null, right: AiAction | null): boolean {
  if (left === null || right === null) return left === right;
  return left.feature === right.feature && left.type === right.type && left.userId === right.userId
    && left.actionId === right.actionId;
}
