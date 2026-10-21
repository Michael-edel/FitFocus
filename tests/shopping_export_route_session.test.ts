import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: { sub: 'shopper-a', sid: 'private-session-id', emailVerified: true },
  ensureUserRow: vi.fn(async () => {}),
  buildExport: vi.fn(async () => 'Продукт,Количество\n"Рис","400 г"'),
}));
vi.mock('../functions/api/_lib/auth', async (original) => ({
  ...await original<typeof import('../functions/api/_lib/auth')>(),
  requireUser: vi.fn(async () => mocks.user),
}));
vi.mock('../functions/api/_lib/db', async (original) => ({
  ...await original<typeof import('../functions/api/_lib/db')>(),
  requireDB: vi.fn(() => ({})),
  ensureUserRow: mocks.ensureUserRow,
}));
vi.mock('../functions/api/_lib/shopping_export', () => ({
  isShoppingExportWeek: vi.fn(() => true),
  buildPersonalShoppingExport: mocks.buildExport,
}));
import { onRequestGet } from '../functions/api/shopping/export';
import { stateSessionId } from '../functions/api/_lib/state_session';

const invoke = (request: Request) => onRequestGet({ request, env: { AUTH_JWT_SECRET: 'test-only', DB: {} } } as never);

beforeEach(() => {
  mocks.user.sid = 'private-session-id';
  vi.clearAllMocks();
});

it('rejects an export scoped to a different login before reading personal rows', async () => {
  const response = await invoke(new Request('https://example.test/api/shopping/export?week=2026-10-12', {
    headers: { 'X-FitFocus-State-Account': 'shopper-b', 'X-FitFocus-State-Session': 'b'.repeat(64) },
  }));
  expect(response.status).toBe(401);
  expect(mocks.ensureUserRow).not.toHaveBeenCalled();
  expect(mocks.buildExport).not.toHaveBeenCalled();
  expect(response.headers.get('X-FitFocus-Family-Guard')).toBe('1');
});

it('preserves CSV output and acknowledges a matching scope', async () => {
  const request = new Request('https://example.test/api/shopping/export?week=2026-10-12', {
    headers: {
      'X-FitFocus-State-Account': mocks.user.sub,
      'X-FitFocus-State-Session': await stateSessionId(mocks.user),
    },
  });
  const response = await invoke(request);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('Продукт,Количество\n"Рис","400 г"');
  expect(response.headers.get('X-FitFocus-Family-Protocol')).toBe('1');
  expect(response.headers.get('X-FitFocus-State-Session')).toBe(request.headers.get('X-FitFocus-State-Session'));
  expect(mocks.buildExport).toHaveBeenCalledWith({}, mocks.user.sub, '2026-10-12');
});
