import { requireUser, type SessionUser } from './auth';

/** A public binding for one authenticated session, never the cookie or raw session id. */
export async function stateSessionId(user: Pick<SessionUser, 'sub' | 'sid'>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['state-session-v1', user.sub, user.sid])));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Rejects a request whose optional public proof belongs to another login session. */
export async function assertStateRequestScope(user: Pick<SessionUser, 'sub' | 'sid'>, request: Request): Promise<void> {
  const account = request.headers.get('X-FitFocus-State-Account');
  const session = request.headers.get('X-FitFocus-State-Session');
  if ((account !== null || session !== null)
    && (account !== user.sub || session !== await stateSessionId(user))) throw new Error('STATE_SESSION_CHANGED');
}

function requireStateProofHeaders(request: Request): void {
  if (!request.headers.get('X-FitFocus-State-Account') || !request.headers.get('X-FitFocus-State-Session')) {
    throw new Error('STATE_SESSION_REQUIRED');
  }
}

/** Require both public proof headers, then verify that they belong to this login. */
export async function assertScopedStateRequestScope(user: Pick<SessionUser, 'sub' | 'sid'>, request: Request): Promise<void> {
  requireStateProofHeaders(request);
  await assertStateRequestScope(user, request);
}

/** Opt-in guard closes the cookie-change race between /me and the state mutation. */
export async function requireStateUser(request: Request, env: Parameters<typeof requireUser>[1]): Promise<SessionUser> {
  const user = await requireUser(request, env);
  await assertStateRequestScope(user, request);
  return user;
}

/** Scoped API actions must reject legacy requests without a session proof. */
export async function requireScopedStateUser(request: Request, env: Parameters<typeof requireUser>[1]): Promise<SessionUser> {
  requireStateProofHeaders(request);
  return requireStateUser(request, env);
}

/** A capability marker plus public scope lets a new client verify the guarded response. */
export function withSessionGuard(response: Response, request: Request, resource: 'AI' | 'Weekly-Menu' | 'Achievements' | 'Family' | 'Family-Menu' | 'Support' | 'Support-Attachment' | 'Mobile-Token' | 'Huawei' | 'Push' | 'Billing' | 'Admin' | 'Account-Delete' | 'Logout' | 'Export'): Response {
  response.headers.set(`X-FitFocus-${resource}-Protocol`, '1');
  response.headers.set(`X-FitFocus-${resource}-Guard`, '1');
  for (const header of ['X-FitFocus-State-Account', 'X-FitFocus-State-Session']) {
    const value = request.headers.get(header);
    if (value !== null) response.headers.set(header, value);
  }
  return response;
}
