import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { sub: 'account-a', sid: 'private-bootstrap-session', roles: ['user'] },
  profile: vi.fn(), read: vi.fn(), features: vi.fn() }));
vi.mock('../functions/api/_lib/auth', async importOriginal => ({ ...await importOriginal<object>(), requireUser: async () => mocks.user }));
vi.mock('../functions/api/_lib/access', () => ({ requireBetaAccess: async () => {} }));
vi.mock('../functions/api/_lib/profile_read', () => ({ loadCurrentProfile: mocks.profile }));
vi.mock('../functions/api/_lib/state_read', () => ({ readStateItems: mocks.read }));
vi.mock('../functions/api/_lib/features', () => ({ loadFeatures: mocks.features }));
import { onRequestGet } from '../functions/api/bootstrap';
import { stateSessionId } from '../functions/api/_lib/state_session';
const env = { DB: { prepare: vi.fn() }, AUTH_JWT_SECRET: 'test-only' };
const invoke = (headers?: HeadersInit) => onRequestGet({ env, request: new Request('https://example.test/api/bootstrap', { headers }) } as unknown as Parameters<typeof onRequestGet>[0]) as Promise<Response>;
const scope = async () => ({ 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': await stateSessionId(mocks.user) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { sub: 'account-a', sid: 'private-bootstrap-session', roles: ['user'] };
  mocks.profile.mockResolvedValue(null); mocks.read.mockResolvedValue([]); mocks.features.mockResolvedValue({});
});
it.each(['cookie', 'account', 'incomplete'])('rejects %s changes before bootstrap data reads', async change => {
  const expected = await scope();
  if (change === 'cookie') mocks.user.sid = 'new-cookie-session';
  if (change === 'account') mocks.user.sub = 'account-b';
  const result = await invoke(change === 'incomplete' ? { 'X-FitFocus-State-Account': 'account-a' } : expected);
  expect(result.status).toBe(401);
  expect(mocks.profile).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.features).not.toHaveBeenCalled();
});
it('rejects an unscoped legacy bootstrap before reading profile, state, or features', async () => {
  const result = await invoke();
  expect(result.status).toBe(401);
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.features).not.toHaveBeenCalled();
});
it('acknowledges the bound bootstrap without exposing a raw session id', async () => {
  const expected = await scope(); const response = await invoke(expected); const body = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get('X-FitFocus-Bootstrap-Protocol')).toBe('1');
  expect(response.headers.get('X-FitFocus-Bootstrap-Guard')).toBe('1');
  expect(response.headers.get('X-FitFocus-State-Account')).toBe('account-a');
  expect(response.headers.get('X-FitFocus-State-Session')).toBe(expected['X-FitFocus-State-Session']);
  expect(body.user.sub).toBe('account-a'); expect(body.user.sid).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain(mocks.user.sid);
});
