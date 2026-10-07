import { describe, expect, it, vi } from 'vitest';
import { Goal, type UserProfile } from '../types';
import { retryLastAiAction } from '../features/ai/aiRetry';

const user = { id: 'user-1', name: 'Анна', goal: Goal.LOSS } as UserProfile;
const weekly = {
  wis: 72,
  status: 'stable' as const,
  weightDelta7: -0.4,
  weightDelta30: -1.6,
  compliance: 84,
  adaptationIndex: 24,
};

function params(overrides: Partial<Parameters<typeof retryLastAiAction>[0]> = {}) {
  return {
    currentUser: user,
    weekly,
    targets: { calories: 1800, protein: 120, fat: 60, carbs: 190 },
    compliancePct: 84,
    weightDeltaN: -0.8,
    expectedN: -0.7,
    adaptationIndex: 24,
    refeedSuggestion: { type: 'stay' },
    persistUser: vi.fn(),
    retryCoachAdvice: vi.fn().mockResolvedValue(undefined),
    setAdaptLoading: vi.fn(),
    setAdaptNote: vi.fn(),
    weeklyReportGenerationRef: { current: 'in-flight' },
    setWeeklyReports: vi.fn(),
    allowRetry: vi.fn().mockReturnValue(true),
    logError: vi.fn(),
    ...overrides,
  };
}

describe('AI retry feature', () => {
  it('does not retry a stale action belonging to another user', async () => {
    const input = params({
      getLastAction: () => ({ feature: 'personal_plan', type: 'plan', userId: 'user-2' }),
      requestPersonalPlan: vi.fn(),
    });

    await retryLastAiAction(input);

    expect(input.allowRetry).not.toHaveBeenCalled();
    expect(input.requestPersonalPlan).not.toHaveBeenCalled();
    expect(input.persistUser).not.toHaveBeenCalled();
  });

  it('delegates a coach retry after restoring the current action', async () => {
    const input = params({
      getLastAction: () => ({ feature: 'coach_advice', type: 'coach', userId: user.id }),
    });

    await retryLastAiAction(input, { force: true });

    expect(input.allowRetry).toHaveBeenCalledWith('coach_advice', { force: true });
    expect(input.retryCoachAdvice).toHaveBeenCalledOnce();
  });

  it('persists a fallback plan if the retried plan fails', async () => {
    const fallback = { title: 'Локальный план' } as UserProfile['aiPlan'];
    const input = params({
      getLastAction: () => ({ feature: 'personal_plan', type: 'plan', userId: user.id }),
      requestPersonalPlan: vi.fn().mockRejectedValue(new Error('offline')),
      buildFallbackPlan: vi.fn().mockReturnValue(fallback),
    });

    await retryLastAiAction(input);

    expect(input.buildFallbackPlan).toHaveBeenCalledWith(user);
    expect(input.persistUser).toHaveBeenCalledWith({ ...user, aiPlan: fallback });
    expect(input.logError).toHaveBeenCalledOnce();
  });

  it('rebuilds the weekly report context and refreshes stored reports', async () => {
    const reports = [{ weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }];
    const recordLastAction = vi.fn();
    const requestWeeklyInterpretation = vi.fn().mockResolvedValue('Стабильная неделя');
    const input = params({
      getLastAction: () => ({ feature: 'wis_text', type: 'wis', userId: user.id }),
      getWeekKeyImpl: () => '2026-41',
      recordLastAction,
      requestWeeklyInterpretation,
      ensureWeeklyReport: async (_userId, _weekly, generateAI) => {
        await generateAI();
        return { report: reports[0], isNew: true };
      },
      loadReports: async () => reports,
    });

    await retryLastAiAction(input);

    expect(recordLastAction).toHaveBeenCalledWith({ feature: 'wis_text', type: 'wis', userId: user.id });
    expect(requestWeeklyInterpretation).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Анна', wis: 72, calorieTarget: 1800,
    }));
    expect(input.setWeeklyReports).toHaveBeenCalledWith(reports);
  });
});
