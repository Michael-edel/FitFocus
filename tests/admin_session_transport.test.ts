import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { prepareAdminSession, requestAdminResponse } from '../services/adminSession';
import { onRequest as adminMiddleware } from '../functions/api/admin/_middleware';

const account = 'admin-owner';
const sid = 'a'.repeat(64);
let db: StateDatabase;
let outbox: DurableOutbox;
let guard: OutboxReadGuard;

const me = () => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid } });
const scopedHeaders = (): HeadersInit => ({
  'X-FitFocus-Admin-Protocol': '1',
  'X-FitFocus-Admin-Guard': '1',
  'X-FitFocus-State-Account': account,
  'X-FitFocus-State-Session': sid,
});
const json = (body: unknown, headers: HeadersInit = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() });
  outbox = new DurableOutbox(db);
  guard = (await outbox.acceptReadSession(account, sid, 0))!;
});
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const prepare = (fetchImpl: typeof fetch, controller = new AbortController()) =>
  prepareAdminSession(guard, controller, () => true, { outbox, fetchImpl, timeoutMs: 200 });

it('scopes admin requests and leaves the returned response readable', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (url) => String(url).startsWith('/api/me')
    ? json(me()) : json({ ok: true }, scopedHeaders()));
  const session = await prepare(fetchImpl);
  const response = await requestAdminResponse(session, '/api/admin/settings', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'x' }),
  });

  const [url, init] = fetchImpl.mock.calls[1];
  expect(url).toBe('/api/admin/settings');
  expect(init).toMatchObject({ method: 'PUT', credentials: 'include', cache: 'no-store', redirect: 'error' });
  expect(new Headers(init?.headers).get('X-FitFocus-State-Account')).toBe(account);
  expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  await expect(response.json()).resolves.toEqual({ ok: true });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it.each(['beforeunload', 'pagehide'] as const)('aborts an in-flight admin response on %s without invalidating the session', async eventName => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const removeListener = vi.spyOn(target, 'removeEventListener');
  let requestCount = 0;
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me())
    : ++requestCount === 1
      ? new Response(new ReadableStream({ start() {} }), { headers: scopedHeaders() })
      : json({ ok: true }, scopedHeaders()));
  const session = await prepare(fetchImpl);
  const result = expect(requestAdminResponse(session, '/api/admin/stats')).rejects.toThrow('STATE_REQUEST_ABORTED');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  target.dispatchEvent(new Event(eventName));
  await result;

  expect(session.controller.signal.aborted).toBe(false);
  const afterReturn = await requestAdminResponse(session, '/api/admin/stats');
  await expect(afterReturn.json()).resolves.toEqual({ ok: true });
  expect(removeListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  expect(removeListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
});

it.each(['Protocol', 'Guard', 'Account', 'Session'])('rejects an incorrect admin response %s marker', async (field) => {
  const headers: Record<string, string> = scopedHeaders() as Record<string, string>;
  const prefix = field === 'Account' || field === 'Session' ? 'X-FitFocus-State-' : 'X-FitFocus-Admin-';
  headers[`${prefix}${field}`] = 'wrong';
  const fetchImpl = vi.fn<typeof fetch>(async (url) => String(url).startsWith('/api/me')
    ? json(me()) : json({ ok: true }, headers));
  const session = await prepare(fetchImpl);
  await expect(requestAdminResponse(session, '/api/admin/stats')).rejects.toThrow('SESSION_READ_PROTOCOL');
});

it('rejects a late response after another tab invalidates the login fence', async () => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(async (url) => String(url).startsWith('/api/me')
    ? json(me()) : new Promise<Response>((resolve) => { release = resolve; }));
  const session = await prepare(fetchImpl);
  const result = expect(requestAdminResponse(session, '/api/admin/stats')).rejects.toThrow('LOGIN_SESSION_CHANGED');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  await outbox.invalidateSessions();
  release(json({ private: 'admin-data' }, scopedHeaders()));
  await result;
});

it('keeps CSV responses available while enforcing the bounded response limit', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (url) => String(url).startsWith('/api/me')
    ? json(me()) : new Response('id,action\n1,test', { headers: scopedHeaders() }));
  const session = await prepare(fetchImpl);
  const response = await requestAdminResponse(session, '/api/admin/admin_events?format=csv');
  await expect(response.text()).resolves.toBe('id,action\n1,test');
});

it('accepts a separately guarded support attachment response for the same admin session', async () => {
  const attachmentHeaders = {
    'X-FitFocus-Support-Attachment-Protocol': '1',
    'X-FitFocus-Support-Attachment-Guard': '1',
    'X-FitFocus-State-Account': account,
    'X-FitFocus-State-Session': sid,
  };
  const fetchImpl = vi.fn<typeof fetch>(async (url) => String(url).startsWith('/api/me')
    ? json(me()) : new Response('attachment', { headers: attachmentHeaders }));
  const session = await prepare(fetchImpl);
  const response = await requestAdminResponse(session, '/api/support/attachment?id=ticket-1&index=0', {}, 'Support-Attachment');

  await expect(response.text()).resolves.toBe('attachment');
});

it('marks every admin response with the request session proof', async () => {
  const request = new Request('https://example.test/api/admin/settings', {
    headers: { 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid },
  });
  const response = await adminMiddleware({ request, next: async () => new Response('ok') } as never);
  expect(response.headers.get('X-FitFocus-Admin-Protocol')).toBe('1');
  expect(response.headers.get('X-FitFocus-Admin-Guard')).toBe('1');
  expect(response.headers.get('X-FitFocus-State-Account')).toBe(account);
  expect(response.headers.get('X-FitFocus-State-Session')).toBe(sid);
});

it('turns a stale session proof into a guarded unauthenticated response', async () => {
  const request = new Request('https://example.test/api/admin/settings', {
    headers: { 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': 'b'.repeat(64) },
  });
  const response = await adminMiddleware({
    request,
    next: async () => { throw new Error('STATE_SESSION_CHANGED'); },
  } as never);
  expect(response.status).toBe(401);
  expect(response.headers.get('X-FitFocus-Admin-Guard')).toBe('1');
  expect(await response.json()).toMatchObject({ error: 'UNAUTH' });
});

it('turns a missing required session proof into a guarded unauthenticated response', async () => {
  const request = new Request('https://example.test/api/admin/settings');
  const response = await adminMiddleware({
    request,
    next: async () => { throw new Error('STATE_SESSION_REQUIRED'); },
  } as never);
  expect(response.status).toBe(401);
  expect(response.headers.get('X-FitFocus-Admin-Protocol')).toBe('1');
  expect(response.headers.get('X-FitFocus-Admin-Guard')).toBe('1');
  expect(response.headers.has('X-FitFocus-State-Account')).toBe(false);
  expect(await response.json()).toMatchObject({ error: 'UNAUTH' });
});
