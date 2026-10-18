import type { UserProfile } from './types';
import type { RegistrationData } from './RegistrationScreen';
import { normalizeUserProfiles } from './storage/hybrid';
import { readOwnedProfile } from './storage/profileState';
import { UserStateRepository } from './storage/userStateRepository';
import { isUserProfilePayload } from './profileValidation';
import { fetchWithResilience, HttpRequestError } from './services/httpClient';
import { listenForPageExit } from './storage/sessionTransport';
import type { OutboxReadGuard } from './storage/durableOutbox';
import { verifyReadSession, readScopedJson, assertReadSession, SessionReadError } from './storage/sessionRead';

type ServerUser = { sub?: string; email?: string; name?: string; picture?: string; roles?: string[] };
type UnknownRecord = Record<string, unknown>;
type MeResponse = { user: ServerUser | null; hasAccess?: boolean };

type AuthStateSetters = {
  setGoogleMe: (user: ServerUser | null) => void;
  setInviteError: (value: string | null) => void;
  setInviteChecking?: (value: boolean) => void;
  setRequireInvite?: (value: boolean) => void;
  setAuthState: (value: 'auth_choice' | 'register' | 'app') => void;
  setAllUsers: (value: UserProfile[]) => void;
  setRegData: (updater: (prev: RegistrationData) => RegistrationData) => void;
  setCurrentUser?: (user: UserProfile | null) => void;
  setProfileSyncState?: (value: 'idle' | 'saving' | 'saved' | 'error') => void;
  setLastProfileSyncAt?: (value: number | null) => void;
};

type BootstrapAuthParams = AuthStateSetters & {
  requireInvite: boolean;
  loginAsUser: (user: UserProfile, authUser?: ServerUser | null, readGuard?: OutboxReadGuard) => Promise<void>;
  continueAfterOAuth?: boolean;
  fetchImpl?: typeof fetch;
  isCurrentSession?: () => boolean;
};

type InviteCheckParams = Pick<AuthStateSetters, 'setInviteError' | 'setInviteChecking'> & {
  requireInvite: boolean;
  inviteCode: string;
  fetchImpl?: typeof fetch;
};

type LogoutParams = Pick<AuthStateSetters, 'setGoogleMe' | 'setCurrentUser' | 'setProfileSyncState' | 'setLastProfileSyncAt' | 'setAuthState'> & {
  onClearLocalSession?: () => void;
  googleSub?: string | null;
  loginGuard?: OutboxReadGuard | null;
  assertCurrentSession?: () => Promise<void>;
  fetchImpl?: typeof fetch;
};

type DeleteAccountParams = {
  googleSub?: string | null;
  loginGuard?: OutboxReadGuard | null;
  assertCurrentSession?: () => Promise<void>;
  confirmFn?: (message: string) => string | null;
  fetchImpl?: typeof fetch;
  clearLocalData?: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
};

const LOGOUT_TIMEOUT_MS = 5_000;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toServerUser = (value: unknown): ServerUser | null => {
  if (!isRecord(value)) return null;
  const roles = Array.isArray(value.roles) ? value.roles.map(String).filter(Boolean) : undefined;
  return {
    sub: typeof value.sub === 'string' ? value.sub : undefined,
    email: typeof value.email === 'string' ? value.email : undefined,
    name: typeof value.name === 'string' ? value.name : undefined,
    picture: typeof value.picture === 'string' ? value.picture : undefined,
    roles,
  };
};

const toMeResponse = (value: unknown): MeResponse | null => {
  if (!isRecord(value)) return null;
  return {
    user: toServerUser(value.user),
    hasAccess: typeof value.hasAccess === 'boolean' ? value.hasAccess : undefined,
  };
};

const readJsonRecord = async (response: Response): Promise<UnknownRecord | null> => {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
};

function authRecoveryReloadKey() {
  return 'fitfocus.auth.oauth-recovery-reloaded.v1';
}

function hasReloadedForAuthRecovery(): boolean {
  try {
    return sessionStorage.getItem(authRecoveryReloadKey()) === '1';
  } catch {
    return true;
  }
}

function markReloadedForAuthRecovery(): void {
  try {
    sessionStorage.setItem(authRecoveryReloadKey(), '1');
  } catch {}
}

function clearAuthRecoveryReloadMarker(): void {
  try {
    sessionStorage.removeItem(authRecoveryReloadKey());
  } catch {}
}

const OAUTH_CONTINUATION_STORAGE_KEY = 'fitfocus.auth.pending-oauth.v1';

/** Reads and normalizes the post-OAuth continuation marker, then removes auth from the visible URL. */
export function consumeOAuthContinuationState(): boolean {
  let continueAfterOAuth = false;
  try {
    continueAfterOAuth = sessionStorage.getItem(OAUTH_CONTINUATION_STORAGE_KEY) === '1';
  } catch {}
  try {
    const url = new URL(window.location.href);
    const auth = url.searchParams.get('auth');
    if (auth === 'google' || auth === 'apple') {
      continueAfterOAuth = true;
      try { sessionStorage.setItem(OAUTH_CONTINUATION_STORAGE_KEY, '1'); } catch {}
      url.searchParams.delete('auth');
      window.history.replaceState({}, '', url.toString());
    }
  } catch {}
  return continueAfterOAuth;
}

export function clearOAuthContinuationState(): void {
  try {
    sessionStorage.removeItem(OAUTH_CONTINUATION_STORAGE_KEY);
  } catch {}
  clearAuthRecoveryReloadMarker();
}

export async function bootstrapAuthSession(params: BootstrapAuthParams): Promise<void> {
  const fetchFn = params.fetchImpl ?? fetch;
  const isCurrent = params.isCurrentSession ?? (() => true);
  if (!isCurrent()) return;

  let readGuard: OutboxReadGuard | null = null;
  const readMe = async (): Promise<MeResponse | null> => {
    try {
      const result = await verifyReadSession({ bootstrap: true, fetchImpl: fetchFn, isCurrentSession: isCurrent });
      readGuard = result.guard;
      return toMeResponse(result.body);
    } catch {}
    return null;
  };

  let me = await readMe();
  if (!isCurrent()) return;
  if (!me?.user?.sub && params.continueAfterOAuth) {
    const delays = [150, 250, 400, 600, 900, 1200, 1600, 2200];
    for (const delay of delays) {
      try {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch {}
      if (!isCurrent()) return;
      me = await readMe();
      if (!isCurrent()) return;
      if (me?.user?.sub) break;
    }
  }

  const serverUser: ServerUser | null = me?.user || null;
  const hasServerAccess = me?.hasAccess !== false;
  params.setGoogleMe(serverUser);

  if (serverUser?.sub && params.requireInvite && !hasServerAccess) {
    params.setInviteError('Для доступа к закрытой бете нужен действующий код приглашения. Введите код и повторите вход через Google или Apple.');
    params.setAuthState('auth_choice');
    return;
  }

  if (serverUser?.sub) {
    if (!readGuard) {
      params.setInviteError('Не удалось подтвердить протокол загрузки и сессию. Повторите вход после обновления сервера.');
      params.setAuthState('auth_choice');
      return;
    }
    const bootstrapGuard = readGuard;
    clearAuthRecoveryReloadMarker();
    let confirmedAbsent = false;
    try {
      const { response: pr, body: pj } = await readScopedJson('/api/bootstrap', bootstrapGuard, 'bootstrap', {
        fetchImpl: fetchFn, isCurrentSession: isCurrent,
      });
      if (!isCurrent()) return;
      if (pr.status === 401 || pr.status === 403) {
        params.setInviteError('Сессия или доступ изменились. Повторите вход.');
        params.setAuthState('auth_choice');
        return;
      }
      if (pr.ok) {
        confirmedAbsent = pj?.profile === null;
        const profile = isUserProfilePayload(pj?.profile) && pj.profile.id === serverUser.sub
          && typeof pj.profile.version === 'number' && Number.isSafeInteger(pj.profile.version) && pj.profile.version > 0 ? pj.profile : null;
        if (profile) {
          await assertReadSession(bootstrapGuard, { isCurrentSession: isCurrent });
          params.setAllUsers(normalizeUserProfiles([profile]));
          await params.loginAsUser(profile, serverUser, bootstrapGuard);
          return;
        }
        if (!confirmedAbsent) {
          params.setInviteError('Сервер вернул профиль без подтверждённого владельца. Повторите вход.');
          params.setAuthState('auth_choice');
          return;
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof SessionReadError || error instanceof Error && error.message === 'LOGIN_SESSION_CHANGED') {
        params.setInviteError(error instanceof SessionReadError && error.kind !== 'session'
          ? 'Сессия, доступ или протокол загрузки изменились. Повторите вход.'
          : 'Сессия изменилась во время загрузки. Повторите вход.');
        params.setAuthState('auth_choice');
        return;
      }
    }
    if (!isCurrent()) return;

    try {
      await assertReadSession(bootstrapGuard, { isCurrentSession: isCurrent });
      const localProfile = await readOwnedProfile(new UserStateRepository(serverUser.sub));
      await assertReadSession(bootstrapGuard, { isCurrentSession: isCurrent });
      if (!isCurrent()) return;
      if (localProfile) {
        params.setAllUsers([localProfile]);
        await params.loginAsUser(localProfile, serverUser, bootstrapGuard);
        return;
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof SessionReadError || error instanceof Error && error.message === 'LOGIN_SESSION_CHANGED') {
        params.setInviteError('Сессия изменилась во время загрузки. Повторите вход.');
        params.setAuthState('auth_choice');
        return;
      }
      params.setInviteError('Не удалось прочитать локальный профиль. Проверьте доступ к хранилищу и повторите вход.');
      params.setAuthState('auth_choice');
      return;
    }
    if (!isCurrent()) return;
    if (!confirmedAbsent || !params.continueAfterOAuth) {
      if (!confirmedAbsent) params.setInviteError('Не удалось проверить профиль. Повторите вход после восстановления соединения.');
      params.setAuthState('auth_choice');
      return;
    }

    params.setRegData(prev => ({ ...prev, name: serverUser?.name || prev.name }));
    params.setAuthState('register');
    return;
  }

  if (params.continueAfterOAuth && !hasReloadedForAuthRecovery()) {
    markReloadedForAuthRecovery();
    window.location.replace(window.location.href);
    return;
  }

  params.setAllUsers([]);
  params.setAuthState('auth_choice');
}

export async function ensureInviteCodeIsValid(params: InviteCheckParams): Promise<boolean> {
  if (!params.requireInvite) return true;
  const code = String(params.inviteCode || '').trim();
  if (!code) {
    params.setInviteError('Введите код приглашения для доступа к бете.');
    return false;
  }

  const fetchFn = params.fetchImpl ?? fetch;
  const controller = new AbortController();
  let active = true;
  const removePageExit = listenForPageExit(() => {
    active = false;
    controller.abort();
  });
  params.setInviteChecking?.(true);
  params.setInviteError(null);
  try {
    const r = await fetchWithResilience('/api/invite/validate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code }),
      signal: controller.signal,
    }, {
      fetchImpl: fetchFn,
    });
    if (!active) return false;
    const j = await readJsonRecord(r);
    if (!active) return false;
    if (!r.ok || j?.valid !== true) {
      params.setInviteError('Код приглашения недействителен или уже использован.');
      return false;
    }
    return true;
  } catch (error) {
    if (!active || (error instanceof HttpRequestError && error.kind === 'aborted')) return false;
    params.setInviteError('Не удалось проверить код приглашения. Проверьте сервер.');
    return false;
  } finally {
    removePageExit();
    if (active) params.setInviteChecking?.(false);
  }
}

export function createLogoutSession(params: LogoutParams) {
  let serverLogoutInFlight: Promise<void> | null = null;
  let logoutStarted = false;

  const clearClientSession = () => {
    params.onClearLocalSession?.();
    clearOAuthContinuationState();

    params.setGoogleMe(null);
    params.setCurrentUser?.(null);
    params.setProfileSyncState?.('idle');
    params.setLastProfileSyncAt?.(null);
    params.setAuthState('auth_choice');
  };

  const sendServerLogout = async () => {
    const fetchFn = params.fetchImpl ?? fetch;
    const guard = params.loginGuard;
    if (!guard || guard.accountId !== params.googleSub) return;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS) : null;
    try {
      await fetchFn('/api/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        keepalive: true,
        headers: {
          'X-FitFocus-State-Account': guard.accountId,
          'X-FitFocus-State-Session': guard.serverSessionId,
        },
        signal: controller?.signal,
      });
    } catch {
      // Local logout is authoritative for the UI; server cleanup is best effort.
    } finally {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    }
  };

  return async () => {
    if (logoutStarted) {
      await serverLogoutInFlight;
      return;
    }
    const guard = params.loginGuard;
    if (params.googleSub && (!guard || guard.accountId !== params.googleSub)) return;
    if (guard) {
      try {
        if (params.assertCurrentSession) await params.assertCurrentSession();
        else await assertReadSession(guard);
      } catch {
        return;
      }
    }
    if (logoutStarted) {
      await serverLogoutInFlight;
      return;
    }
    logoutStarted = true;
    clearClientSession();

    if (!params.googleSub) return;
    if (!guard) return;
    if (!serverLogoutInFlight) {
      serverLogoutInFlight = sendServerLogout().finally(() => {
        serverLogoutInFlight = null;
      });
    }
    await serverLogoutInFlight;
  };
}

export async function deleteAccountSession(params: DeleteAccountParams): Promise<void> {
  if (!params.googleSub) return;
  const guard = params.loginGuard;
  if (!guard || guard.accountId !== params.googleSub) {
    alert('Сессия изменилась. Обновите страницу и войдите снова перед удалением аккаунта.');
    return;
  }

  const assertCurrent = params.assertCurrentSession ?? (() => assertReadSession(guard));
  try {
    await assertCurrent();
  } catch {
    alert('Сессия изменилась. Обновите страницу и войдите снова перед удалением аккаунта.');
    return;
  }

  const confirmFn = params.confirmFn ?? globalThis.prompt;
  const typed = (confirmFn?.('Чтобы удалить аккаунт, введите слово DELETE (латиницей).') || '').trim().toUpperCase();
  if (typed !== 'DELETE') return;

  const fetchFn = params.fetchImpl ?? fetch;
  try {
    await assertCurrent();
    const r = await fetchFn('/api/account/delete', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-FitFocus-State-Account': guard.accountId,
        'X-FitFocus-State-Session': guard.serverSessionId,
      },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });

    if (!r.ok) {
      const j = await readJsonRecord(r);
      const error = typeof j?.error === 'string' ? j.error : null;
      alert(error === 'UNAUTH'
        ? 'Сессия изменилась или истекла. Войдите снова и повторите удаление аккаунта.'
        : error ? `Ошибка удаления: ${error}` : 'Не удалось удалить аккаунт.');
      return;
    }

    if (r.headers.get('X-FitFocus-Account-Delete-Protocol') !== '1'
      || r.headers.get('X-FitFocus-Account-Delete-Guard') !== '1'
      || r.headers.get('X-FitFocus-State-Account') !== guard.accountId
      || r.headers.get('X-FitFocus-State-Session') !== guard.serverSessionId) {
      alert('Сервер не подтвердил удаление в текущей сессии. Обновите страницу и проверьте состояние аккаунта.');
      return;
    }
  } catch {
    alert('Не удалось удалить аккаунт (network).');
    return;
  }

  try {
    await assertCurrent();
  } catch {
    // Deletion belongs to the captured account, so its local data can still be
    // cleared. Do not run the captured logout callback against a newer session.
    await params.clearLocalData?.();
    return;
  }
  await params.onLogout();
  await params.clearLocalData?.();
}
