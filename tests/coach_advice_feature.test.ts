import { describe, expect, it, vi } from 'vitest';
import { buildCoachAdviceRequest, type CoachAdviceRequest } from '../features/ai/coachAdvice';
import { requestCoachAdvice, type CoachAdviceRunParams } from '../features/ai/useCoachAdvice';
import type { AiSession } from '../services/aiSession';
import type { OutboxCommitGuard, OutboxOperation, OutboxReadGuard } from '../storage/durableOutbox';
import { ActivityLevel, Gender, Goal, type UserProfile } from '../types';

const user: UserProfile = {
  id: 'user-1',
  name: 'Ирина',
  gender: Gender.FEMALE,
  weight: 68,
  height: 168,
  age: 33,
  activityLevel: ActivityLevel.MODERATELY_ACTIVE,
  goal: Goal.LOSS,
  weightHistory: [],
  targetWeight: 60,
  adaptationMultiplier: 1,
  familyMembers: [],
  exclusions: '',
  bloodPressureSystolic: 120,
  restingPulse: 62,
  medicalRestrictions: 'Следить за сном',
};

const guard: OutboxReadGuard = {
  accountId: user.id, sessionEpoch: 'epoch-1', serverSessionId: 'a'.repeat(64), authFence: 0,
};
const advice = { title: 'Сегодня', advice: 'Добавьте белок к ужину.', bullets: ['Творог'] };
const pending = { status: 'pending' } as OutboxOperation;

function params(overrides: Partial<CoachAdviceRunParams> = {}) {
  let lastAction: ReturnType<typeof import('../geminiService').getLastAiAction> = null;
  let current = true;
  const calls: string[] = [];
  const commitGuards: OutboxCommitGuard[] = [];
  const profileEditRevisionRef = { current: 0 };
  const controller = new AbortController();
  const session = {
    guard,
    controller,
    isCurrentSession: () => current,
    outbox: { isReadSessionCurrent: async () => current },
  } as unknown as AiSession;
  const input: CoachAdviceRunParams = {
    currentUser: user,
    loginGuard: guard,
    isCurrentSession: () => current,
    controller,
    profileEditRevisionRef,
    targets: { calories: 1800, protein: 110, fat: 60, carbs: 200 },
    dailyStats: { calories: 840, protein: 52, fat: 24, carbs: 93 },
    canUseCoachAdvice: () => true,
    openPaywall: () => calls.push('paywall'),
    incrementUsage: async guard => { calls.push('usage'); commitGuards.push(guard); profileEditRevisionRef.current += 1; return pending; },
    repository: { writeJson: async (key, value, guard) => { calls.push(`${key}:${value === advice}`); if (guard) commitGuards.push(guard); return pending; } },
    setCoachCard: value => calls.push(`card:${value === advice}`),
    setLoading: value => calls.push(`loading:${value}`),
    checkAchievements: () => calls.push('achievement'),
    requestAdvice: async (input, requestSession) => {
      expect((input as CoachAdviceRequest).today.habitsDone).toBe(1);
      expect(requestSession).toBe(session);
      calls.push('request');
      return advice;
    },
    prepareSession: async (_accountId, _controller, isCurrentSession, options) => {
      calls.push('prepare');
      expect(isCurrentSession()).toBe(true);
      expect(options).toEqual({ previous: guard });
      return session;
    },
    getLastAction: vi.fn(() => lastAction),
    recordLastAction: action => { lastAction = action; calls.push('last-action'); },
    getTodayKeyImpl: () => '2026-10-07',
    logError: () => calls.push('error'),
    ...overrides,
  };
  return {
    input,
    calls,
    commitGuards,
    session,
    profileEditRevisionRef,
    getLastAction: input.getLastAction!,
    get lastAction() { return lastAction; },
    setLastAction(action: typeof lastAction) { lastAction = action; },
    setCurrent(value: boolean) { current = value; },
  };
}

describe('coach advice feature', () => {
  it('builds the AI input from current nutrition, profile and completed habits', () => {
    expect(buildCoachAdviceRequest(
      user,
      { calories: 1800, protein: 110, fat: 60, carbs: 200 },
      { calories: 840, protein: 52, fat: 24, carbs: 93 },
      { water: true, steps: false, breakfast: true, sleep: true },
    )).toEqual({
      user: expect.objectContaining({
        name: 'Ирина',
        goal: Goal.LOSS,
        caloriesTarget: 1800,
        proteinTarget: 110,
        restingPulse: 62,
      }),
      today: {
        calories: 840,
        protein: 52,
        fat: 24,
        carbs: 93,
        habitsDone: 3,
        habitsTotal: 4,
      },
    });
  });

  it('proves the originating session, commits card and usage, then exposes success effects', async () => {
    const run = params({
      currentUser: { ...user, dailyHabits: { '2026-10-07': { water: true, steps: false, breakfast: false, sleep: false } } },
    });

    const result = await requestCoachAdvice(run.input);

    expect(result).toBe(advice);
    expect(run.getLastAction).toHaveBeenCalledWith(user.id);
    expect(run.commitGuards).toHaveLength(2);
    expect(run.commitGuards.every(item => item.readGuard.accountId === user.id && typeof item.canCommit === 'function')).toBe(true);
    expect(run.calls).toEqual([
      'loading:true', 'prepare', 'last-action', 'request', 'last_coach_card:true',
      'usage', 'card:true', 'achievement', 'loading:false',
    ]);
  });

  it('opens the paywall without proving a session or starting an AI request when quota is spent', async () => {
    const run = params({ canUseCoachAdvice: () => false });
    await requestCoachAdvice(run.input);

    expect(run.calls).toEqual(['paywall']);
  });

  it('does not apply a response after the source profile changes during generation', async () => {
    const run = params({
      requestAdvice: async () => {
        run.profileEditRevisionRef.current += 1;
        return advice;
      },
    });

    await expect(requestCoachAdvice(run.input)).resolves.toBeNull();
    expect(run.calls).not.toContain('last_coach_card:true');
    expect(run.calls).not.toContain('usage');
    expect(run.calls).not.toContain('card:true');
    expect(run.calls).not.toContain('achievement');
  });

  it('does not apply a late response after the login action becomes stale', async () => {
    const run = params({ requestAdvice: async () => { run.setCurrent(false); return advice; } });

    await expect(requestCoachAdvice(run.input)).resolves.toBeNull();
    expect(run.calls).not.toContain('last_coach_card:true');
    expect(run.calls).not.toContain('usage');
    expect(run.calls).not.toContain('card:true');
    expect(run.calls).not.toContain('achievement');
  });

  it('does not expose a coach card if its guarded durable commit is not pending', async () => {
    const run = params({ repository: { writeJson: async () => ({ status: 'conflicted' } as OutboxOperation) } });

    await expect(requestCoachAdvice(run.input)).resolves.toBeNull();
    expect(run.calls).not.toContain('usage');
    expect(run.calls).not.toContain('card:true');
    expect(run.calls).not.toContain('achievement');
    expect(run.calls).toContain('error');
  });

  it('does not report success when the guarded usage commit fails', async () => {
    const run = params({ incrementUsage: async () => ({ status: 'conflicted' } as OutboxOperation) });

    await expect(requestCoachAdvice(run.input)).resolves.toBeNull();
    expect(run.calls).not.toContain('card:true');
    expect(run.calls).not.toContain('achievement');
  });

  it('does not publish success if another profile edit races with the usage commit', async () => {
    const run = params({
      incrementUsage: async commitGuard => {
        expect(commitGuard.canCommit?.()).toBe(true);
        run.profileEditRevisionRef.current += 2;
        return pending;
      },
    });

    await expect(requestCoachAdvice(run.input)).resolves.toBeNull();
    expect(run.calls).not.toContain('card:true');
    expect(run.calls).not.toContain('achievement');
  });

  it('rechecks the original retry action after preparing a fresh proof', async () => {
    const original = { feature: 'coach_advice', type: 'coach', userId: user.id };
    const run = params({
      expectedLastAction: original,
      prepareSession: async () => {
        run.setLastAction({ feature: 'personal_plan', type: 'plan', userId: user.id });
        return run.session;
      },
    });

    await expect(requestCoachAdvice(run.input)).resolves.toBeNull();
    expect(run.calls).not.toContain('last-action');
    expect(run.calls).not.toContain('request');
  });
});
