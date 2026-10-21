import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { sub: 'account-a', sid: 'private-achievement-session' },
  features: vi.fn(), read: vi.fn(), check: vi.fn(),
}));
vi.mock('../functions/api/_lib/auth', async original => ({
  ...await original<typeof import('../functions/api/_lib/auth')>(), requireUser: async () => mocks.user,
}));
vi.mock('../functions/api/_lib/features', () => ({ loadFeatures: mocks.features, isEnabled: () => true }));
vi.mock('../functions/api/_lib/access', () => ({ hasBetaAccess: async () => true }));
vi.mock('../functions/api/_lib/achievement_read', () => ({ readUserAchievements: mocks.read }));
vi.mock('../functions/api/_lib/achievement_check', () => ({ checkAchievements: mocks.check }));

import { onRequestGet as get } from '../functions/api/achievements/index';
import { onRequestPost as post } from '../functions/api/achievements/check';
import { stateSessionId } from '../functions/api/_lib/state_session';
import { onRequestGet as me } from '../functions/api/me';

const db = { prepare: vi.fn() };
const invoke = (handler: typeof get | typeof post, headers: HeadersInit, body = '{"context":{"hasWeeklyMenu":true}}') => handler({
  request: new Request('https://example.test/api/achievements' + (handler === post ? '/check' : ''), {
    method: handler === post ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...headers },
    ...(handler === post ? { body } : {}),
  }), env: { AUTH_JWT_SECRET: 'test-only', DB: db },
} as unknown as Parameters<typeof handler>[0]) as Promise<Response>;

beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { sub: 'account-a', sid: 'private-achievement-session' };
  mocks.features.mockResolvedValue({}); mocks.read.mockResolvedValue([]);
  mocks.check.mockResolvedValue({ newlyUnlocked: [] });
});

for (const [name, handler] of [['read', get], ['check', post]] as const) {
  it.each(['account', 'same-account-login', 'account-only', 'session-only', 'malformed', 'unscoped'])
  (`achievement ${name} rejects %s before feature/application DB effects`, async change => {
    const sid = await stateSessionId(mocks.user);
    let scope: Record<string, string> = {
      'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': sid,
    };
    if (change === 'account') mocks.user.sub = 'account-b';
    if (change === 'same-account-login') mocks.user.sid = 'new-login';
    if (change === 'account-only') scope = { 'X-FitFocus-State-Account': mocks.user.sub };
    if (change === 'session-only') scope = { 'X-FitFocus-State-Session': sid };
    if (change === 'malformed') scope['X-FitFocus-State-Session'] = 'not-a-proof';
    if (change === 'unscoped') scope = {};
    expect((await invoke(handler, scope, change === 'unscoped' ? '{' : undefined)).status).toBe(401);
    expect(mocks.features).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled(); expect(db.prepare).not.toHaveBeenCalled();
  });

  it(`achievement ${name} advertises and echoes the public scope`, async () => {
    const sid = await stateSessionId(mocks.user);
    const response = await invoke(handler, { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': sid });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-FitFocus-Achievements-Protocol')).toBe('1');
    expect(response.headers.get('X-FitFocus-Achievements-Guard')).toBe('1');
    expect(response.headers.get('X-FitFocus-State-Account')).toBe(mocks.user.sub);
    expect(response.headers.get('X-FitFocus-State-Session')).toBe(sid);
    expect([...response.headers.values()].join(' ')).not.toContain(mocks.user.sid);
    expect(await response.text()).not.toContain(mocks.user.sid);
    expect(mocks.features).toHaveBeenCalledOnce();
  });

  it(`achievement ${name} rejects unscoped legacy requests before protected work`, async () => {
    const response = await invoke(handler, {}, '{');
    expect(response.status).toBe(401);
    expect(mocks.features).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });
}

it('keeps the guard on invalid scoped POST bodies', async () => {
  const sid = await stateSessionId(mocks.user);
  const response = await invoke(post, { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': sid }, '{bad');
  expect(response.status).toBe(400);
  expect(response.headers.get('X-FitFocus-Achievements-Guard')).toBe('1');
  expect(mocks.check).not.toHaveBeenCalled();
});

it('/me advertises the achievement guard without exposing the private login id', async () => {
  const response = await me({ request: new Request('https://example.test/api/me'),
    env: { AUTH_JWT_SECRET: 'test-only', DB: db } } as unknown as Parameters<typeof me>[0]) as Response;
  const body = await response.json();
  expect(body.achievementSync).toEqual({ protocol: 1, guard: 1 });
  expect(body.pushSync).toEqual({ protocol: 1, guard: 1 });
  expect(body.stateSync.sessionId).toBe(await stateSessionId(mocks.user));
  expect(JSON.stringify(body)).not.toContain(mocks.user.sid);
});
