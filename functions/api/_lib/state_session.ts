import { requireUser, type SessionUser } from './auth';

/** A public binding for one authenticated session, never the cookie or raw session id. */
export async function stateSessionId(user: Pick<SessionUser, 'sub' | 'sid'>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['state-session-v1', user.sub, user.sid])));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Opt-in guard closes the cookie-change race between /me and the state mutation. */
export async function requireStateUser(request: Request, env: Parameters<typeof requireUser>[1]): Promise<SessionUser> {
  const user = await requireUser(request, env);
  const account = request.headers.get('X-FitFocus-State-Account');
  const session = request.headers.get('X-FitFocus-State-Session');
  if ((account !== null || session !== null)
    && (account !== user.sub || session !== await stateSessionId(user))) throw new Error('STATE_SESSION_CHANGED');
  return user;
}
