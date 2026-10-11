import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { sub: 'account-a', sid: 'private-test-cookie', roles: ['user'] }, consume: vi.fn() }));
vi.mock('../functions/api/_lib/auth', async original => ({ ...await original<typeof import('../functions/api/_lib/auth')>(), requireUser: vi.fn(async () => mocks.user) }));
vi.mock('../functions/api/_lib/invites', () => ({ consumeInviteCode: mocks.consume }));
import { stateSessionId } from '../functions/api/_lib/state_session';
import { onRequestPost } from '../functions/api/invite/redeem';
const env = { DB: { prepare: vi.fn() }, AUTH_JWT_SECRET: 'test-only' };
const invoke = (headers: Record<string, string>) => onRequestPost({ env, request: new Request('https://example.test/api/invite/redeem',
  { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{"code":"SYNTHETIC"}' }) } as unknown as Parameters<typeof onRequestPost>[0]) as Promise<Response>;
beforeEach(() => { vi.clearAllMocks(); mocks.user = { sub: 'account-a', sid: 'private-test-cookie', roles: ['user'] }; mocks.consume.mockResolvedValue({ ok: true }); });
it.each(['session', 'account'])('rejects a changed cookie %s before consuming an invite', async change => {
  const scope = { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': await stateSessionId(mocks.user) };
  if (change === 'session') mocks.user.sid = 'another-cookie'; else mocks.user.sub = 'account-b';
  expect((await invoke(scope)).status).toBe(401); expect(mocks.consume).not.toHaveBeenCalled();
});
it('rejects incomplete scope, acknowledges the validated binding, and supports older requests without scope', async () => {
  expect((await invoke({ 'X-FitFocus-State-Account': mocks.user.sub })).status).toBe(401);
  expect(mocks.consume).not.toHaveBeenCalled();
  const sid = await stateSessionId(mocks.user);
  const response = await invoke({ 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': sid });
  expect(response.status).toBe(200); expect(response.headers.get('X-FitFocus-Invite-Guard')).toBe('1');
  expect(response.headers.get('X-FitFocus-State-Session')).toBe(sid); expect(mocks.consume).toHaveBeenCalledWith(env.DB, 'SYNTHETIC', 'account-a', expect.any(Number));
  expect((await invoke({})).status).toBe(200);
});
