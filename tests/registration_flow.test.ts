import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runRegistrationFlow } from '../registrationFlow';
import { ActivityLevel, Gender, Goal, type UserProfile } from '../types';
import { buildFallbackAiPlan } from '../aiPlanFallback';
import { userProfile } from './_helpers/userProfile';
import { DurableOutbox } from '../storage/durableOutbox';
import { UserStateRepository } from '../storage/userStateRepository';
import { userStateDatabase } from '../storage/stateDatabase';
import { type AiSession, prepareAiSession } from '../services/aiSession';

const account = 'registration-owner';
function deps() {
  const sid = 'a'.repeat(64);
  return { regData: { name: 'Test User', gender: Gender.FEMALE, weight: 72, height: 170, age: 32,
    activityLevel: ActivityLevel.MODERATELY_ACTIVE, goal: Goal.LOSS, targetWeight: 65, plan: 'free' as const },
    regNameValid: true, allUsersCount: 0, requireInvite: false, inviteCode: '',
    googleMe: { sub: account, email: 'test@example.test' }, isCurrentSession: () => true,
    setPlanError: vi.fn(), setLastAiAction: vi.fn(), setDevPlanOverride: vi.fn(),
    generatePersonalPlan: vi.fn<(user: UserProfile, session: AiSession) => Promise<UserProfile['aiPlan']>>(async () => undefined), loginAsUser: vi.fn(async () => {}),
    prepareSession: async (_id: string, controller: AbortController, isCurrent: () => boolean, options: Parameters<typeof prepareAiSession>[3] = {}) => {
      expect(options.allowInitialSession).toBe(true);
      const outbox = new DurableOutbox();
      const guard = await outbox.acceptReadSession(account, sid, 0);
      if (!guard) throw new Error('test session setup failed');
      return { guard, controller, isCurrentSession: isCurrent, outbox } as AiSession;
    },
    setAllUsers: vi.fn(), setCurrentUser: vi.fn(), setAuthState: vi.fn(),
    setActiveTab: vi.fn(), setPlanIntroOpen: vi.fn(),
    fetchImpl: vi.fn<typeof fetch>(async () => { throw new Error('offline'); }) };
}
beforeEach(() => {
  userStateDatabase.close(); vi.stubGlobal('indexedDB', new IDBFactory());
  for (const name of ['localStorage', 'sessionStorage']) {
    const values = new Map<string, string>();
    vi.stubGlobal(name, { getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); },
      get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null });
  }
});
afterEach(() => { userStateDatabase.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('durable registration', () => {
  it('commits the canonical account profile before generating AI and enters the app without a direct profile request', async () => {
    const d = deps();
    d.generatePersonalPlan.mockImplementation(async (_user, session) => {
      expect(session.guard.accountId).toBe(account);
      const snapshot = await new DurableOutbox().snapshot(account, `fitfocus_data_${account}_profile`);
      expect(JSON.parse(snapshot.value!)).toMatchObject({ id: account, version: 0, googleSub: account });
      expect(await new DurableOutbox().list(account)).toHaveLength(1);
      return undefined;
    });
    await runRegistrationFlow(d);
    expect(d.fetchImpl).not.toHaveBeenCalled(); expect(d.loginAsUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: account, aiPlan: expect.any(Object) }), expect.objectContaining({ accountId: account }));
    expect(d.setActiveTab).toHaveBeenCalledWith('plan'); expect(localStorage.length).toBe(0);
    expect(await new DurableOutbox().list(account)).toMatchObject([{ resource: 'profile', baseVersion: 0, status: 'pending' }]);
  });
  it('leaves registration open and performs no AI or login work when the initial commit fails', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function () { throw new DOMException('quota', 'QuotaExceededError'); });
    const d = deps(); await runRegistrationFlow(d);
    expect(d.generatePersonalPlan).not.toHaveBeenCalled(); expect(d.loginAsUser).not.toHaveBeenCalled();
    expect(d.setPlanError).toHaveBeenLastCalledWith(expect.stringMatching(/локальн|устройств/i));
    expect((await new DurableOutbox().snapshot(account, `fitfocus_data_${account}_profile`)).value).toBeNull();
  });
  it('keeps the first durable intent and ignores an AI result after logout', async () => {
    let current = true; const d = deps(); d.isCurrentSession = () => current;
    d.generatePersonalPlan.mockImplementation(async () => { current = false; return undefined; });
    await runRegistrationFlow(d);
    expect(await new DurableOutbox().list(account)).toHaveLength(1);
    expect(d.loginAsUser).not.toHaveBeenCalled(); expect(d.setPlanIntroOpen).not.toHaveBeenCalled();
  });
  it('retains the initial fallback profile when AI fails', async () => {
    const d = deps(); d.generatePersonalPlan.mockRejectedValue(new Error('offline'));
    await runRegistrationFlow(d);
    expect(d.loginAsUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: account, aiPlan: expect.any(Object) }), expect.objectContaining({ accountId: account }));
    expect(await new DurableOutbox().list(account)).toHaveLength(1);
  });
  it('does not continue registration with a fallback after the AI session is invalidated', async () => {
    const d = deps();
    d.generatePersonalPlan.mockImplementation(async () => {
      await new DurableOutbox().invalidateSessions();
      throw new TypeError('Network unavailable');
    });

    await runRegistrationFlow(d);

    expect(d.loginAsUser).not.toHaveBeenCalled();
    expect(d.setPlanError).toHaveBeenCalledWith(expect.stringMatching(/сессия изменилась|не подтверждена/i));
    expect(await new DurableOutbox().list(account)).toHaveLength(1);
  });
  it('does not overwrite a profile already owned by another editor', async () => {
    const repository = new UserStateRepository(account);
    const d = deps(); await runRegistrationFlow(d);
    const first = await repository.observe('profile'); const count = (await new DurableOutbox().list(account)).length;
    const again = deps(); again.regData.name = 'Replacement'; await runRegistrationFlow(again);
    expect((await repository.observe('profile')).value).toBe(first.value);
    expect(await new DurableOutbox().list(account)).toHaveLength(count);
    expect(again.loginAsUser).not.toHaveBeenCalled();
  });
  it('uses the authenticated email name as a display fallback while keeping the authenticated account id', async () => {
    const d = deps(); d.regData.name = ''; d.regNameValid = false;
    await runRegistrationFlow(d);
    expect(d.loginAsUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: account, name: 'test' }), expect.objectContaining({ accountId: account }));
  });
  it('keeps the generated plan as a causal child of the initial durable profile', async () => {
    const d = deps(); const plan = { ...buildFallbackAiPlan(userProfile(account)), title: 'Generated plan' };
    d.generatePersonalPlan.mockResolvedValue(plan); await runRegistrationFlow(d);
    const operations = await new DurableOutbox().list(account);
    expect(operations).toHaveLength(2);
    const initial = operations.find(op => !op.parentOpId)!;
    expect(operations.find(op => op.parentOpId)).toMatchObject({ parentOpId: initial.opId, status: 'pending', baseVersion: 0 });
    expect(d.loginAsUser).toHaveBeenCalledWith(expect.objectContaining({ aiPlan: plan }), expect.objectContaining({ accountId: account }));
  });
  it.each(['account', 'capability'])('does not redeem an invite with an unverified %s', async invalid => {
    const d = deps(); d.requireInvite = true; d.inviteCode = 'SYNTHETIC';
    d.fetchImpl.mockResolvedValue(new Response(JSON.stringify({ user: { sub: invalid === 'account' ? 'other' : account },
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: 'a'.repeat(64) },
      ...(invalid === 'capability' ? {} : { inviteSync: { protocol: 1, guard: 1 } }) })));
    await runRegistrationFlow(d);
    expect(d.fetchImpl).toHaveBeenCalledTimes(1); expect(d.generatePersonalPlan).not.toHaveBeenCalled(); expect(d.loginAsUser).not.toHaveBeenCalled();
    expect(await new DurableOutbox().list(account)).toEqual([]);
  });
  it('keeps the durable fallback if saving the generated AI plan runs out of space', async () => {
    const original = IDBObjectStore.prototype.add; let count = 0;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'outbox' && ++count === 2) throw new DOMException('quota', 'QuotaExceededError');
      return original.apply(this, args);
    });
    const d = deps(); d.generatePersonalPlan.mockResolvedValue({ ...buildFallbackAiPlan(userProfile(account)), title: 'Generated plan' });
    await runRegistrationFlow(d);
    const snapshot = await new DurableOutbox().snapshot(account, `fitfocus_data_${account}_profile`);
    expect(JSON.parse(snapshot.value!).aiPlan.title).not.toBe('Generated plan');
    expect(await new DurableOutbox().list(account)).toHaveLength(1);
    expect(d.loginAsUser).toHaveBeenCalledWith(
      expect.objectContaining({ aiPlan: JSON.parse(snapshot.value!).aiPlan }), expect.objectContaining({ accountId: account }));
  });
  it('binds invite redemption to a fresh session and requires its guarded acknowledgement', async () => {
    const d = deps(); d.requireInvite = true; d.inviteCode = 'SYNTHETIC'; const sid = 'a'.repeat(64);
    d.fetchImpl.mockImplementation(async (url, init) => {
      if (url === '/api/me') return new Response(JSON.stringify({ user: { sub: account }, stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, inviteSync: { protocol: 1, guard: 1 } }));
      expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sid);
      return new Response('{"ok":true}', { headers: { 'X-FitFocus-Invite-Guard': '1', 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid } });
    });
    await runRegistrationFlow(d); expect(d.fetchImpl).toHaveBeenCalledTimes(2); expect(d.loginAsUser).toHaveBeenCalled();
  });
  it.each(['missing', 'wrong'])('does not create a profile from a %s invite acknowledgement scope', async invalid => {
    const d = deps(); d.requireInvite = true; d.inviteCode = 'SYNTHETIC'; const sid = 'a'.repeat(64);
    d.fetchImpl.mockImplementation(async url => url === '/api/me'
      ? new Response(JSON.stringify({ user: { sub: account }, stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, inviteSync: { protocol: 1, guard: 1 } }))
      : new Response('{"ok":true}', { headers: invalid === 'missing' ? {} : { 'X-FitFocus-Invite-Guard': '1', 'X-FitFocus-State-Account': 'other', 'X-FitFocus-State-Session': sid } }));
    await runRegistrationFlow(d);
    expect(d.loginAsUser).not.toHaveBeenCalled(); expect(await new DurableOutbox().list(account)).toEqual([]);
  });
});
