import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runRegistrationFlow } from '../registrationFlow';
import { ActivityLevel, Gender, Goal, type TariffPlan } from '../types';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('runRegistrationFlow', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists a local snapshot before cloud hydration continues', async () => {
    const persistUser = vi.fn();
    const setAllUsers = vi.fn();
    const setCurrentUser = vi.fn();
    const setAuthState = vi.fn();
    const setActiveTab = vi.fn();
    const setPlanIntroOpen = vi.fn();
    const loginAsUser = vi.fn().mockResolvedValue(undefined);
    const setPlanError = vi.fn();

    await runRegistrationFlow({
      regData: {
        name: 'Test User',
        gender: Gender.MALE,
        weight: 85,
        height: 180,
        age: 35,
        activityLevel: ActivityLevel.MODERATELY_ACTIVE,
        goal: Goal.LOSS,
        targetWeight: 80,
        plan: 'free' as TariffPlan,
        medicalRestrictions: '',
        bloodPressureSystolic: 0,
        bloodPressureDiastolic: 0,
        restingPulse: 0,
        bloodGlucoseMmolL: 0,
        waistCm: 0,
        chestCm: 0,
        hipsCm: 0,
        lossDeficit: 400,
        gainSurplus: 200,
      },
      regNameValid: true,
      allUsersCount: 0,
      requireInvite: false,
      inviteCode: '',
      googleMe: { sub: 'google-sub-1', email: 'test@example.com' },
      setPlanError,
      setLastAiAction: vi.fn(),
      setDevPlanOverride: vi.fn(),
      generatePersonalPlan: vi.fn().mockResolvedValue({ mode: 'test-plan' }),
      loginAsUser,
      persistUser,
      setAllUsers,
      setCurrentUser,
      setAuthState,
      setActiveTab,
      setPlanIntroOpen,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ profile: { id: 'user-1', googleSub: 'google-sub-1', aiPlan: { mode: 'server' } } }),
      } as Response),
    });

    expect(setAuthState).toHaveBeenCalledWith('app');
    expect(persistUser).toHaveBeenCalledTimes(1);

    const allUsersKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string =>
      !!key && key.endsWith('_all_users'),
    );
    expect(allUsersKeys.length).toBeGreaterThan(0);

    const stored = allUsersKeys
      .map((key) => localStorage.getItem(key))
      .filter((value): value is string => !!value)
      .map((value) => JSON.parse(value) as Array<{ googleSub?: string }>)
      .flat();

    expect(stored.some((profile) => profile.googleSub === 'google-sub-1')).toBe(true);
  });

  it('uses an auth fallback name when the registration name is still empty', async () => {
    const setAuthState = vi.fn();
    const persistUser = vi.fn();

    await runRegistrationFlow({
      regData: {
        name: '',
        gender: Gender.FEMALE,
        weight: 51,
        height: 164,
        age: 52,
        activityLevel: ActivityLevel.LIGHTLY_ACTIVE,
        goal: Goal.LOSS,
        targetWeight: 49.2,
        plan: 'free' as TariffPlan,
        medicalRestrictions: '',
        bloodPressureSystolic: 0,
        bloodPressureDiastolic: 0,
        restingPulse: 0,
        bloodGlucoseMmolL: 0,
        waistCm: 0,
        chestCm: 0,
        hipsCm: 0,
        lossDeficit: 400,
        gainSurplus: 200,
      },
      regNameValid: false,
      allUsersCount: 0,
      requireInvite: false,
      inviteCode: '',
      googleMe: { sub: 'google-sub-2', email: 'galaxy@example.com' },
      setPlanError: vi.fn(),
      setLastAiAction: vi.fn(),
      setDevPlanOverride: vi.fn(),
      generatePersonalPlan: vi.fn().mockResolvedValue({ mode: 'test-plan' }),
      loginAsUser: vi.fn().mockResolvedValue(undefined),
      persistUser,
      setAllUsers: vi.fn(),
      setCurrentUser: vi.fn(),
      setAuthState,
      setActiveTab: vi.fn(),
      setPlanIntroOpen: vi.fn(),
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response),
    });

    expect(setAuthState).toHaveBeenCalledWith('app');
    expect(persistUser).toHaveBeenCalledWith(expect.objectContaining({
      googleSub: 'google-sub-2',
      name: 'galaxy',
    }));
  });
});
