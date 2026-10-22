import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { sub: 'admin-a', sid: 'private-session-id', roles: ['admin'], emailVerified: true } }));
vi.mock('../functions/api/_lib/auth', async (original) => ({
  ...await original<typeof import('../functions/api/_lib/auth')>(),
  requireUser: vi.fn(async () => mocks.user),
}));
import { requireUser } from '../functions/api/_lib/auth';
import { requireAdminRequest } from '../functions/api/_lib/admin_guard';
import { stateSessionId } from '../functions/api/_lib/state_session';

const makeDb = () => {
  const calls = { prepare: vi.fn(), all: vi.fn(async () => ({ results: [{ ok: 1 }] })), run: vi.fn(async () => ({ success: true })) };
  calls.prepare.mockImplementation(() => ({
    bind: () => ({ all: calls.all, run: calls.run }),
  }));
  return { db: { prepare: calls.prepare } as unknown as D1Database, calls };
};

beforeEach(() => {
  mocks.user = { sub: 'admin-a', sid: 'private-session-id', roles: ['admin'], emailVerified: true };
  vi.mocked(requireUser).mockClear();
});

it('checks account and session proof before the role query or admin session side effect', async () => {
  const { db, calls } = makeDb();
  const request = new Request('https://example.test/api/admin/settings', {
    headers: { 'X-FitFocus-State-Account': 'other-account', 'X-FitFocus-State-Session': 'b'.repeat(64) },
  });
  await expect(requireAdminRequest(mocks.user, request, db)).rejects.toThrow('STATE_SESSION_CHANGED');
  expect(calls.prepare).not.toHaveBeenCalled();
});

it('checks a complete matching proof before accepting the admin role', async () => {
  const { db, calls } = makeDb();
  const request = new Request('https://example.test/api/admin/settings', {
    headers: { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': await stateSessionId(mocks.user) },
  });
  await expect(requireAdminRequest(mocks.user, request, db)).resolves.toBe(mocks.user);
  expect(calls.prepare).toHaveBeenCalledTimes(3);
  expect(calls.all).toHaveBeenCalledOnce();
});

it.each([
  {},
  { 'X-FitFocus-State-Account': 'admin-a' },
  { 'X-FitFocus-State-Session': 'b'.repeat(64) },
])('rejects missing or partial proof before role lookup and admin session tracking', async (headers) => {
  const { db, calls } = makeDb();
  const request = new Request('https://example.test/api/admin/settings', { headers });
  await expect(requireAdminRequest(mocks.user, request, db)).rejects.toThrow('STATE_SESSION_REQUIRED');
  expect(calls.prepare).not.toHaveBeenCalled();
  expect(calls.all).not.toHaveBeenCalled();
});

it('rejects missing proof before authenticating in the request and environment call style', async () => {
  const { db, calls } = makeDb();
  const request = new Request('https://example.test/api/admin/settings');
  await expect(requireAdminRequest(request, { DB: db })).rejects.toThrow('STATE_SESSION_REQUIRED');
  expect(requireUser).not.toHaveBeenCalled();
  expect(calls.prepare).not.toHaveBeenCalled();
});

it('validates proof in the request and environment call style too', async () => {
  const { db, calls } = makeDb();
  const request = new Request('https://example.test/api/admin/settings', {
    headers: { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': 'wrong' },
  });
  await expect(requireAdminRequest(request, { DB: db })).rejects.toThrow('STATE_SESSION_CHANGED');
  expect(calls.prepare).not.toHaveBeenCalled();
});

it('accepts complete matching proof in the request and environment call style', async () => {
  const { db, calls } = makeDb();
  const request = new Request('https://example.test/api/admin/settings', {
    headers: { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': await stateSessionId(mocks.user) },
  });
  await expect(requireAdminRequest(request, { DB: db })).resolves.toBe(mocks.user);
  expect(requireUser).toHaveBeenCalledOnce();
  expect(calls.all).toHaveBeenCalledOnce();
});
