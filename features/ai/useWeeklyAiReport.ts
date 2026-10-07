import { useEffect, useRef, type MutableRefObject } from 'react';
import { getWeeklyIntelligenceInterpretation, setLastAiAction } from '../../geminiService';
import { getWeekKey } from '../../dateUtils';
import { isSoftWeeklyAiError } from '../../services/frontendErrors';
import { ensureWeeklyReportWithAI, loadWeeklyReports, type WeeklyStoredReport } from '../../weeklyAutoEngine';
import type { UserProfile } from '../../types';
import type { WeeklyIntelligenceResult } from '../../weeklyIntelligence';
import { buildWeeklyIntelligenceRequest, type MacroTargets } from './weeklyIntelligenceRequest';

export type WeeklyAiReportParams = {
  currentUser: UserProfile;
  weekly: WeeklyIntelligenceResult;
  targets: MacroTargets;
  weeklyReportGenerationRef: MutableRefObject<string | null>;
  setWeeklyReports: (reports: WeeklyStoredReport[]) => void;
  requestInterpretation?: typeof getWeeklyIntelligenceInterpretation;
  recordLastAction?: typeof setLastAiAction;
  getWeekKeyImpl?: typeof getWeekKey;
  ensureWeeklyReport?: typeof ensureWeeklyReportWithAI;
  loadReports?: typeof loadWeeklyReports;
  isSoftError?: (error: unknown) => boolean;
  logError?: (error: unknown) => void;
};

/** Refreshes the weekly report once for a score and avoids duplicate background requests. */
export async function refreshWeeklyAiReport({
  currentUser,
  weekly,
  targets,
  weeklyReportGenerationRef,
  setWeeklyReports,
  requestInterpretation = getWeeklyIntelligenceInterpretation,
  recordLastAction = setLastAiAction,
  getWeekKeyImpl = getWeekKey,
  ensureWeeklyReport = ensureWeeklyReportWithAI,
  loadReports = loadWeeklyReports,
  isSoftError = isSoftWeeklyAiError,
  logError = (error) => console.error('Weekly AI reporting failed', { code: 'WEEKLY_AI_REPORT_FAILED', error }),
}: WeeklyAiReportParams): Promise<void> {
  const weekKey = getWeekKeyImpl(new Date());
  const generationKey = `${currentUser.id}_${weekKey}_${weekly.wis}`;
  if (weeklyReportGenerationRef.current === generationKey) return;

  try {
    await ensureWeeklyReport(currentUser.id, weekly, async () => {
      weeklyReportGenerationRef.current = generationKey;
      recordLastAction({ feature: 'wis_text', type: 'wis', userId: currentUser.id });
      return requestInterpretation(
        buildWeeklyIntelligenceRequest(currentUser, weekly, targets),
      );
    });
    setWeeklyReports(loadReports(currentUser.id));
  } catch (error) {
    if (!isSoftError(error)) logError(error);
    weeklyReportGenerationRef.current = null;
  }
}

type UseWeeklyAiReportParams = Omit<WeeklyAiReportParams, 'weeklyReportGenerationRef'> & {
  currentUser: UserProfile | null;
  weekly: WeeklyIntelligenceResult | null;
};

export function useWeeklyAiReport({
  currentUser,
  weekly,
  targets,
  setWeeklyReports,
}: UseWeeklyAiReportParams) {
  const weeklyReportGenerationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser || !weekly) return;
    void refreshWeeklyAiReport({
      currentUser,
      weekly,
      targets,
      weeklyReportGenerationRef,
      setWeeklyReports,
    });
  }, [currentUser?.id, weekly?.wis]);

  return weeklyReportGenerationRef;
}
