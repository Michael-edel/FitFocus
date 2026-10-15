import { describe, expect, it, vi } from 'vitest';
import { Goal, type UserProfile } from '../types';
import { retryLastAiAction, type AiRetryParams } from '../features/ai/aiRetry';
import type { AiSession } from '../services/aiSession';
import type { OutboxOperation, OutboxReadGuard } from '../storage/durableOutbox';

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
type AiAction = NonNullable<ReturnType<typeof import('../geminiService').getLastAiAction>>;

function params(initialAction: AiAction = { feature: 'wis_text', type: 'wis', userId: user.id }, overrides: Partial<AiRetryParams> = {}) {
  const controller = new AbortController();
  const session = { guard: loginGuard, controller, isCurrentSession: () => true,
    outbox: { isReadSessionCurrent: vi.fn(async () => true) } } as unknown as AiSession;
  const pendingOperation = { status: 'pending' } as OutboxOperation;
  const actionState: { current: AiAction | null } = { current: initialAction };
  const recordLastAction = vi.fn((action: AiAction) => { actionState.current = action; });
  const input: AiRetryParams = {
    currentUser: user,
    weekly,
    targets: { calories: 1800, protein: 120, fat: 60, carbs: 190 },
    compliancePct: 84,
    weightDeltaN: -0.8,
    expectedN: -0.7,
    adaptationIndex: 24,
    refeedSuggestion: { type: 'stay' },
    persistUser: vi.fn(async () => pendingOperation),
    requestPersonalPlan: vi.fn().mockResolvedValue({ title: 'AI plan' }),
    buildFallbackPlan: vi.fn().mockReturnValue({ title: 'fallback plan' }),
    retryCoachAdvice: vi.fn().mockResolvedValue(undefined),
    retryPlateauExplanation: vi.fn().mockResolvedValue(undefined),
    requestWeeklyInterpretation: vi.fn().mockResolvedValue('Weekly text'),
    weeklyReportGenerationRef: { current: { generationKey: 'in-flight', signal: new AbortController().signal } },
    controller,
    profileEditRevisionRef: { current: 0 },
    loginGuard,
    isCurrentSession: () => true,
    prepareSession: vi.fn().mockResolvedValue(session),
    setWeeklyReports: vi.fn(),
    loadReports: vi.fn().mockResolvedValue([]),
    allowRetry: vi.fn().mockReturnValue(true),
    getLastAction: vi.fn(() => actionState.current),
    recordLastAction,
    logError: vi.fn(),
    ...overrides,
  };
  return Object.assign(input, { session, replaceLastAction: (action: AiAction) => { actionState.current = action; } });
}

describe('AI retry feature', () => {
  it('does not retry a stale action belonging to another user', async () => {
    const input = params({ feature: 'personal_plan', type: 'plan', userId: 'user-2' });

    await retryLastAiAction(input);

    expect(input.allowRetry).not.toHaveBeenCalled();
    expect(input.getLastAction).toHaveBeenCalledWith(user.id);
    expect(input.requestPersonalPlan).not.toHaveBeenCalled();
    expect(input.persistUser).not.toHaveBeenCalled();
  });

  it('delegates a coach retry after restoring the current action', async () => {
    const input = params({ feature: 'coach_advice', type: 'coach', userId: user.id });

    await retryLastAiAction(input, { force: true });

    expect(input.allowRetry).toHaveBeenCalledWith('coach_advice', { force: true });
    expect(input.retryCoachAdvice).toHaveBeenCalledWith(
      { feature: 'coach_advice', type: 'coach', userId: user.id },
      { force: true },
    );
  });

  it('delegates a plateau retry with its expected action', async () => {
    const action = { feature: 'plateau', type: 'plateau', userId: user.id, actionId: 'action-1' };
    const input = params(action);

    await retryLastAiAction(input);

    expect(input.allowRetry).toHaveBeenCalledWith('plateau', undefined);
    expect(input.retryPlateauExplanation).toHaveBeenCalledWith(expect.objectContaining({ name: user.name }), action, undefined);
  });

  it('persists a recoverable fallback plan through a guarded functional update', async () => {
    const fallback = { title: 'Локальный план' } as UserProfile['aiPlan'];
    const input = params({ feature: 'personal_plan', type: 'plan', userId: user.id }, {
      requestPersonalPlan: vi.fn().mockRejectedValue(new TypeError('network unavailable')),
      buildFallbackPlan: vi.fn().mockReturnValue(fallback),
    });

    await retryLastAiAction(input);

    expect(input.prepareSession).toHaveBeenCalledWith(user.id, input.controller, expect.any(Function), { previous: loginGuard });
    expect(input.requestPersonalPlan).toHaveBeenCalledWith(user, input.session);
    expect(input.buildFallbackPlan).toHaveBeenCalledWith(user);
    expect(input.recordLastAction).toHaveBeenCalledWith(expect.objectContaining({ feature: 'personal_plan', actionId: expect.any(String) }));
    expect(input.persistUser).toHaveBeenCalledOnce();
    const [update, guard] = vi.mocked(input.persistUser).mock.calls[0];
    expect(typeof update).toBe('function');
    expect((update as (previous: UserProfile) => UserProfile)(user)).toEqual({ ...user, aiPlan: fallback });
    expect(guard).toEqual(expect.objectContaining({ readGuard: loginGuard, canCommit: expect.any(Function) }));
    expect(guard?.canCommit?.()).toBe(true);
    expect(input.logError).toHaveBeenCalledOnce();
  });

  it('does not request or persist a plan when the last action changes during proof', async () => {
    const input = params({ feature: 'personal_plan', type: 'plan', userId: user.id });
    vi.mocked(input.prepareSession).mockImplementation(async () => {
      input.replaceLastAction({ feature: 'coach_advice', type: 'coach', userId: user.id });
      return input.session;
    });

    await retryLastAiAction(input);

    expect(input.requestPersonalPlan).not.toHaveBeenCalled();
    expect(input.persistUser).not.toHaveBeenCalled();
  });

  it('does not use a network fallback after the durable session changes', async () => {
    const input = params({ feature: 'personal_plan', type: 'plan', userId: user.id }, {
      requestPersonalPlan: vi.fn().mockRejectedValue(new TypeError('network unavailable')),
    });
    vi.mocked(input.session.outbox.isReadSessionCurrent).mockResolvedValue(false);

    await retryLastAiAction(input);

    expect(input.buildFallbackPlan).not.toHaveBeenCalled();
    expect(input.persistUser).not.toHaveBeenCalled();
  });

  it('rebuilds the weekly report context and refreshes stored reports', async () => {
    const reports = [{ weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }];
    const requestWeeklyInterpretation = vi.fn().mockResolvedValue('Стабильная неделя');
    const input = params({ feature: 'wis_text', type: 'wis', userId: user.id }, {
      getWeekKeyImpl: () => '2026-41',
      requestWeeklyInterpretation,
      ensureWeeklyReport: async (_userId, _weekly, generateAI) => {
        await generateAI();
        return { report: reports[0], isNew: true };
      },
      loadReports: async () => reports,
    });

    await retryLastAiAction(input);

    expect(input.recordLastAction).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'wis_text', type: 'wis', userId: user.id, actionId: expect.any(String),
    }));
    expect(requestWeeklyInterpretation).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Анна', wis: 72, calorieTarget: 1800,
    }), expect.objectContaining({ guard: loginGuard }));
    expect(input.prepareSession).toHaveBeenCalledWith(user.id, input.controller, expect.any(Function), { previous: loginGuard });
    expect(input.weeklyReportGenerationRef.current).toMatchObject({
      generationKey: `user-1_2026-41_72_epoch-1_${'a'.repeat(64)}_0`,
    });
    expect(input.setWeeklyReports).toHaveBeenCalledWith(reports);
  });

  it('does not publish or commit a weekly retry after its original action changes before generation', async () => {
    const input = params({ feature: 'wis_text', type: 'wis', userId: user.id }, {
      ensureWeeklyReport: async (_userId, _weekly, _generateAI, guard) => {
        expect(guard?.canCommit?.()).toBe(true);
        input.replaceLastAction({ feature: 'coach_advice', type: 'coach', userId: user.id, actionId: 'new-action' });
        expect(guard?.canCommit?.()).toBe(false);
        return { report: { weekKey: '2026-41', createdAt: '2026-10-07T00:00:00.000Z', data: weekly }, isNew: false };
      },
    });

    await retryLastAiAction(input);

    expect(input.requestWeeklyInterpretation).not.toHaveBeenCalled();
    expect(input.loadReports).not.toHaveBeenCalled();
    expect(input.setWeeklyReports).not.toHaveBeenCalled();
  });
});
