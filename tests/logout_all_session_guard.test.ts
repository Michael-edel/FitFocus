import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: { sub: 'account-a', sid: 'private-session-id', emailVerified: true, roles: ['admin'] },
  revoke: vi.fn(async () => {}),
}));
vi.mock('../functions/api/_lib/auth', async (original) => ({
  ...await original<typeof import('../functions/api/_lib/auth')>(),
  requireUser: vi.fn(async () => mocks.user),
}));
vi.mock('../functions/api/_lib/session_revocation', () => ({ revokeAllUserSessions: mocks.revoke }));
import { onRequestPost } from '../functions/api/logout_all';
import { requireUser } from '../functions/api/_lib/auth';
import { stateSessionId } from '../functions/api/_lib/state_session';

const env = { DB: {} as D1Database, AUTH_JWT_SECRET: 'test-only' };
const invoke = (request: Request) => onRequestPost({ request, env } as unknown as Parameters<typeof onRequestPost>[0]);

beforeEach(() => { mocks.user.sid = 'private-session-id'; vi.clearAllMocks(); });

it.each([
  ['missing proof', {}],
  ['partial proof', { 'X-FitFocus-State-Account': 'account-a' }],
])('requires a complete session proof for logout-all (%s)', async (_label, proofHeaders) => {
  const response = await invoke(new Request('https://example.test/api/logout_all', {
    method: 'POST', headers: { Cookie: 'ff_session=valid-cookie', ...proofHeaders },
  }));

  expect(response.status).toBe(401);
  expect(response.headers.get('X-FitFocus-Admin-Protocol')).toBe('1');
  expect(response.headers.get('X-FitFocus-Admin-Guard')).toBe('1');
  expect(response.headers.has('Set-Cookie')).toBe(false);
  expect(vi.mocked(requireUser)).not.toHaveBeenCalled();
  expect(mocks.revoke).not.toHaveBeenCalled();
});

it('rejects a logout-all request scoped to another session before revoking sessions', async () => {
  const response = await invoke(new Request('https://example.test/api/logout_all', {
    method: 'POST', headers: {
      'X-FitFocus-State-Account': 'account-b',
      'X-FitFocus-State-Session': 'b'.repeat(64),
    },
  }));
  expect(response.status).toBe(401);
  expect(mocks.revoke).not.toHaveBeenCalled();
  expect(response.headers.get('X-FitFocus-Admin-Protocol')).toBe('1');
});

it('echoes matching session proof on logout-all responses', async () => {
  const request = new Request('https://example.test/api/logout_all', {
    method: 'POST', headers: {
      'X-FitFocus-State-Account': mocks.user.sub,
      'X-FitFocus-State-Session': await stateSessionId(mocks.user),
    },
  });
  const response = await invoke(request);
  expect(response.status).toBe(200);
  expect(mocks.revoke).toHaveBeenCalledOnce();
  expect(response.headers.get('X-FitFocus-State-Account')).toBe(mocks.user.sub);
  expect(response.headers.get('X-FitFocus-State-Session')).toBe(request.headers.get('X-FitFocus-State-Session'));
});
