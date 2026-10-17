import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { getWeeklyIntelligenceInterpretation, setLastAiAction } from '../../geminiService';
import { getWeekKey } from '../../dateUtils';
import { isSoftWeeklyAiError } from '../../services/frontendErrors';
import { prepareAiSession } from '../../services/aiSession';
import type { OutboxReadGuard } from '../../storage/durableOutbox';
import { ensureWeeklyReportWithAI, loadWeeklyReports, type WeeklyStoredReport } from '../../weeklyAutoEngine';
import type { UserProfile } from '../../types';
import type { WeeklyIntelligenceResult } from '../../weeklyIntelligence';
import { AiActionScope } from './actionScope';
import { buildWeeklyIntelligenceRequest, type MacroTargets } from './weeklyIntelligenceRequest';

export type WeeklyReportGenerationMarker = { generationKey: string; signal: AbortSignal };
export type WeeklyReportGenerationRef = MutableRefObject<WeeklyReportGenerationMarker | null>;

export type WeeklyAiReportParams = {
  currentUser: UserProfile;
  weekly: WeeklyIntelligenceResult;
  targets: MacroTargets;
  weeklyReportGenerationRef: WeeklyReportGenerationRef;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  controller: AbortController;
  setWeeklyReports: (reports: WeeklyStoredReport[]) => void;
  requestInterpretation?: typeof getWeeklyIntelligenceInterpretation;
  prepareSession?: typeof prepareAiSession;
  recordLastAction?: typeof setLastAiAction;
  getWeekKeyImpl?: typeof getWeekKey;
  ensureWeeklyReport?: typeof ensureWeeklyReportWithAI;
  loadReports?: typeof loadWeeklyReports;
  isSoftError?: (error: unknown) => boolean;
  logError?: (error: unknown) => void;
};

/** Generates one report with a fresh session proof and commits only while that login is current. */
export async function refreshWeeklyAiReport({
  currentUser,
  weekly,
  targets,
  weeklyReportGenerationRef,
  loginGuard,
  isCurrentSession,
  controller,
  setWeeklyReports,
  requestInterpretation = getWeeklyIntelligenceInterpretation,
  prepareSession = prepareAiSession,
  recordLastAction = setLastAiAction,
  getWeekKeyImpl = getWeekKey,
  ensureWeeklyReport = ensureWeeklyReportWithAI,
  loadReports = loadWeeklyReports,
  isSoftError = isSoftWeeklyAiError,
  logError = (error) => console.error('Weekly AI reporting failed', { code: 'WEEKLY_AI_REPORT_FAILED', error }),
}: WeeklyAiReportParams): Promise<void> {
  if (!loginGuard || loginGuard.accountId !== currentUser.id) return;
  const weekKey = getWeekKeyImpl(new Date());
  const generationKey = `${currentUser.id}_${weekKey}_${weekly.wis}_${loginGuard.sessionEpoch}_${loginGuard.serverSessionId}_${loginGuard.authFence}`;
  if (weeklyReportGenerationRef.current?.generationKey === generationKey
    && !weeklyReportGenerationRef.current.signal.aborted) return;
  const isCurrent = () => !controller.signal.aborted && isCurrentSession();
  if (!isCurrent()) return;
  const marker: WeeklyReportGenerationMarker = { generationKey, signal: controller.signal };
  weeklyReportGenerationRef.current = marker;
  const ownsAttempt = () => isCurrent() && weeklyReportGenerationRef.current === marker;

  try {
    const session = await prepareSession(currentUser.id, controller, ownsAttempt, { previous: loginGuard });
    if (!ownsAttempt()) return;
    await ensureWeeklyReport(currentUser.id, weekly, async () => {
      if (!ownsAttempt()) throw new Error('WEEKLY_REPORT_SESSION_CHANGED');
      recordLastAction({ feature: 'wis_text', type: 'wis', userId: currentUser.id });
      const text = await requestInterpretation(
        buildWeeklyIntelligenceRequest(currentUser, weekly, targets),
        session,
      );
      if (!ownsAttempt()) throw new Error('WEEKLY_REPORT_SESSION_CHANGED');
      return text;
    }, { readGuard: { ...session.guard }, canCommit: ownsAttempt });
    if (!ownsAttempt()) return;
    const reports = await loadReports(currentUser.id);
    if (!ownsAttempt()) return;
    setWeeklyReports(reports);
  } catch (error) {
    const currentAttempt = ownsAttempt();
    if (weeklyReportGenerationRef.current === marker) weeklyReportGenerationRef.current = null;
    if (currentAttempt && !isSoftError(error)) logError(error);
  }
}

type UseWeeklyAiReportParams = Omit<WeeklyAiReportParams,
  'weeklyReportGenerationRef' | 'controller' | 'currentUser' | 'weekly'> & {
  currentUser: UserProfile | null;
  weekly: WeeklyIntelligenceResult | null;
};

export function useWeeklyAiReport({
  currentUser,
  weekly,
  targets,
  setWeeklyReports,
  loginGuard,
  isCurrentSession,
}: UseWeeklyAiReportParams) {
  const weeklyReportGenerationRef = useRef<WeeklyReportGenerationMarker | null>(null);
  const scope = useMemo(() => new AiActionScope(isCurrentSession), [currentUser?.id, isCurrentSession]);
  const [resumeEpoch, setResumeEpoch] = useState(0);

  useLayoutEffect(() => {
    scope.activate();
    const hide = () => {
      scope.invalidate();
      weeklyReportGenerationRef.current = null;
    };
    const show = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      scope.activate();
      weeklyReportGenerationRef.current = null;
      setResumeEpoch((value) => value + 1);
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      scope.invalidate();
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [scope]);

  useEffect(() => {
    if (!currentUser || !weekly || !loginGuard) return;
    const attempt = scope.begin();
    if (!attempt) return;
    void refreshWeeklyAiReport({
      currentUser,
      weekly,
      targets,
      weeklyReportGenerationRef,
      loginGuard,
      isCurrentSession: attempt.isCurrent,
      controller: attempt.controller,
      setWeeklyReports,
    }).finally(attempt.finish);
  }, [currentUser, weekly?.wis, targets, loginGuard, isCurrentSession, scope, resumeEpoch, setWeeklyReports]);

  return weeklyReportGenerationRef;
}
