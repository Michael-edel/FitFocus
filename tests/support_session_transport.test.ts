import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { prepareSupportSession, requestSupportJson } from '../services/supportSession';

const account = 'support-owner', sid = 'a'.repeat(64);
let db: StateDatabase, outbox: DurableOutbox, guard: OutboxReadGuard;
const me = (extra: Record<string, unknown> = {}) => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, ...extra });
const headers = () => ({ 'Content-Type': 'application/json', 'X-FitFocus-Support-Protocol': '1',
  'X-FitFocus-Support-Guard': '1', 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid });
const json = (body: unknown, responseHeaders: HeadersInit = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders });

beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(db);
  guard = (await outbox.acceptReadSession(account, sid, 0))!;
});
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const prepare = (fetchImpl: typeof fetch, controller = new AbortController()) =>
  prepareSupportSession(guard, controller, () => true, { outbox, fetchImpl, timeoutMs: 200 });

it('refreshes the captured proof and scopes JSON and multipart support requests', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : json({ ok: true }, headers()));
  const session = await prepare(fetchImpl);
  const form = new FormData(); form.set('message', 'hello');
  await requestSupportJson(session, '/api/support/feedback', { method: 'POST', body: form });

  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const [url, init] = fetchImpl.mock.calls[1];
  expect(url).toBe('/api/support/feedback');
  expect(init).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error' });
  const requestHeaders = new Headers(init?.headers);
  expect(requestHeaders.get('X-FitFocus-State-Account')).toBe(account);
  expect(requestHeaders.get('X-FitFocus-State-Session')).toBe(sid);
  expect(requestHeaders.has('Content-Type')).toBe(false);
});

it.each(['Protocol', 'Guard', 'Account', 'Session'])('rejects a mismatched response %s', async field => {
  const scope: Record<string, string> = headers();
  const prefix = ['Protocol', 'Guard'].includes(field) ? 'X-FitFocus-Support-' : 'X-FitFocus-State-';
  scope[`${prefix}${field}`] = 'wrong';
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : json({ tickets: [] }, scope));
  const session = await prepare(fetchImpl);
  await expect(requestSupportJson(session, '/api/support/feedback/my', { method: 'GET' })).rejects.toThrow('PROTOCOL');
});

it('does not adopt a same-account login that replaced the captured session', async () => {
  const changed = me({ stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: 'b'.repeat(64) } });
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(changed));
  await expect(prepareSupportSession(guard, new AbortController(), () => true,
    { outbox, fetchImpl, timeoutMs: 200 })).rejects.toThrow('LOGIN_SESSION_CHANGED');
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it('rejects a late response after another tab invalidates the IDB session fence', async () => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : new Promise<Response>(resolve => { release = resolve; }));
  const session = await prepare(fetchImpl);
  const result = expect(requestSupportJson(session, '/api/support/feedback/my', { method: 'GET' }))
    .rejects.toThrow('LOGIN_SESSION_CHANGED');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  await outbox.invalidateSessions();
  release(json({ tickets: [{ id: 'private-ticket-a' }] }, headers()));
  await result;
});

it('aborts an in-flight support request on pagehide', async () => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : new Response(new ReadableStream({ start() {} }), { headers: headers() }));
  const session = await prepare(fetchImpl);
  const result = expect(requestSupportJson(session, '/api/support/feedback/my', { method: 'GET' }))
    .rejects.toThrow('STATE_REQUEST_ABORTED');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  target.dispatchEvent(new Event('pagehide'));
  await result;
});
