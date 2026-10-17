import { describe, expect, it, vi } from 'vitest';
import { createLogoutSession, deleteAccountSession } from '../authSession';

const guard = {
  accountId: 'user-1',
  serverSessionId: 'a'.repeat(64),
  sessionEpoch: 'session-epoch-1',
  authFence: 1,
};

describe('createLogoutSession', () => {
  it('ignores an old logout callback after the local session changes', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const setGoogleMe = vi.fn();
    const setAuthState = vi.fn();
    const logout = createLogoutSession({
      googleSub: 'user-1',
      loginGuard: guard,
      assertCurrentSession: async () => { throw new Error('LOGIN_SESSION_CHANGED'); },
      fetchImpl,
      setGoogleMe,
      setAuthState,
    });

    await logout();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(setGoogleMe).not.toHaveBeenCalled();
    expect(setAuthState).not.toHaveBeenCalled();
  });

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
      loginGuard: guard,
      assertCurrentSession: async () => {},
      fetchImpl,
      setGoogleMe,
      setCurrentUser,
      setProfileSyncState,
      setLastProfileSyncAt,
      setAuthState,
    });

    const logoutPromise = logout();
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/api/logout', expect.objectContaining({
      headers: {
        'X-FitFocus-State-Account': guard.accountId,
        'X-FitFocus-State-Session': guard.serverSessionId,
      },
    }));
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
  it('logs out the confirmed session before clearing its local account data', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200, headers: {
      'X-FitFocus-Account-Delete-Protocol': '1',
      'X-FitFocus-Account-Delete-Guard': '1',
      'X-FitFocus-State-Account': guard.accountId,
      'X-FitFocus-State-Session': guard.serverSessionId,
    } })));
    const clearLocalData = vi.fn();
    const onLogout = vi.fn();

    await deleteAccountSession({
      googleSub: 'user-1',
      loginGuard: guard,
      assertCurrentSession: async () => {},
      confirmFn: () => 'DELETE',
      fetchImpl,
      clearLocalData,
      onLogout,
    });

    expect(fetchImpl).toHaveBeenCalledWith('/api/account/delete', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'X-FitFocus-State-Account': guard.accountId,
        'X-FitFocus-State-Session': guard.serverSessionId,
      }),
    }));
    expect(clearLocalData).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLogout.mock.invocationCallOrder[0]).toBeLessThan(clearLocalData.mock.invocationCallOrder[0]);
  });

  it('does not log out after the active session changes during confirmation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
    const assertCurrentSession = vi.fn<() => Promise<void>>()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('LOGIN_SESSION_CHANGED'));
    const clearLocalData = vi.fn();
    const onLogout = vi.fn();
    const originalAlert = globalThis.alert;
    globalThis.alert = vi.fn();

    try {
      await deleteAccountSession({
        googleSub: 'user-1',
        loginGuard: guard,
        assertCurrentSession,
        confirmFn: () => 'DELETE',
        fetchImpl,
        clearLocalData,
        onLogout,
      });
    } finally {
      globalThis.alert = originalAlert;
    }

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(clearLocalData).not.toHaveBeenCalled();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('waits for scoped logout before finishing durable local cleanup', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200, headers: {
      'X-FitFocus-Account-Delete-Protocol': '1',
      'X-FitFocus-Account-Delete-Guard': '1',
      'X-FitFocus-State-Account': guard.accountId,
      'X-FitFocus-State-Session': guard.serverSessionId,
    } })));
    let finishCleanup: () => void = () => {};
    const clearLocalData = vi.fn(() => new Promise<void>((resolve) => { finishCleanup = resolve; }));
    let finishLogout: () => void = () => {};
    const onLogout = vi.fn(() => new Promise<void>((resolve) => { finishLogout = resolve; }));

    const deletion = deleteAccountSession({
      googleSub: 'user-1',
      loginGuard: guard,
      assertCurrentSession: async () => {},
      confirmFn: () => 'DELETE',
      fetchImpl,
      clearLocalData,
      onLogout,
    });

    await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(clearLocalData).not.toHaveBeenCalled();

    finishLogout();
    await vi.waitFor(() => expect(clearLocalData).toHaveBeenCalledTimes(1));
    expect(clearLocalData).toHaveBeenCalledTimes(1);

    finishCleanup();
    await deletion;
    expect(clearLocalData).toHaveBeenCalledTimes(1);
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
        loginGuard: guard,
        assertCurrentSession: async () => {},
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

  it('explains that the user must sign in again when the server rejects the session scope', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({ error: 'UNAUTH' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })));
    const clearLocalData = vi.fn();
    const onLogout = vi.fn();
    const alert = vi.fn();
    const originalAlert = globalThis.alert;
    globalThis.alert = alert;

    try {
      await deleteAccountSession({
        googleSub: 'user-1',
        loginGuard: guard,
        assertCurrentSession: async () => {},
        confirmFn: () => 'DELETE',
        fetchImpl,
        clearLocalData,
        onLogout,
      });
    } finally {
      globalThis.alert = originalAlert;
    }

    expect(alert).toHaveBeenCalledWith('Сессия изменилась или истекла. Войдите снова и повторите удаление аккаунта.');
    expect(clearLocalData).not.toHaveBeenCalled();
    expect(onLogout).not.toHaveBeenCalled();
  });
});
