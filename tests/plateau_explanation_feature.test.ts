import { describe, expect, it, vi } from 'vitest';
import { runPlateauExplanation } from '../features/ai/usePlateauExplanation';
import type { AiSession } from '../services/aiSession';
import type { OutboxReadGuard } from '../storage/durableOutbox';
import { Goal } from '../types';

const accountId = 'plateau-user';
const guard: OutboxReadGuard = {
  accountId, sessionEpoch: 'epoch-1', serverSessionId: 'a'.repeat(64), authFence: 0,
};
const input = { name: 'Анна', goal: Goal.LOSS, compliancePct: 82, weightDeltaN: 0, expectedN: -0.4,
  adaptationIndex: 20, suggestion: { type: 'stay' } };

function fixture() {
  const controller = new AbortController();
  const session = { guard, controller, isCurrentSession: () => true,
    outbox: { isReadSessionCurrent: vi.fn(async () => true) } } as unknown as AiSession;
  const profileEditRevisionRef = { current: 0 };
  let lastAction: ReturnType<typeof import('../geminiService').getLastAiAction> = null;
  const setLoading = vi.fn();
  const setNote = vi.fn();
  const prepareSession = vi.fn(async () => session);
  const recordLastAction = vi.fn((action: NonNullable<typeof lastAction>) => { lastAction = action; });
  const getLastAction = vi.fn(() => lastAction);
  const requestExplanation = vi.fn(async () => 'Проверьте точность порций и сон.');
  const run = (overrides: Partial<Parameters<typeof runPlateauExplanation>[0]> = {}) => runPlateauExplanation({
    currentUserId: accountId, loginGuard: guard, controller, isCurrentSession: () => true,
    profileEditRevisionRef, input, setLoading, setNote,
    prepareSession, recordLastAction, getLastAction, requestExplanation, logError: vi.fn(),
    ...overrides,
  });
  return { run, session, profileEditRevisionRef, setLoading, setNote, prepareSession,
    recordLastAction, getLastAction, requestExplanation, replaceAction: (action: typeof lastAction) => { lastAction = action; } };
}

describe('plateau explanation', () => {
  it('gets fresh proof and applies only the response from the current attempt', async () => {
    const test = fixture();

    await expect(test.run()).resolves.toBe('Проверьте точность порций и сон.');

    expect(test.prepareSession).toHaveBeenCalledWith(accountId, expect.any(AbortController), expect.any(Function), { previous: guard });
    expect(test.requestExplanation).toHaveBeenCalledWith(input, test.session);
    expect(test.recordLastAction).toHaveBeenCalledWith(expect.objectContaining({ feature: 'plateau', actionId: expect.any(String) }));
    expect(test.setNote).toHaveBeenCalledWith('Проверьте точность порций и сон.');
    expect(test.setLoading.mock.calls).toEqual([[true], [false]]);
  });

  it('does not apply a response after the source profile changes', async () => {
    const test = fixture();
    test.requestExplanation.mockImplementation(async () => {
      test.profileEditRevisionRef.current += 1;
      return 'Поздний ответ';
    });

    await expect(test.run()).resolves.toBeNull();
    expect(test.setNote).not.toHaveBeenCalled();
  });

  it('does not start a stale retry after proof', async () => {
    const action = { feature: 'plateau', type: 'plateau', userId: accountId, actionId: 'old-action' };
    const test = fixture();
    test.replaceAction(action);
    test.prepareSession.mockImplementation(async () => {
      test.replaceAction({ feature: 'personal_plan', type: 'plan', userId: accountId, actionId: 'new-action' });
      return test.session;
    });

    await expect(test.run({ expectedLastAction: action })).resolves.toBeNull();
    expect(test.requestExplanation).not.toHaveBeenCalled();
    expect(test.recordLastAction).not.toHaveBeenCalled();
    expect(test.setNote).not.toHaveBeenCalled();
  });
});
