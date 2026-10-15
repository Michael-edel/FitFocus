import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { sub: 'admin-a', sid: 'private-session-id', roles: ['admin'], emailVerified: true } }));
vi.mock('../functions/api/_lib/auth', async (original) => ({
  ...await original<typeof import('../functions/api/_lib/auth')>(),
  requireUser: vi.fn(async () => mocks.user),
}));
import { requireAdminRequest } from '../functions/api/_lib/admin_guard';
import { stateSessionId } from '../functions/api/_lib/state_session';

const makeDb = () => {
  const calls = { prepare: vi.fn(), all: vi.fn(async () => ({ results: [{ ok: 1 }] })), run: vi.fn(async () => ({ success: true })) };
  calls.prepare.mockImplementation(() => ({
    bind: () => ({ all: calls.all, run: calls.run }),
  }));
  return { db: { prepare: calls.prepare } as unknown as D1Database, calls };
};

beforeEach(() => { mocks.user = { sub: 'admin-a', sid: 'private-session-id', roles: ['admin'], emailVerified: true }; });

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

it('keeps old admin clients compatible when no state proof is supplied', async () => {
  const { db, calls } = makeDb();
  const request = new Request('https://example.test/api/admin/settings');
  await expect(requireAdminRequest(mocks.user, request, db)).resolves.toBe(mocks.user);
  expect(calls.all).toHaveBeenCalledOnce();
});

it('validates proof in the request and environment call style too', async () => {
  const { db, calls } = makeDb();
  const request = new Request('https://example.test/api/admin/settings', {
    headers: { 'X-FitFocus-State-Account': mocks.user.sub, 'X-FitFocus-State-Session': 'wrong' },
  });
  await expect(requireAdminRequest(request, { DB: db })).rejects.toThrow('STATE_SESSION_CHANGED');
  expect(calls.prepare).not.toHaveBeenCalled();
});
