import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { prepareHuaweiSession, requestHuaweiJson, type HuaweiSession } from '../services/huaweiSession';

const account = 'huawei-owner', sid = 'a'.repeat(64), otherSid = 'b'.repeat(64);
let database: StateDatabase, outbox: DurableOutbox, session: HuaweiSession;
const json = (body: unknown, headers: HeadersInit = {}, status = 200) => new Response(JSON.stringify(body), { status, headers });
const capability = { protocol: 1, guard: 1 };
const me = (extra = {}) => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, huaweiSync: capability, ...extra });
const scope = (overrides: Record<string, string> = {}) => ({
  'X-FitFocus-Huawei-Protocol': '1', 'X-FitFocus-Huawei-Guard': '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid, ...overrides,
});

beforeEach(async () => {
  database = new StateDatabase({ factory: new IDBFactory() });
  outbox = new DurableOutbox(database);
  const guard = (await outbox.acceptReadSession(account, sid, 0))!;
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : json({ connected: true }, scope()));
  session = await prepareHuaweiSession(guard, new AbortController(), () => true, { outbox, fetchImpl, timeoutMs: 200 });
});
afterEach(() => { database.close(); vi.restoreAllMocks(); });

it.each([undefined, { protocol: 1 }, { protocol: 2, guard: 1 }])('requires the huaweiSync capability %j before the request', async capabilityValue => {
  const before = (await outbox.sessionState()).active!;
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me({ huaweiSync: capabilityValue })));
  const original = session;
  await expect(prepareHuaweiSession(original.guard, new AbortController(), () => true, { outbox, fetchImpl }))
    .rejects.toThrow('SESSION_READ_PROTOCOL');
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect((await outbox.sessionState()).active).toEqual(before);
});

it.each(['Protocol', 'Guard', 'Account', 'Session'])('rejects a response with an invalid %s marker', async field => {
  const header = field === 'Protocol' || field === 'Guard' ? `X-FitFocus-Huawei-${field}` : `X-FitFocus-State-${field}`;
  session.fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me())
    : json({ connected: true }, scope({ [header]: 'wrong' })));
  await expect(requestHuaweiJson(session, '/api/wearable/huawei/status')).rejects.toThrow('SESSION_READ_PROTOCOL');
});

it('scopes each bounded request to the prepared proof', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : json({ ok: true }, scope()));
  session.fetchImpl = fetchImpl;
  await requestHuaweiJson(session, '/api/wearable/huawei/status');
  await requestHuaweiJson(session, '/api/wearable/huawei/sync', { method: 'POST', body: '{}' });
  expect(fetchImpl.mock.calls).toHaveLength(2);
  const [, init] = fetchImpl.mock.calls.find(([url]) => String(url).includes('/api/wearable/huawei/sync'))!;
  expect(new Headers(init?.headers).get('X-FitFocus-State-Account')).toBe(account);
  expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  expect(init).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error' });
});

it('does not apply a late response after another tab activates account B', async () => {
  let release!: (response: Response) => void;
  session.fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me())
    : new Promise<Response>(resolve => { release = resolve; }));
  const result = expect(requestHuaweiJson(session, '/api/wearable/huawei/sync', { method: 'POST' }))
    .rejects.toThrow('LOGIN_SESSION_CHANGED');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const current = await outbox.sessionState();
  expect(await outbox.acceptReadSession('account-b', otherSid, current.fence)).not.toBeNull();
  release(json({ profile: { id: account } }, scope()));
  await result;
});

it('maps a session failure response to the session guard', async () => {
  session.fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : json({ error: 'UNAUTH' }, scope(), 401));
  await expect(requestHuaweiJson(session, '/api/wearable/huawei/status')).rejects.toThrow('SESSION_READ_AUTH');
});

it.each(['beforeunload', 'pagehide'] as const)('aborts a pending Huawei action on %s', async eventName => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : new Response(new ReadableStream({ start() {} }), { headers: scope() }));
  session.fetchImpl = fetchImpl;
  const pending = requestHuaweiJson(session, '/api/wearable/huawei/sync', { method: 'POST' });
  const result = expect(pending).rejects.toThrow('LOGIN_SESSION_CHANGED');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
  target.dispatchEvent(new Event(eventName));
  await result;
  expect(session.controller.signal.aborted).toBe(true);
});
