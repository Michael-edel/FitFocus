import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { sub: 'account-a', sid: 'private-ai-session', roles: ['user'] },
  access: vi.fn(), ensureUser: vi.fn(), saveItems: vi.fn(),
}));
vi.mock('../functions/api/_lib/auth', async original => ({
  ...await original<typeof import('../functions/api/_lib/auth')>(), requireUser: async () => mocks.user,
}));
vi.mock('../functions/api/_lib/access', () => ({ requireBetaAccess: mocks.access }));
vi.mock('../functions/api/_lib/db', async original => ({
  ...await original<typeof import('../functions/api/_lib/db')>(), ensureUserRow: mocks.ensureUser,
}));
vi.mock('../functions/api/_lib/weekly_menu_items', () => ({ saveWeeklyMenuItems: mocks.saveItems }));

import { onRequestPost as ai } from '../functions/api/ai';
import { onRequestPost as items } from '../functions/api/weekly_menu/items';
import { stateSessionId } from '../functions/api/_lib/state_session';

const db = { prepare: vi.fn() };
const invoke = (handler: typeof ai | typeof items, headers: HeadersInit, body = '{"items":[]}') => handler({
  request: new Request('https://example.test/api/' + (handler === ai ? 'ai' : 'weekly_menu/items'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body,
  }), env: { AUTH_JWT_SECRET: 'test-only', DB: db },
} as unknown as Parameters<typeof handler>[0]) as Promise<Response>;

beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { sub: 'account-a', sid: 'private-ai-session', roles: ['user'] };
  // A valid AI scope reaches access control; no provider/quota work is needed in this guard test.
  mocks.access.mockRejectedValue(new Error('ACCESS_REQUIRED'));
  mocks.saveItems.mockResolvedValue({ kind: 'saved', stored: 0, weekStart: '2026-10-12' });
});

for (const [name, handler, resource] of [['AI', ai, 'AI'], ['weekly items', items, 'Weekly-Menu']] as const) {
  it.each(['account', 'same-account-login', 'account-only', 'session-only', 'malformed', 'unscoped'])
  (`${name} rejects %s before protected work`, async change => {
    const sessionId = await stateSessionId(mocks.user);
    let scope: Record<string, string> = {
      'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': sessionId,
    };
    if (change === 'account') mocks.user.sub = 'account-b';
    if (change === 'same-account-login') mocks.user.sid = 'next-login-same-account';
    if (change === 'account-only') scope = { 'X-FitFocus-State-Account': mocks.user.sub };
    if (change === 'session-only') scope = { 'X-FitFocus-State-Session': sessionId };
    if (change === 'malformed') scope['X-FitFocus-State-Session'] = 'not-a-session-proof';
    if (change === 'unscoped') scope = {};

    expect((await invoke(handler, scope, change === 'unscoped' ? '{' : undefined)).status).toBe(401);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.ensureUser).not.toHaveBeenCalled();
    expect(mocks.saveItems).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it(`${name} advertises its guard and returns the public binding without the private session id`, async () => {
    const sessionId = await stateSessionId(mocks.user);
    const scope = { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': sessionId };
    const response = await invoke(handler, scope);
    expect(response.status).toBe(handler === ai ? 403 : 200);
    expect(response.headers.get(`X-FitFocus-${resource}-Protocol`)).toBe('1');
    expect(response.headers.get(`X-FitFocus-${resource}-Guard`)).toBe('1');
    expect(response.headers.get('X-FitFocus-State-Account')).toBe(mocks.user.sub);
    expect(response.headers.get('X-FitFocus-State-Session')).toBe(sessionId);
    expect([...response.headers.values()].join(' ')).not.toContain(mocks.user.sid);
    expect(await response.text()).not.toContain(mocks.user.sid);
    if (handler === ai) expect(mocks.access).toHaveBeenCalledOnce();
    else expect(mocks.saveItems).toHaveBeenCalledWith({ db, userId: mocks.user.sub, body: { items: [] } });
  });

  it(`${name} rejects unscoped legacy clients before reading the body`, async () => {
    const response = await invoke(handler, {}, '{');
    expect(response.status).toBe(401);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.ensureUser).not.toHaveBeenCalled();
    expect(mocks.saveItems).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });
}
