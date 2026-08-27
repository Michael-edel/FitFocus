import React from 'react';
import { Apple } from 'lucide-react';

const AUTH_PENDING_STORAGE_KEY = 'fitfocus.auth.pending-oauth.v1';

export type OAuthProvider = 'google' | 'apple';

type OAuthSignInButtonProps = {
  inviteCode?: string;
  provider: OAuthProvider;
};

export default function OAuthSignInButton({ inviteCode, provider }: OAuthSignInButtonProps) {
  const authUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    if (inviteCode) params.set('invite', inviteCode);
    params.set('redirect', window.location.origin);
    return `/api/auth/${provider}/start?${params.toString()}`;
  }, [inviteCode, provider]);

  const handleClick = React.useCallback(async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      sessionStorage.setItem(AUTH_PENDING_STORAGE_KEY, '1');
    } catch {}
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch {
      // Auth must continue even when the browser blocks service worker management.
    }
    window.location.assign(authUrl);
  }, [authUrl]);

  return (
    <a
      href={authUrl}
      target="_top"
      rel="noreferrer"
      onClick={handleClick}
      className="flex items-center gap-2 rounded-full px-4 py-2 border border-white/15 bg-white/5 hover:bg-white/10 active:bg-white/15 text-sm text-white/90"
    >
      {provider === 'google' ? (
        <img src="/google-g.svg" alt="Google" className="w-4 h-4" />
      ) : (
        <Apple size={16} className="text-white" />
      )}
      <span>{provider === 'google' ? 'Google профиль' : 'Apple профиль'}</span>
    </a>
  );
}
