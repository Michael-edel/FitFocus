import type { MutableRefObject } from 'react';
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
  weeklyReportGenerationRef: MutableRefObject<string | null>;
  setWeeklyReports: (reports: WeeklyStoredReport[]) => void;
  getLastAction?: () => AiAction | null;
  allowRetry?: (feature?: string, opts?: { force?: boolean }) => boolean;
  requestPersonalPlan?: typeof generatePersonalPlan;
  buildFallbackPlan?: typeof buildFallbackAiPlan;
  requestPlateauExplanation?: typeof generatePlateauExplanation;
  requestWeeklyInterpretation?: typeof getWeeklyIntelligenceInterpretation;
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
  setWeeklyReports,
  getLastAction = getLastAiAction,
  allowRetry = allowAiRetryNow,
  requestPersonalPlan = generatePersonalPlan,
  buildFallbackPlan = buildFallbackAiPlan,
  requestPlateauExplanation = generatePlateauExplanation,
  requestWeeklyInterpretation = getWeeklyIntelligenceInterpretation,
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
  if (!allowRetry(last.feature, opts)) return;

  if (last.type === 'coach') {
    await retryCoachAdvice();
    return;
  }

  if (last.type === 'plan') {
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

  try {
    weeklyReportGenerationRef.current = null;
    const weekKey = getWeekKeyImpl(new Date());
    const generateAI = async () => {
      weeklyReportGenerationRef.current = `${currentUser.id}_${weekKey}_${weekly.wis}`;
      recordLastAction({ feature: 'wis_text', type: 'wis', userId: currentUser.id });
      return requestWeeklyInterpretation(
        buildWeeklyIntelligenceRequest(currentUser, weekly, targets),
      );
    };
    await ensureWeeklyReport(currentUser.id, weekly, generateAI);
    setWeeklyReports(loadReports(currentUser.id));
  } catch (error) {
    logError(error);
  }
}
