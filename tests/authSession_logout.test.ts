import { describe, expect, it, vi } from 'vitest';
import { createLogoutSession, deleteAccountSession } from '../authSession';

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

describe('deleteAccountSession', () => {
  it('clears local account data before logging out after server deletion succeeds', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
    const clearLocalData = vi.fn();
    const onLogout = vi.fn();

    await deleteAccountSession({
      googleSub: 'user-1',
      confirmFn: () => 'DELETE',
      fetchImpl,
      clearLocalData,
      onLogout,
    });

    expect(fetchImpl).toHaveBeenCalledWith('/api/account/delete', expect.objectContaining({ method: 'POST' }));
    expect(clearLocalData).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(clearLocalData.mock.invocationCallOrder[0]).toBeLessThan(onLogout.mock.invocationCallOrder[0]);
  });

  it('does not clear local data when server deletion fails', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 500 })));
    const clearLocalData = vi.fn();
    const onLogout = vi.fn();
    const originalAlert = globalThis.alert;
    globalThis.alert = vi.fn();

    try {
      await deleteAccountSession({
        googleSub: 'user-1',
        confirmFn: () => 'DELETE',
        fetchImpl,
        clearLocalData,
        onLogout,
      });
    } finally {
      globalThis.alert = originalAlert;
    }

    expect(clearLocalData).not.toHaveBeenCalled();
    expect(onLogout).not.toHaveBeenCalled();
  });
});
