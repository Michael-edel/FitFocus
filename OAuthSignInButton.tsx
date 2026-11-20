import { Apple } from 'lucide-react';

export type OAuthProvider = 'google' | 'apple';

type OAuthSignInButtonProps = {
  inviteCode?: string;
  provider: OAuthProvider;
};

export default function OAuthSignInButton({ inviteCode, provider }: OAuthSignInButtonProps) {
  const params = new URLSearchParams({ redirect: window.location.origin });
  if (inviteCode) params.set('invite', inviteCode);

  return (
    <a
      href={`/api/auth/${provider}/start?${params.toString()}`}
      target="_top"
      rel="noreferrer"
      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
    >
      {provider === 'google' ? (
        <img src="/google-g.svg" alt="" className="size-5 rounded-full bg-white p-0.5" />
      ) : (
        <Apple size={16} aria-hidden="true" />
      )}
      <span>{provider === 'google' ? 'Войти через Google' : 'Войти через Apple'}</span>
    </a>
  );
}
