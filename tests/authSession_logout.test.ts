import { describe, expect, it, vi } from 'vitest';
import { createLogoutSession } from '../authSession';

describe('createLogoutSession', () => {
  it('clears the client session immediately while server logout is still pending', async () => {
    let resolveLogout: (response: Response) => void = () => {};
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
      resolveLogout = resolve;
    }));
    const setGoogleMe = vi.fn();
    const setCurrentUser = vi.fn();
    const setProfileSyncState = vi.fn();
    const setLastProfileSyncAt = vi.fn();
    const setAuthState = vi.fn();

    const logout = createLogoutSession({
      googleSub: 'user-1',
      fetchImpl,
      setGoogleMe,
      setCurrentUser,
      setProfileSyncState,
      setLastProfileSyncAt,
      setAuthState,
    });

    const logoutPromise = logout();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(setGoogleMe).toHaveBeenCalledWith(null);
    expect(setCurrentUser).toHaveBeenCalledWith(null);
    expect(setProfileSyncState).toHaveBeenCalledWith('idle');
    expect(setLastProfileSyncAt).toHaveBeenCalledWith(null);
    expect(setAuthState).toHaveBeenCalledWith('auth_choice');

    void logout();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveLogout(new Response(null, { status: 204 }));
    await logoutPromise;
  });
});
