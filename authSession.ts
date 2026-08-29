import type { UserProfile } from './types';
import type { RegistrationData } from './RegistrationScreen';
import { applyRemoteStateItems, normalizeUserProfiles, readStoredAllUsersSnapshot } from './storage/hybrid';
import { isUserProfilePayload } from './profileValidation';

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
  loginAsUser: (user: UserProfile, authUser?: ServerUser | null) => Promise<void>;
  continueAfterOAuth?: boolean;
  fetchImpl?: typeof fetch;
};

type InviteCheckParams = Pick<AuthStateSetters, 'setInviteError' | 'setInviteChecking'> & {
  requireInvite: boolean;
  inviteCode: string;
  fetchImpl?: typeof fetch;
};

type LogoutParams = Pick<AuthStateSetters, 'setGoogleMe' | 'setCurrentUser' | 'setProfileSyncState' | 'setLastProfileSyncAt' | 'setAuthState'> & {
  googleSub?: string | null;
  fetchImpl?: typeof fetch;
};

type DeleteAccountParams = {
  googleSub?: string | null;
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

function scoreStoredProfile(profile: UserProfile, serverUser: ServerUser | null | undefined): number {
  let score = 0;
  if (serverUser?.sub && profile.googleSub && profile.googleSub === serverUser.sub) score += 1000;
  if (serverUser?.email && profile.email && profile.email.toLowerCase() === serverUser.email.toLowerCase()) score += 500;
  if (profile.googleSub) score += 100;
  if (profile.email) score += 25;
  if (profile.aiPlan) score += 15;
  score += Math.min(30, (profile.weightHistory?.length || 0) * 3);
  score += Math.min(30, (profile.measurementsHistory?.length || 0) * 3);
  score += Math.min(10, (profile.tasks?.length || 0));
  score += Math.min(10, (profile.courseProgress?.completedLessonIds?.length || 0));
  return score;
}

function pickBestStoredProfile(all: UserProfile[], serverUser: ServerUser | null | undefined): UserProfile | null {
  if (!Array.isArray(all) || !all.length) return null;
  const targeted = serverUser?.sub || serverUser?.email
    ? all.filter((profile) => {
        if (serverUser?.sub && profile.googleSub && profile.googleSub === serverUser.sub) return true;
        if (serverUser?.email && profile.email && profile.email.toLowerCase() === serverUser.email.toLowerCase()) return true;
        return false;
      })
    : all;
  if (!targeted.length) return null;
  return [...targeted].sort((a, b) => scoreStoredProfile(b, serverUser) - scoreStoredProfile(a, serverUser))[0] || null;
}

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

export function clearOAuthContinuationState(): void {
  try {
    sessionStorage.removeItem('fitfocus.auth.pending-oauth.v1');
  } catch {}
  clearAuthRecoveryReloadMarker();
}

export async function bootstrapAuthSession(params: BootstrapAuthParams): Promise<void> {
  const fetchFn = params.fetchImpl ?? fetch;

  const readMe = async (): Promise<MeResponse | null> => {
    try {
      const r = await fetchFn(`/api/me?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' });
      if (r.ok) return toMeResponse(await r.json());
    } catch {}
    return null;
  };

  let me = await readMe();
  if (!me?.user?.sub && params.continueAfterOAuth) {
    const delays = [150, 250, 400, 600, 900, 1200, 1600, 2200];
    for (const delay of delays) {
      try {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch {}
      me = await readMe();
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
    clearAuthRecoveryReloadMarker();
    try {
      const pr = await fetchFn('/api/bootstrap', { credentials: 'include' });
      const pj = await readJsonRecord(pr);
      if (pr.ok) {
        applyRemoteStateItems(pj?.items);
        const profile = isUserProfilePayload(pj?.profile) ? pj.profile : null;
        if (profile) {
          params.setAllUsers(normalizeUserProfiles([profile]));
          await params.loginAsUser(profile, serverUser);
          return;
        }
      }
    } catch {}

    if (!params.continueAfterOAuth) {
      params.setAuthState('auth_choice');
      return;
    }

    try {
      const all = readStoredAllUsersSnapshot<UserProfile>();
      if (Array.isArray(all) && all.length > 0) {
        const normalized = normalizeUserProfiles(all);
        params.setAllUsers(normalized);
        const localProfile = pickBestStoredProfile(normalized, serverUser);
        if (localProfile) {
          await params.loginAsUser(localProfile, serverUser);
          return;
        }
      }
    } catch {}

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
  params.setInviteChecking?.(true);
  params.setInviteError(null);
  try {
    const r = await fetchFn('/api/invite/validate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code }),
    });
    const j = await readJsonRecord(r);
    if (!r.ok || j?.valid !== true) {
      params.setInviteError('Код приглашения недействителен или уже использован.');
      return false;
    }
    return true;
  } catch {
    params.setInviteError('Не удалось проверить код приглашения. Проверьте сервер.');
    return false;
  } finally {
    params.setInviteChecking?.(false);
  }
}

export function createLogoutSession(params: LogoutParams) {
  let serverLogoutInFlight: Promise<void> | null = null;

  const clearClientSession = () => {
    clearOAuthContinuationState();

    params.setGoogleMe(null);
    params.setCurrentUser?.(null);
    params.setProfileSyncState?.('idle');
    params.setLastProfileSyncAt?.(null);
    params.setAuthState('auth_choice');
  };

  const sendServerLogout = async () => {
    const fetchFn = params.fetchImpl ?? fetch;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS) : null;
    try {
      await fetchFn('/api/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        keepalive: true,
        signal: controller?.signal,
      });
    } catch {
      // Local logout is authoritative for the UI; server cleanup is best effort.
    } finally {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    }
  };

  return async () => {
    clearClientSession();

    if (!params.googleSub) return;
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
  const confirmFn = params.confirmFn ?? globalThis.prompt;
  const typed = (confirmFn?.('Чтобы удалить аккаунт, введите слово DELETE (латиницей).') || '').trim().toUpperCase();
  if (typed !== 'DELETE') return;

  const fetchFn = params.fetchImpl ?? fetch;
  try {
    const r = await fetchFn('/api/account/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });

    if (!r.ok) {
      const j = await readJsonRecord(r);
      const error = typeof j?.error === 'string' ? j.error : null;
      alert(error ? `Ошибка удаления: ${error}` : 'Не удалось удалить аккаунт.');
      return;
    }
  } catch {
    alert('Не удалось удалить аккаунт (network).');
    return;
  }

  await params.clearLocalData?.();
  await params.onLogout();
}
