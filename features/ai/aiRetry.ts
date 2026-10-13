import {
  allowAiRetryNow,
  generatePersonalPlan,
  generatePlateauExplanation,
  getLastAiAction,
  getWeeklyIntelligenceInterpretation,
  setLastAiAction,
} from '../../geminiService';
import { buildFallbackAiPlan } from '../../aiPlanFallback';
import { getWeekKey } from '../../dateUtils';
import { ensureWeeklyReportWithAI, loadWeeklyReports, type WeeklyStoredReport } from '../../weeklyAutoEngine';
import type { UserProfile } from '../../types';
import type { WeeklyIntelligenceResult } from '../../weeklyIntelligence';
import type { OutboxReadGuard } from '../../storage/durableOutbox';
import { prepareAiSession } from '../../services/aiSession';
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
  persistUser: (user: UserProfile) => void;
  retryCoachAdvice: () => Promise<unknown>;
  setAdaptLoading: (loading: boolean) => void;
  setAdaptNote: (note: string) => void;
  weeklyReportGenerationRef: WeeklyReportGenerationRef;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  setWeeklyReports: (reports: WeeklyStoredReport[]) => void;
  getLastAction?: () => AiAction | null;
  allowRetry?: (feature?: string, opts?: { force?: boolean }) => boolean;
  requestPersonalPlan?: typeof generatePersonalPlan;
  buildFallbackPlan?: typeof buildFallbackAiPlan;
  requestPlateauExplanation?: typeof generatePlateauExplanation;
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
  setAdaptLoading,
  setAdaptNote,
  weeklyReportGenerationRef,
  loginGuard,
  isCurrentSession,
  setWeeklyReports,
  getLastAction = getLastAiAction,
  allowRetry = allowAiRetryNow,
  requestPersonalPlan = generatePersonalPlan,
  buildFallbackPlan = buildFallbackAiPlan,
  requestPlateauExplanation = generatePlateauExplanation,
  requestWeeklyInterpretation = getWeeklyIntelligenceInterpretation,
  prepareSession = prepareAiSession,
  recordLastAction = setLastAiAction,
  getWeekKeyImpl = getWeekKey,
  ensureWeeklyReport = ensureWeeklyReportWithAI,
  loadReports = loadWeeklyReports,
  logError = console.error,
}: AiRetryParams, opts?: { force?: boolean }): Promise<void> {
  let last: AiAction | null;
  try {
    last = getLastAction();
  } catch {
    return;
  }

  if (!last || !currentUser || last.userId !== currentUser.id) return;

  if (last.type === 'coach') {
    if (!allowRetry(last.feature, opts)) return;
    await retryCoachAdvice();
    return;
  }

  if (last.type === 'plan') {
    if (!allowRetry(last.feature, opts)) return;
    try {
      const aiPlan = await requestPersonalPlan(currentUser);
      persistUser({ ...currentUser, aiPlan });
    } catch (error) {
      logError(error);
      persistUser({ ...currentUser, aiPlan: buildFallbackPlan(currentUser) });
    }
    return;
  }

  if (last.type === 'plateau') {
    if (!allowRetry(last.feature, opts)) return;
    setAdaptLoading(true);
    try {
      const note = await requestPlateauExplanation({
        name: currentUser.name,
        goal: currentUser.goal,
        compliancePct,
        weightDeltaN,
        expectedN,
        adaptationIndex,
        suggestion: refeedSuggestion,
      });
      setAdaptNote(note);
    } catch (error) {
      logError(error);
    } finally {
      setAdaptLoading(false);
    }
    return;
  }

  if (last.type !== 'wis' || !weekly) return;

  if (!loginGuard || loginGuard.accountId !== currentUser.id) return;
  const controller = new AbortController();
  const current = () => !controller.signal.aborted && isCurrentSession();
  const hide = () => controller.abort();
  const target = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : undefined;
  target?.addEventListener('pagehide', hide, { once: true });
  let marker: WeeklyReportGenerationMarker | undefined;
  try {
    const session = await prepareSession(currentUser.id, controller, current, { previous: loginGuard });
    if (!current()) return;
    const latestAction = getLastAction();
    if (!latestAction || latestAction.feature !== last.feature || latestAction.type !== last.type
      || latestAction.userId !== last.userId || !allowRetry(last.feature, opts)) return;
    const weekKey = getWeekKeyImpl(new Date());
    const generationKey = `${currentUser.id}_${weekKey}_${weekly.wis}_${session.guard.sessionEpoch}_${session.guard.serverSessionId}_${session.guard.authFence}`;
    const generateAI = async () => {
      if (!current()) throw new Error('WEEKLY_REPORT_SESSION_CHANGED');
      marker = { generationKey, signal: controller.signal };
      weeklyReportGenerationRef.current = marker;
      recordLastAction({ feature: 'wis_text', type: 'wis', userId: currentUser.id });
      return requestWeeklyInterpretation(
        buildWeeklyIntelligenceRequest(currentUser, weekly, targets),
        session,
      );
    };
    await ensureWeeklyReport(currentUser.id, weekly, generateAI, {
      readGuard: { ...session.guard }, canCommit: current,
    });
    if (!current()) return;
    const reports = await loadReports(currentUser.id);
    if (!current()) return;
    setWeeklyReports(reports);
  } catch (error) {
    if (marker && weeklyReportGenerationRef.current === marker) weeklyReportGenerationRef.current = null;
    if (current()) logError(error);
  } finally {
    target?.removeEventListener('pagehide', hide);
  }
}
