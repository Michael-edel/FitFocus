import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { requestFamilyJson, type FamilySession } from '../services/familySession';
import { FamilyActionScope } from '../features/family/actionScope';

const account = 'family-owner', sid = 'a'.repeat(64);
let database: StateDatabase, session: FamilySession;
const me = (extra = {}) => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, familySync: { protocol: 1, guard: 1 }, ...extra });
const headers = () => ({ 'Content-Type': 'application/json', 'X-FitFocus-Family-Protocol': '1', 'X-FitFocus-Family-Guard': '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid });
const json = (body: unknown, scope: HeadersInit = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: scope });
beforeEach(async () => {
  database = new StateDatabase({ factory: new IDBFactory() }); const outbox = new DurableOutbox(database);
  session = { guard: (await outbox.acceptReadSession(account, sid, 0))!, outbox, controller: new AbortController(), isCurrentSession: () => true, timeoutMs: 200 };
});
afterEach(() => { database.close(); vi.restoreAllMocks(); });
const request = (method = 'GET') => requestFamilyJson(session, '/api/family', { method });

it.each([undefined, { protocol: 1 }, { protocol: 2, guard: 1 }])('requires family capability %j before API work', async capability => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me({ familySync: capability }))); session.fetchImpl = fetchImpl;
  await expect(request()).rejects.toThrow('PROTOCOL'); expect(fetchImpl).toHaveBeenCalledOnce();
});
it.each([
  ['/api/family/invite', 'POST'],
  ['/api/family/member', 'PATCH'],
] as const)('requires explicit-family capability before %s mutation', async (url, method) => {
  const fetchImpl = vi.fn<typeof fetch>(async input => String(input).startsWith('/api/me') ? json(me()) : json({ ok: true }, headers()));
  session.fetchImpl = fetchImpl;
  await expect(requestFamilyJson(session, url, { method, body: '{}' })).rejects.toThrow('PROTOCOL');
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/me');
});
it.each(['other-account', 'same-account-login'])('never adopts a %s proof', async change => {
  const owner = change === 'other-account' ? 'another-owner' : account;
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me({ user: { sub: owner }, stateSync: { protocol: 2, guard: 1, accountId: owner, sessionId: 'b'.repeat(64) } })));
  session.fetchImpl = fetchImpl; const before = await session.outbox!.sessionState();
  await expect(request('POST')).rejects.toThrow('LOGIN_SESSION_CHANGED');
  expect(await session.outbox!.sessionState()).toEqual(before); expect(fetchImpl).toHaveBeenCalledOnce();
});
it.each(['GET', 'POST', 'PATCH'])('refreshes the original proof for every %s request', async method => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : json({ ok: true }, headers()));
  session.fetchImpl = fetchImpl; await request(method); await request(method);
  expect(fetchImpl.mock.calls.filter(([url]) => String(url).startsWith('/api/me'))).toHaveLength(2);
  const init = fetchImpl.mock.calls[1][1];
  expect(new Headers(init?.headers).get('X-FitFocus-State-Account')).toBe(account);
  expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  expect(init).toMatchObject({ method, credentials: 'include', cache: 'no-store', redirect: 'error' });
});
it.each(['Protocol', 'Guard', 'Account', 'Session'])('rejects a mismatched response %s', async field => {
  const scope: Record<string, string> = headers(); scope[`X-FitFocus-${['Protocol', 'Guard'].includes(field) ? 'Family' : 'State'}-${field}`] = 'wrong';
  session.fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : json({ family: 'old' }, scope));
  await expect(request()).rejects.toThrow('PROTOCOL');
});
it('rejects a late family response after another tab invalidates the IDB session', async () => {
  let release!: (response: Response) => void;
  session.fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : new Promise<Response>(resolve => { release = resolve; }));
  const result = expect(request()).rejects.toThrow('LOGIN_SESSION_CHANGED');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  await session.outbox!.invalidateSessions(); release(json({ family: 'old' }, headers())); await result;
});
it('a proof started before auth pause cannot clear it or start family work', async () => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { release = resolve; })); session.fetchImpl = fetchImpl;
  const result = expect(request('POST')).rejects.toThrow('LOGIN_SESSION_CHANGED');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const connection = await database.open(), tx = connection.transaction('outbox_meta', 'readwrite'), store = tx.objectStore('outbox_meta');
  const read = store.get('active-session'); read.onsuccess = () => store.put({ ...read.result, pause: 'auth' });
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
  release(json(me())); await result;
  expect((await session.outbox!.sessionState()).active?.pause).toBe('auth'); expect(fetchImpl).toHaveBeenCalledOnce();
});
it('keeps the page lifetime usable after a bounded request timeout', async () => {
  session.timeoutMs = 10;
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : new Promise<Response>(() => {})); session.fetchImpl = fetchImpl;
  await expect(request('POST')).rejects.toThrow(); expect(session.controller.signal.aborted).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
it('supports independent reads, supersedes the same action and never revives a hidden-page attempt', () => {
  const scope = new FamilyActionScope(() => true); scope.activate();
  const read = scope.begin('context')!, shopping = scope.begin('shopping')!, next = scope.begin('context')!;
  expect(read.isCurrent()).toBe(false); expect(read.controller.signal.aborted).toBe(true); expect(shopping.isCurrent()).toBe(true);
  read.finish(); expect(next.isCurrent()).toBe(true); scope.invalidate(); scope.activate();
  expect(next.isCurrent()).toBe(false); expect(shopping.isCurrent()).toBe(false); expect(scope.begin('context')!.isCurrent()).toBe(true);
});
