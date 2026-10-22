import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { bootstrapAuthSession, consumeOAuthContinuationState, ensureInviteCodeIsValid } from '../authSession';
import { userProfile } from './_helpers/userProfile';
import { UserStateRepository } from '../storage/userStateRepository';
import { DurableOutbox } from '../storage/durableOutbox';
import { userStateDatabase } from '../storage/stateDatabase';
import { sessionMe, sessionHeaders } from './_helpers/sessionRead';

beforeEach(() => {
  userStateDatabase.close(); vi.stubGlobal('indexedDB', new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); },
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null });
});
afterEach(() => { userStateDatabase.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function requestIdFromCall(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers).get('X-Request-ID');
}

describe('auth session transport', () => {
  it('does not relabel a bootstrap profile from a different authenticated account', async () => {
    const loginAsUser = vi.fn(async () => {}); const setAllUsers = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url).startsWith('/api/me')
      ? sessionMe('account-a') : { user: { sub: 'account-a' }, profile: userProfile('account-b') }), { headers: sessionHeaders('account-a', 'bootstrap') }));
    await bootstrapAuthSession({ requireInvite: false, loginAsUser, setAllUsers, fetchImpl,
      setAuthState: vi.fn(), setGoogleMe: vi.fn(), setInviteError: vi.fn(), setRegData: vi.fn() });
    expect(loginAsUser).not.toHaveBeenCalled(); expect(setAllUsers).not.toHaveBeenCalled();
  });
  it.each(['me', 'bootstrap'])('does not apply a late %s response after session cancellation', async (stage) => {
    let current = true;
    const loginAsUser = vi.fn(async () => {}); const setAuthState = vi.fn(); const setAllUsers = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(async url => {
      if (String(url).startsWith('/api/me')) {
        if (stage === 'me') current = false;
        return new Response(JSON.stringify(sessionMe('account-a')));
      }
      current = false;
      return new Response(JSON.stringify({ profile: { id: 'account-a' } }));
    });
    await bootstrapAuthSession({ requireInvite: false, loginAsUser, setAuthState, setAllUsers,
      setGoogleMe: vi.fn(), setInviteError: vi.fn(), setRegData: vi.fn(), fetchImpl, isCurrentSession: () => current });
    expect(loginAsUser).not.toHaveBeenCalled(); expect(setAuthState).not.toHaveBeenCalled(); expect(setAllUsers).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(stage === 'me' ? 1 : 2);
  });
  it('retries the safe session read with one request ID before showing the sign-in screen', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: null }), { status: 200 }));
    const authStates: string[] = [];

    await bootstrapAuthSession({
      requireInvite: false,
      loginAsUser: async () => undefined,
      setGoogleMe: () => undefined,
      setInviteError: () => undefined,
      setAuthState: (state) => authStates.push(state),
      setAllUsers: () => undefined,
      setRegData: () => undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toMatch(/^\/api\/me\?t=/);
    expect(requestIdFromCall(fetchImpl)).toMatch(/^web-/);
    expect(requestIdFromCall(fetchImpl, 1)).toBe(requestIdFromCall(fetchImpl));
    expect(authStates).toEqual(['auth_choice']);
  });

  it('sends invite validation once because POST requests are never retried', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ valid: true }), { status: 200 }));

    await expect(ensureInviteCodeIsValid({
      requireInvite: true,
      inviteCode: 'BETA-123',
      setInviteError: () => undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/api/invite/validate', expect.objectContaining({
      method: 'POST',
      headers: expect.any(Headers),
    }));
    expect(requestIdFromCall(fetchImpl)).toMatch(/^web-/);
  });

  it.each(['beforeunload', 'pagehide'])('aborts invite validation on %s without publishing a stale error', async (eventName) => {
    const page = new EventTarget();
    vi.stubGlobal('window', page);
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      markStarted();
    }));
    const setInviteError = vi.fn();
    const setInviteChecking = vi.fn();

    const validation = ensureInviteCodeIsValid({
      requireInvite: true,
      inviteCode: 'BETA-123',
      setInviteError,
      setInviteChecking,
      fetchImpl,
    });

    await started;
    page.dispatchEvent(new Event(eventName));

    await expect(validation).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(setInviteError).toHaveBeenCalledTimes(1);
    expect(setInviteError).toHaveBeenCalledWith(null);
    expect(setInviteChecking).toHaveBeenCalledTimes(1);
    expect(setInviteChecking).toHaveBeenCalledWith(true);
  });
});


describe('OAuth continuation state', () => {
  it('recognizes a trusted OAuth query marker and cleans it from the URL', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', { location: { href: 'https://fitfocus.test/?auth=google&x=1' }, history: { replaceState } });
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() });
    expect(consumeOAuthContinuationState()).toBe(true);
    expect(replaceState).toHaveBeenCalledWith({}, '', 'https://fitfocus.test/?x=1');
    vi.unstubAllGlobals();
  });
});

describe('owned profile recovery', () => {
  const start = async (bootstrap: Response, continueAfterOAuth = false) => {
    const loginAsUser = vi.fn(async () => {}); const setAuthState = vi.fn();
    await bootstrapAuthSession({ requireInvite: false, continueAfterOAuth, loginAsUser, setAuthState,
      setGoogleMe: vi.fn(), setInviteError: vi.fn(), setAllUsers: vi.fn(), setRegData: vi.fn(),
      fetchImpl: async url => String(url).startsWith('/api/me')
        ? new Response(JSON.stringify(sessionMe('owner', { email: 'same@example.test' })))
        : new Response(JSON.stringify({ user: { sub: 'owner' }, ...await bootstrap.clone().json() }), { status: bootstrap.status, headers: sessionHeaders('owner', 'bootstrap') }) });
    return { loginAsUser, setAuthState };
  };
  it.each([200, 503])('restores an own pending registration without an OAuth marker when bootstrap returns %i', async status => {
    await new UserStateRepository('owner').writeJson('profile', userProfile('owner', { version: 0 }));
    const result = await start(new Response('{"profile":null}', { status }));
    expect(result.loginAsUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'owner', version: 0 }), expect.objectContaining({ sub: 'owner' }), expect.objectContaining({ accountId: 'owner' }));
    expect(result.setAuthState).not.toHaveBeenCalledWith('register'); expect(await new DurableOutbox().list('owner')).toHaveLength(1);
  });
  it('does not infer ownership from a matching email in a legacy snapshot', async () => {
    const raw = JSON.stringify([userProfile('other', { email: 'same@example.test', googleSub: 'other' })]);
    localStorage.setItem('fitfocus_data_other_all_users', raw);
    const result = await start(new Response('{"profile":null}'), true);
    expect(result.loginAsUser).not.toHaveBeenCalled(); expect(result.setAuthState).toHaveBeenCalledWith('register');
    expect(localStorage.getItem('fitfocus_data_other_all_users')).toBe(raw);
  });
  it('retains an unowned IDB profile for recovery instead of adopting its key or offering registration', async () => {
    const key = 'fitfocus_data_owner_profile'; const raw = JSON.stringify(userProfile('owner'));
    const db = await userStateDatabase.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('values', 'readwrite');
      tx.objectStore('values').put({ key, value: raw, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    const result = await start(new Response('{"profile":null}'), true);
    expect(result.loginAsUser).not.toHaveBeenCalled(); expect(result.setAuthState).toHaveBeenCalledWith('auth_choice');
    expect((await new DurableOutbox().snapshot('owner', key)).value).toBe(raw);
    expect(await new DurableOutbox().list('owner')).toEqual([]);
  });
  it.each([401, 403])('does not activate a local login after bootstrap revoked session/access with %i', async status => {
    await new UserStateRepository('owner').writeJson('profile', userProfile('owner'));
    const result = await start(new Response('{}', { status }), true);
    expect(result.loginAsUser).not.toHaveBeenCalled(); expect(result.setAuthState).toHaveBeenCalledWith('auth_choice');
  });
  it('does not offer new registration when the server profile result is malformed', async () => {
    const result = await start(new Response('{}'), true);
    expect(result.loginAsUser).not.toHaveBeenCalled(); expect(result.setAuthState).toHaveBeenCalledWith('auth_choice');
  });
});
