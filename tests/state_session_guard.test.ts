import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { sub: 'account-a', sid: 'private-session-token', roles: ['user'] }, write: vi.fn(), deleted: vi.fn(), read: vi.fn() }));
vi.mock('../functions/api/_lib/auth', async (original) => ({ ...await original<typeof import('../functions/api/_lib/auth')>(), requireUser: vi.fn(async () => mocks.user) }));
vi.mock('../functions/api/_lib/access', () => ({ hasBetaAccess: vi.fn(async () => true), requireBetaAccess: vi.fn(async () => {}) }));
vi.mock('../functions/api/_lib/state_store', () => ({ writeStateItems: mocks.write, deleteStateItem: mocks.deleted }));
vi.mock('../functions/api/_lib/state_read', () => ({ readStateItems: mocks.read }));
import { stateSessionId } from '../functions/api/_lib/state_session';
import { onRequestGet, onRequestPut, onRequestDelete } from '../functions/api/state';
import { onRequestGet as me } from '../functions/api/me';
const key = 'fitfocus_data_account-a_settings';
const env = { DB: { prepare: vi.fn() }, AUTH_JWT_SECRET: 'test-only' };
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { sub: 'account-a', sid: 'private-session-token', roles: ['user'] };
  mocks.write.mockResolvedValue({ ok: true, items: [{ key, version: 1, exists: true }] });
  mocks.deleted.mockResolvedValue({ ok: true, item: { key, version: 1, exists: false } }); mocks.read.mockResolvedValue([]);
});
const invoke = (handler: typeof onRequestPut, request: Request) => handler({ request, env } as unknown as Parameters<typeof handler>[0]) as Promise<Response>;
const headers = async () => ({ 'Content-Type': 'application/json', 'X-FitFocus-State-Account': 'account-a', 'X-FitFocus-State-Session': await stateSessionId(mocks.user) });
it('exposes a stable public session binding but never the raw sid', async () => {
  const result = await invoke(me, new Request('https://example.test/api/me'));
  const text = await result.text(); const body = JSON.parse(text);
  expect(body.stateSync).toEqual({ accountId: 'account-a', protocol: 2, guard: 1, sessionId: await stateSessionId(mocks.user) });
  expect(text).not.toContain(mocks.user.sid); expect(body.stateSync.sessionId).toMatch(/^[a-f0-9]{64}$/);
  expect(await stateSessionId({ sub: 'other', sid: mocks.user.sid })).not.toBe(body.stateSync.sessionId);
});
it.each(['PUT', 'DELETE', 'GET'])('rejects a changed cookie session before %s reads or writes', async (method) => {
  const expected = await headers(); mocks.user.sid = 'new-cookie-session';
  const handler = method === 'PUT' ? onRequestPut : method === 'DELETE' ? onRequestDelete : onRequestGet;
  const response = await invoke(handler, new Request(`https://example.test/api/state?key=${key}&prefix=fitfocus_data_account-a_`, {
    method, headers: expected, ...(method === 'PUT' ? { body: JSON.stringify({ key, value: 'local', baseVersion: 0 }) } : {}) }));
  expect(response.status).toBe(401); expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.deleted).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it('rejects account mismatch and incomplete expected scope', async () => {
  for (const expected of [{ 'X-FitFocus-State-Account': 'account-b' }, { 'X-FitFocus-State-Session': await stateSessionId(mocks.user) }]) {
    expect((await invoke(onRequestGet, new Request('https://example.test/api/state?prefix=fitfocus_data_account-a_', { headers: expected }))).status).toBe(401);
  }
});
it('acknowledges the validated request scope and preserves unguarded old clients', async () => {
  const expected = await headers();
  const response = await invoke(onRequestPut, new Request('https://example.test/api/state', { method: 'PUT', headers: expected, body: JSON.stringify({ key, value: 'local', baseVersion: 0 }) }));
  expect(response.status).toBe(200); expect(response.headers.get('X-FitFocus-State-Guard')).toBe('1');
  expect(response.headers.get('X-FitFocus-State-Session')).toBe(expected['X-FitFocus-State-Session']);
  expect((await invoke(onRequestGet, new Request('https://example.test/api/state?prefix=fitfocus_data_account-a_'))).status).toBe(200);
});
