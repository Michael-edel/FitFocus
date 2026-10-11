import { describe, expect, it, vi } from 'vitest';
import { prepareLoginSession } from '../features/auth/loginSession';
import { userProfile } from './_helpers/userProfile';
const user = userProfile('verified-user');
const hydrated = (currentUser = user) => ({ currentUser, allUsers: [], weeklyReports: [], foodDiary: [], habits: [], foodHistory: [], foodFavorites: [], coachCard: null });
const basic = { initialHabits: [], resetUsageIfNewTime: (profile: typeof user) => profile };
describe('prepareLoginSession', () => {
  it('rejects legacy or other account identities without renaming storage or hydrating', async () => {
    const hydrateSession = vi.fn(async () => hydrated());
    await expect(prepareLoginSession({ ...user, id: 'legacy-user' }, { sub: user.id, email: user.email }, { ...basic, hydrateSession })).rejects.toThrow('PROFILE_ACCOUNT_MISMATCH');
    expect(hydrateSession).not.toHaveBeenCalled();
  });
  it('keeps an existing AI plan and filters the local profile list to the verified owner', async () => {
    const withPlan = { ...user, aiPlan: { title: 'existing' } } as typeof user;
    const buildFallbackPlan = vi.fn();
    const prepared = await prepareLoginSession(withPlan, { sub: user.id }, { ...basic,
      hydrateSession: async () => ({ ...hydrated(withPlan), allUsers: [userProfile('other')] }), buildFallbackPlan });
    expect(prepared.currentUser.aiPlan).toEqual({ title: 'existing' });
    expect(prepared.hydrated.allUsers).toEqual([withPlan]); expect(buildFallbackPlan).not.toHaveBeenCalled();
  });
  it('does not activate a session after hydration was cancelled', async () => {
    let current = true;
    await expect(prepareLoginSession(user, { sub: user.id }, { ...basic, isCurrentSession: () => current,
      hydrateSession: async () => { current = false; return hydrated(); } })).rejects.toThrow('LOGIN_SESSION_CHANGED');
  });
  it('rejects an unexpected hydrated identity instead of relabelling its data', async () => {
    await expect(prepareLoginSession(user, { sub: user.id }, { ...basic,
      hydrateSession: async () => hydrated(userProfile('other')) })).rejects.toThrow('PROFILE_ACCOUNT_MISMATCH');
  });
});
