import { beforeEach, expect, it, vi } from 'vitest';
import { userProfile } from './_helpers/userProfile';
const mocks = vi.hoisted(() => ({ user: { sub: 'account-a', sid: 'private-session-token', roles: ['user'] }, write: vi.fn(), read: vi.fn() }));
vi.mock('../functions/api/_lib/auth', async original => ({ ...await original<typeof import('../functions/api/_lib/auth')>(), requireUser: vi.fn(async () => mocks.user) }));
vi.mock('../functions/api/_lib/access', () => ({ requireBetaAccess: vi.fn(async () => {}) }));
vi.mock('../functions/api/_lib/profile_write', () => ({ writeProfile: mocks.write }));
vi.mock('../functions/api/_lib/profile_read', () => ({ loadCurrentProfile: mocks.read }));
import { stateSessionId } from '../functions/api/_lib/state_session';
import { onRequestGet, onRequestPut, onRequestPatch } from '../functions/api/profile';
const env = { DB: { prepare: vi.fn() }, AUTH_JWT_SECRET: 'test-only' };
const invoke = (handler: typeof onRequestPut, request: Request) => handler({ request, env } as unknown as Parameters<typeof handler>[0]) as Promise<Response>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { sub: 'account-a', sid: 'private-session-token', roles: ['user'] };
  mocks.write.mockResolvedValue({ kind: 'saved', profile: userProfile(), version: 2, updatedFields: ['name'], stateItems: 0, mode: 'replace' });
  mocks.read.mockResolvedValue(userProfile());
});
it.each(['GET', 'PUT', 'PATCH'])('rejects a changed cookie before profile %s work', async method => {
  const expected = { 'Content-Type': 'application/json', 'X-FitFocus-State-Account': mocks.user.sub,
    'X-FitFocus-State-Session': await stateSessionId(mocks.user) };
  mocks.user.sid = 'another-cookie';
  const response = await invoke(method === 'GET' ? onRequestGet : method === 'PUT' ? onRequestPut : onRequestPatch,
    new Request('https://example.test/api/profile', { method, headers: expected, ...(method === 'GET' ? {} : { body: '{"name":"new","baseVersion":1}' }) }));
  expect(response.status).toBe(401); expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it.each(['GET', 'PUT', 'PATCH'])('rejects unscoped legacy profile %s before reads, parsing, or writes', async method => {
  const response = await invoke(method === 'GET' ? onRequestGet : method === 'PUT' ? onRequestPut : onRequestPatch,
    new Request('https://example.test/api/profile', {
      method,
      ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: '{' }),
    }));
  expect(response.status).toBe(401);
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects wrong accounts and incomplete scope, and echoes a validated binding', async () => {
  const session = await stateSessionId(mocks.user);
  for (const headers of [{ 'X-FitFocus-State-Account': 'other', 'X-FitFocus-State-Session': session },
    { 'X-FitFocus-State-Account': mocks.user.sub }, { 'X-FitFocus-State-Session': session }]) {
    expect((await invoke(onRequestGet, new Request('https://example.test/api/profile', { headers }))).status).toBe(401);
  }
  expect(mocks.read).not.toHaveBeenCalled();
  const response = await invoke(onRequestPut, new Request('https://example.test/api/profile', { method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': session },
    body: '{"name":"new","baseVersion":1}' }));
  expect(response.status).toBe(200); expect(response.headers.get('X-FitFocus-Profile-Protocol')).toBe('1');
  expect(response.headers.get('X-FitFocus-Profile-Guard')).toBe('1'); expect(response.headers.get('X-FitFocus-State-Session')).toBe(session);
});
it.each(['PUT', 'PATCH'])('returns a guarded validation failure instead of retryable failure for invalid menu %s', async method => {
  mocks.write.mockResolvedValue({ kind: 'invalid-weekly-menu' });
  const session = await stateSessionId(mocks.user);
  const response = await invoke(method === 'PUT' ? onRequestPut : onRequestPatch,
    new Request('https://example.test/api/profile', { method,
      headers: { 'Content-Type': 'application/json', 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': session },
      body: '{"aiPlan":{"weeklyMenu":{}},"baseVersion":1}' }));
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: 'PROFILE_INVALID_WEEKLY_MENU' });
  expect(response.headers.get('X-FitFocus-Profile-Guard')).toBe('1');
  expect(response.headers.get('X-FitFocus-State-Session')).toBe(session);
});
