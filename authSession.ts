import type { UserProfile } from './types';
import { applyRemoteStateItems, normalizeUserProfiles, readStoredAllUsersSnapshot } from './storage/hybrid';

type ServerUser = { sub?: string; email?: string; name?: string; picture?: string; roles?: string[] };

type AuthStateSetters = {
  setGoogleMe: (user: any) => void;
  setInviteError: (value: string | null) => void;
  setInviteChecking?: (value: boolean) => void;
  setRequireInvite?: (value: boolean) => void;
  setAuthState: (value: 'auth_choice' | 'register' | 'app') => void;
  setAllUsers: (value: UserProfile[]) => void;
  setRegData: (updater: (prev: any) => any) => void;
  setCurrentUser?: (user: UserProfile | null) => void;
  setProfileSyncState?: (value: 'idle' | 'saving' | 'saved' | 'error') => void;
  setLastProfileSyncAt?: (value: number | null) => void;
};

type BootstrapAuthParams = AuthStateSetters & {
  requireInvite: boolean;
  loginAsUser: (user: UserProfile, authUser?: ServerUser | null) => Promise<void>;
  continueAfterGoogle?: boolean;
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
  onLogout: () => void | Promise<void>;
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

export async function bootstrapAuthSession(params: BootstrapAuthParams): Promise<void> {
  const fetchFn = params.fetchImpl ?? fetch;

  const readMe = async () => {
    try {
      const r = await fetchFn('/api/me', { credentials: 'include', cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {}
    return null;
  };

  let me: any = await readMe();
  if (!me?.user?.sub && params.continueAfterGoogle) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch {}
    me = await readMe();
  }

  const serverUser: ServerUser | null = me?.user || null;
  const hasServerAccess = me?.hasAccess !== false;
  params.setGoogleMe(serverUser);

  if (serverUser?.sub && params.requireInvite && !hasServerAccess) {
    params.setInviteError('Для доступа к закрытой бете нужен действующий код приглашения. Введите код и повторите вход через Google.');
    params.setAuthState('auth_choice');
    return;
  }

  if (serverUser?.sub) {
    try {
      const pr = await fetchFn('/api/bootstrap', { credentials: 'include' });
      const pj = await pr.json().catch(() => null);
      if (pr.ok) {
        applyRemoteStateItems(pj?.items);
        const profile = pj?.profile || null;
        if (profile) {
          params.setAllUsers(normalizeUserProfiles([profile]));
          void params.loginAsUser(profile, serverUser);
          return;
        }
      }
    } catch {}

    if (!params.continueAfterGoogle) {
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
          void params.loginAsUser(localProfile, serverUser);
          return;
        }
      }
    } catch {}

    params.setRegData(prev => ({ ...prev, name: serverUser?.name || prev.name }));
    params.setAuthState('register');
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
    const r = await fetchFn(`/api/invite/validate?code=${encodeURIComponent(code)}`, { credentials: 'include' });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.valid) {
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
  return async () => {
    const fetchFn = params.fetchImpl ?? fetch;
    if (params.googleSub) {
      try {
        await fetchFn('/api/logout', { method: 'POST', credentials: 'include', cache: 'no-store' });
      } catch {}
    }

    try {
      sessionStorage.removeItem('fitfocus.auth.pending-google.v1');
    } catch {}

    params.setGoogleMe(null);
    params.setCurrentUser?.(null);
    params.setProfileSyncState?.('idle');
    params.setLastProfileSyncAt?.(null);
    params.setAuthState('auth_choice');
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
      const j = await r.json().catch(() => null);
      alert(j?.error ? `Ошибка удаления: ${j.error}` : 'Не удалось удалить аккаунт.');
      return;
    }
  } catch {
    alert('Не удалось удалить аккаунт (network).');
    return;
  }

  await params.onLogout();
}
