import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: { sub: 'family-account', sid: 'private-family-session', roles: ['user'] }, ensure: vi.fn() }));
vi.mock('../functions/api/_lib/auth', async original => ({
  ...await original<typeof import('../functions/api/_lib/auth')>(), requireUser: async () => mocks.user,
}));
vi.mock('../functions/api/_lib/db', async original => ({
  ...await original<typeof import('../functions/api/_lib/db')>(), ensureUserRow: mocks.ensure,
}));
import { onRequestGet as read, onRequestPost as create } from '../functions/api/family/index';
import { onRequestPost as invite } from '../functions/api/family/invite';
import { onRequestPost as join } from '../functions/api/family/join';
import { onRequestPatch as member } from '../functions/api/family/member';
import { onRequestGet as menuRead, onRequestPost as menuSave } from '../functions/api/family/menu';
import { onRequestPost as generate } from '../functions/api/family/menu/generate';
import { onRequestGet as shopping } from '../functions/api/shopping/list';
import { onRequestPatch as check } from '../functions/api/shopping/check';
import { stateSessionId } from '../functions/api/_lib/state_session';

const handlers = [read, create, invite, join, member, menuRead, menuSave, generate, shopping, check];
beforeEach(() => { vi.clearAllMocks(); mocks.user = { sub: 'family-account', sid: 'private-family-session', roles: ['user'] }; });

it.each(handlers.map((handler, index) => ({ handler, index })))('rejects a changed cookie before family effects (handler $index)', async ({ handler }) => {
  const session = await stateSessionId(mocks.user);
  mocks.user.sid = 'another-login-for-the-same-account';
  const prepare = vi.fn(() => { throw new Error('Must not access application data'); });
  const response = await handler({ request: new Request('https://example.test/api/family', {
    method: 'POST', headers: { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': session },
  }), env: { DB: { prepare } } } as unknown as Parameters<typeof handler>[0]);
  expect(response.status).toBe(401);
  expect(mocks.ensure).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  expect(response.headers.get('X-FitFocus-Family-Protocol')).toBe('1');
  expect(response.headers.get('X-FitFocus-State-Session')).toBe(session);
  expect(await response.text()).not.toContain(mocks.user.sid);
});

it.each(['account', 'account-only', 'session-only', 'malformed'])('rejects %s family scope before writes', async kind => {
  const headers: Record<string, string> = { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': await stateSessionId(mocks.user) };
  if (kind === 'account') mocks.user.sub = 'different-account';
  if (kind === 'account-only') delete headers['X-FitFocus-State-Session'];
  if (kind === 'session-only') delete headers['X-FitFocus-State-Account'];
  if (kind === 'malformed') headers['X-FitFocus-State-Session'] = 'broken';
  const response = await create({ request: new Request('https://example.test/api/family', { method: 'POST', headers }), env: {} } as Parameters<typeof create>[0]);
  expect(response.status).toBe(401); expect(mocks.ensure).not.toHaveBeenCalled();
});
