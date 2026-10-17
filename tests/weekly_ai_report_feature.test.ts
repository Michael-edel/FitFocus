import { describe, expect, it, vi } from 'vitest';
import { Goal, type UserProfile } from '../types';
import { refreshWeeklyAiReport } from '../features/ai/useWeeklyAiReport';
import type { AiSession } from '../services/aiSession';
import type { OutboxReadGuard } from '../storage/durableOutbox';

const user = { id: 'user-1', name: 'Анна', goal: Goal.LOSS } as UserProfile;
const weekly = {
  wis: 72,
  status: 'stable' as const,
  weightDelta7: -0.4,
  weightDelta30: -1.6,
  compliance: 84,
  adaptationIndex: 24,
};
const loginGuard: OutboxReadGuard = {
  accountId: user.id, sessionEpoch: 'epoch-1', serverSessionId: 'a'.repeat(64), authFence: 0,
};

function params(overrides: Partial<Parameters<typeof refreshWeeklyAiReport>[0]> = {}) {
  const controller = new AbortController();
  const session = { guard: loginGuard, controller, isCurrentSession: () => true,
    outbox: { isReadSessionCurrent: vi.fn(async () => true) } } as unknown as AiSession;
  const input = {
    currentUser: user,
    weekly,
    targets: { calories: 1800, protein: 120, fat: 60, carbs: 190 },
    weeklyReportGenerationRef: { current: null },
    loginGuard,
    isCurrentSession: () => true,
    controller,
    setWeeklyReports: vi.fn(),
    getWeekKeyImpl: () => '2026-41',
    recordLastAction: vi.fn(),
    requestInterpretation: vi.fn().mockResolvedValue('Стабильная неделя'),
    prepareSession: vi.fn().mockResolvedValue(session),
    ensureWeeklyReport: async (_userId, _weekly, generateAI) => {
      await generateAI();
      return { report: { weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }, isNew: true };
    },
    loadReports: vi.fn().mockResolvedValue([]),
    isSoftError: vi.fn().mockReturnValue(false),
    logError: vi.fn(),
    ...overrides,
  };
  return Object.assign(input, { session });
}

describe('weekly AI report feature', () => {
  it('requests the shared weekly context and refreshes the saved reports', async () => {
    const reports = [{ weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }];
    const ensureWeeklyReport = vi.fn(async (_userId: string, _weekly: typeof weekly, generateAI: () => Promise<string>) => {
      await generateAI();
      return { report: reports[0], isNew: true };
    });
    const input = params({ loadReports: vi.fn().mockResolvedValue(reports), ensureWeeklyReport });

    await refreshWeeklyAiReport(input);

    expect(input.weeklyReportGenerationRef.current).toMatchObject({
      generationKey: `user-1_2026-41_72_epoch-1_${'a'.repeat(64)}_0`,
    });
    expect(input.recordLastAction).toHaveBeenCalledWith({ feature: 'wis_text', type: 'wis', userId: user.id });
    expect(input.requestInterpretation).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Анна', wis: 72, calorieTarget: 1800,
    }), expect.objectContaining({ guard: loginGuard }));
    expect(ensureWeeklyReport).toHaveBeenCalledWith(user.id, weekly, expect.any(Function), {
      readGuard: loginGuard, canCommit: expect.any(Function),
    });
    expect(input.prepareSession).toHaveBeenCalledWith(user.id, input.controller, expect.any(Function), { previous: loginGuard });
    expect(input.setWeeklyReports).toHaveBeenCalledWith(reports);
  });

  it('does not create a duplicate request for the same weekly score', async () => {
    const ensureWeeklyReport = vi.fn();
    const input = params({
      weeklyReportGenerationRef: { current: { generationKey: `user-1_2026-41_72_epoch-1_${'a'.repeat(64)}_0`, signal: new AbortController().signal } },
      ensureWeeklyReport,
    });

    await refreshWeeklyAiReport(input);

    expect(ensureWeeklyReport).not.toHaveBeenCalled();
    expect(input.requestInterpretation).not.toHaveBeenCalled();
  });

  it('clears only its own generation marker after a failed request and keeps soft errors quiet', async () => {
    const input = params({
      weeklyReportGenerationRef: { current: null },
      ensureWeeklyReport: async (_userId, _weekly, generateAI) => {
        await generateAI();
        throw new Error('already running');
      },
      isSoftError: () => true,
    });

    await refreshWeeklyAiReport(input);

    expect(input.weeklyReportGenerationRef.current).toBeNull();
    expect(input.logError).not.toHaveBeenCalled();
  });

  it('does not apply a late report after the login action expires', async () => {
    let current = true;
    let resolveInterpretation!: (value: string) => void;
    const request = new Promise<string>((resolve) => { resolveInterpretation = resolve; });
    const reports = [{ weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }];
    const input = params({
      isCurrentSession: () => current,
      requestInterpretation: vi.fn().mockReturnValue(request),
      ensureWeeklyReport: async (_userId, _weekly, generateAI, commitGuard) => {
        await generateAI();
        if (!commitGuard?.canCommit()) throw new Error('WEEKLY_REPORT_SESSION_CHANGED');
        return { report: reports[0], isNew: true };
      },
      loadReports: vi.fn().mockResolvedValue(reports),
    });

    const pending = refreshWeeklyAiReport(input);
    await vi.waitFor(() => expect(input.requestInterpretation).toHaveBeenCalledOnce());
    current = false;
    resolveInterpretation('Поздний ответ');
    await pending;

    expect(input.setWeeklyReports).not.toHaveBeenCalled();
    expect(input.logError).not.toHaveBeenCalled();
    expect(input.weeklyReportGenerationRef.current).toBeNull();
  });

  it('does not publish a report list after another attempt takes ownership during loading', async () => {
    const reports = [{ weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }];
    let resolveReports!: (value: typeof reports) => void;
    const reportList = new Promise<typeof reports>((resolve) => { resolveReports = resolve; });
    const input = params({ loadReports: vi.fn().mockReturnValue(reportList) });

    const pending = refreshWeeklyAiReport(input);
    await vi.waitFor(() => expect(input.loadReports).toHaveBeenCalledOnce());
    input.weeklyReportGenerationRef.current = {
      generationKey: 'newer-weekly-attempt',
      signal: new AbortController().signal,
    };
    resolveReports(reports);
    await pending;

    expect(input.setWeeklyReports).not.toHaveBeenCalled();
    expect(input.weeklyReportGenerationRef.current?.generationKey).toBe('newer-weekly-attempt');
  });

  it('stops durable commit when a newer attempt replaces ownership during AI generation', async () => {
    let resolveInterpretation!: (value: string) => void;
    const interpretation = new Promise<string>((resolve) => { resolveInterpretation = resolve; });
    let commitAllowedAfterReplacement = true;
    const input = params({
      requestInterpretation: vi.fn().mockReturnValue(interpretation),
      ensureWeeklyReport: async (_userId, _weekly, generateAI, commitGuard) => {
        const generation = generateAI();
        await vi.waitFor(() => expect(input.requestInterpretation).toHaveBeenCalledOnce());
        input.weeklyReportGenerationRef.current = {
          generationKey: 'newer-weekly-attempt',
          signal: new AbortController().signal,
        };
        commitAllowedAfterReplacement = commitGuard?.canCommit?.() ?? false;
        resolveInterpretation('Устаревший текст');
        await expect(generation).rejects.toThrow('WEEKLY_REPORT_SESSION_CHANGED');
        throw new Error('WEEKLY_REPORT_SESSION_CHANGED');
      },
    });

    await refreshWeeklyAiReport(input);

    expect(commitAllowedAfterReplacement).toBe(false);
    expect(input.loadReports).not.toHaveBeenCalled();
    expect(input.setWeeklyReports).not.toHaveBeenCalled();
    expect(input.logError).not.toHaveBeenCalled();
    expect(input.weeklyReportGenerationRef.current?.generationKey).toBe('newer-weekly-attempt');
  });

  it('does not publish a loaded report after same-account reauthentication in another tab', async () => {
    const reports = [{ weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }];
    let resolveReports!: (value: typeof reports) => void;
    const reportList = new Promise<typeof reports>((resolve) => { resolveReports = resolve; });
    const input = params({
      loadReports: vi.fn().mockReturnValue(reportList),
      isSoftError: error => error instanceof Error && error.message === 'LOGIN_SESSION_CHANGED',
    });
    vi.mocked(input.session.outbox.isReadSessionCurrent)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    const pending = refreshWeeklyAiReport(input);
    await vi.waitFor(() => expect(input.loadReports).toHaveBeenCalledOnce());
    resolveReports(reports);
    await pending;

    expect(input.setWeeklyReports).not.toHaveBeenCalled();
    expect(input.logError).not.toHaveBeenCalled();
    expect(input.weeklyReportGenerationRef.current).toBeNull();
  });

  it('does not send or save a report without a matching login proof', async () => {
    const ensureWeeklyReport = vi.fn();
    const input = params({ loginGuard: null, ensureWeeklyReport });

    await refreshWeeklyAiReport(input);

    expect(input.prepareSession).not.toHaveBeenCalled();
    expect(ensureWeeklyReport).not.toHaveBeenCalled();
    expect(input.requestInterpretation).not.toHaveBeenCalled();
    expect(input.setWeeklyReports).not.toHaveBeenCalled();
  });
});
