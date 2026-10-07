import { describe, expect, it, vi } from 'vitest';
import { Goal, type UserProfile } from '../types';
import { refreshWeeklyAiReport } from '../features/ai/useWeeklyAiReport';

const user = { id: 'user-1', name: 'Анна', goal: Goal.LOSS } as UserProfile;
const weekly = {
  wis: 72,
  status: 'stable' as const,
  weightDelta7: -0.4,
  weightDelta30: -1.6,
  compliance: 84,
  adaptationIndex: 24,
};

function params(overrides: Partial<Parameters<typeof refreshWeeklyAiReport>[0]> = {}) {
  return {
    currentUser: user,
    weekly,
    targets: { calories: 1800, protein: 120, fat: 60, carbs: 190 },
    weeklyReportGenerationRef: { current: null },
    setWeeklyReports: vi.fn(),
    getWeekKeyImpl: () => '2026-41',
    recordLastAction: vi.fn(),
    requestInterpretation: vi.fn().mockResolvedValue('Стабильная неделя'),
    ensureWeeklyReport: async (_userId, _weekly, generateAI) => {
      await generateAI();
      return { report: { weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }, isNew: true };
    },
    loadReports: vi.fn().mockReturnValue([]),
    isSoftError: vi.fn().mockReturnValue(false),
    logError: vi.fn(),
    ...overrides,
  };
}

describe('weekly AI report feature', () => {
  it('requests the shared weekly context and refreshes the saved reports', async () => {
    const reports = [{ weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }];
    const input = params({ loadReports: vi.fn().mockReturnValue(reports) });

    await refreshWeeklyAiReport(input);

    expect(input.weeklyReportGenerationRef.current).toBe('user-1_2026-41_72');
    expect(input.recordLastAction).toHaveBeenCalledWith({ feature: 'wis_text', type: 'wis', userId: user.id });
    expect(input.requestInterpretation).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Анна', wis: 72, calorieTarget: 1800,
    }));
    expect(input.setWeeklyReports).toHaveBeenCalledWith(reports);
  });

  it('does not create a duplicate request for the same weekly score', async () => {
    const ensureWeeklyReport = vi.fn();
    const input = params({
      weeklyReportGenerationRef: { current: 'user-1_2026-41_72' },
      ensureWeeklyReport,
    });

    await refreshWeeklyAiReport(input);

    expect(ensureWeeklyReport).not.toHaveBeenCalled();
    expect(input.requestInterpretation).not.toHaveBeenCalled();
  });

  it('clears the guard after a failed request and keeps soft errors quiet', async () => {
    const input = params({
      weeklyReportGenerationRef: { current: 'old-value' },
      ensureWeeklyReport: async () => { throw new Error('already running'); },
      isSoftError: () => true,
    });

    await refreshWeeklyAiReport(input);

    expect(input.weeklyReportGenerationRef.current).toBeNull();
    expect(input.logError).not.toHaveBeenCalled();
  });
});
