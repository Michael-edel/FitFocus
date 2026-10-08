import { describe, expect, it, vi } from 'vitest';
import { bootstrapAuthSession, consumeOAuthContinuationState, ensureInviteCodeIsValid } from '../authSession';

function requestIdFromCall(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers).get('X-Request-ID');
}

describe('auth session transport', () => {
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
