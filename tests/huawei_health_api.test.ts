import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { prepareHuaweiSession, type HuaweiSession } from '../services/huaweiSession';
import { disconnectHuaweiHealth, requestHuaweiHealthStatus, startHuaweiHealthOAuth, syncHuaweiHealth } from '../features/settings/huaweiHealthApi';

const account = 'huawei-account', sid = 'a'.repeat(64);
let database: StateDatabase, session: HuaweiSession;
const json = (body: unknown, headers: HeadersInit = {}, status = 200) => new Response(JSON.stringify(body), { status, headers });
const capability = { protocol: 1, guard: 1 };
const me = () => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, huaweiSync: capability });
const scopedHeaders = () => ({ 'X-FitFocus-Huawei-Protocol': '1', 'X-FitFocus-Huawei-Guard': '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid });

beforeEach(async () => {
  database = new StateDatabase({ factory: new IDBFactory() });
  const outbox = new DurableOutbox(database);
  const guard = (await outbox.acceptReadSession(account, sid, 0))!;
  const fetchImpl = vi.fn<typeof fetch>(async input => String(input).startsWith('/api/me')
    ? json(me()) : json({ configured: true, connected: true, status: 'connected', scope: 'health.read', expiresAt: 7, lastSyncAt: 3 }, scopedHeaders()));
  session = await prepareHuaweiSession(guard, new AbortController(), () => true, { outbox, fetchImpl });
});
afterEach(() => { database.close(); vi.restoreAllMocks(); });

describe('Huawei Health feature API', () => {
  it('uses guarded status transport and normalizes its public contract', async () => {
    await expect(requestHuaweiHealthStatus(session)).resolves.toEqual({ configured: true, connected: true,
      status: 'connected', scope: 'health.read', expiresAt: 7, lastSyncAt: 3 });
    const fetchImpl = session.fetchImpl as ReturnType<typeof vi.fn>;
    const call = fetchImpl.mock.calls.find(([input]) => String(input).includes('/api/wearable/huawei/status'))!;
    expect(new Headers(call[1]?.headers).get('X-FitFocus-State-Account')).toBe(account);
    expect(new Headers(call[1]?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  });

  it('does not retry credential-changing or data-syncing requests', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => String(input).startsWith('/api/me')
      ? json(me())
      : json({ disconnected: true, profile: {}, updatedFields: ['wearableStepsToday'], authorizeUrl: 'https://oauth.example.test/authorize' }, scopedHeaders()));
    session.fetchImpl = fetchMock;
    await expect(disconnectHuaweiHealth(session)).resolves.toMatchObject({ disconnected: true });
    await expect(syncHuaweiHealth(session, 'UTC', '2026-10-08')).resolves.toMatchObject({ updatedFields: ['wearableStepsToday'] });
    await expect(startHuaweiHealthOAuth(session, 'https://fitfocus.test/settings')).resolves.toBe('https://oauth.example.test/authorize');
    const mutations = fetchMock.mock.calls.filter(([input]) => !String(input).startsWith('/api/me'));
    expect(mutations).toHaveLength(3);
    expect(mutations.map(([, init]) => init?.method)).toEqual(['POST', 'POST', 'POST']);
  });

  it('rejects responses without the Huawei session markers before exposing data', async () => {
    const bad = vi.fn<typeof fetch>(async input => String(input).startsWith('/api/me')
      ? json(me()) : json({ connected: true }, { 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid }));
    session.fetchImpl = bad;
    await expect(requestHuaweiHealthStatus(session)).rejects.toThrow('SESSION_READ_PROTOCOL');
  });
});
