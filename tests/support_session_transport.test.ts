import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { prepareSupportSession, requestSupportAttachmentBlob, requestSupportJson } from '../services/supportSession';

const account = 'support-owner', sid = 'a'.repeat(64);
let db: StateDatabase, outbox: DurableOutbox, guard: OutboxReadGuard;
const me = (extra: Record<string, unknown> = {}) => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, ...extra });
const headers = () => ({ 'Content-Type': 'application/json', 'X-FitFocus-Support-Protocol': '1',
  'X-FitFocus-Support-Guard': '1', 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid });
const attachmentHeaders = () => ({ 'Content-Type': 'image/png',
  'X-FitFocus-Support-Attachment-Protocol': '1', 'X-FitFocus-Support-Attachment-Guard': '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid });
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

it('removes transient unload listeners after a support JSON request settles', async () => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const removeListener = vi.spyOn(target, 'removeEventListener');
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : json({ tickets: [] }, headers()));
  const session = await prepare(fetchImpl);
  await requestSupportJson(session, '/api/support/feedback/my', { method: 'GET' });
  expect(removeListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  expect(removeListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
});

it('downloads support media with the captured proof and verifies attachment markers', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : new Response('private-image', { headers: attachmentHeaders() }));
  const session = await prepare(fetchImpl);
  const blob = await requestSupportAttachmentBlob(session, '/api/support/attachment?id=ticket-1&index=0');

  await expect(blob.text()).resolves.toBe('private-image');
  const [url, init] = fetchImpl.mock.calls[1];
  expect(url).toContain('/api/support/attachment');
  const requestHeaders = new Headers(init?.headers);
  expect(requestHeaders.get('X-FitFocus-State-Account')).toBe(account);
  expect(requestHeaders.get('X-FitFocus-State-Session')).toBe(sid);
});

it('removes transient unload listeners after a support attachment read settles', async () => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const removeListener = vi.spyOn(target, 'removeEventListener');
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : new Response('private-image', { headers: attachmentHeaders() }));
  const session = await prepare(fetchImpl);
  await requestSupportAttachmentBlob(session, '/api/support/attachment?id=ticket-1&index=0');
  expect(removeListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  expect(removeListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
});

it('rejects support media whose resource markers do not match the session', async () => {
  const badHeaders = { ...attachmentHeaders(), 'X-FitFocus-State-Session': 'b'.repeat(64) };
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : new Response('private-image', { headers: badHeaders }));
  const session = await prepare(fetchImpl);

  await expect(requestSupportAttachmentBlob(session, '/api/support/attachment?id=ticket-1&index=0'))
    .rejects.toThrow('PROTOCOL');
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

it.each(['beforeunload', 'pagehide'] as const)('aborts an in-flight support request on %s', async eventName => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : new Response(new ReadableStream({ start() {} }), { headers: headers() }));
  const actionController = new AbortController();
  const session = await prepare(fetchImpl, actionController);
  const result = expect(requestSupportJson(session, '/api/support/feedback/my', { method: 'GET' }))
    .rejects.toThrow('STATE_REQUEST_ABORTED');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  target.dispatchEvent(new Event(eventName));
  await result;
  expect(actionController.signal.aborted).toBe(true);
});

it.each(['beforeunload', 'pagehide'] as const)('aborts an in-flight support attachment read on %s', async eventName => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me')
    ? json(me()) : new Response(new ReadableStream({ start() {} }), { headers: attachmentHeaders() }));
  const actionController = new AbortController();
  const session = await prepare(fetchImpl, actionController);
  const result = expect(requestSupportAttachmentBlob(session, '/api/support/attachment?id=ticket-1&index=0'))
    .rejects.toThrow('STATE_REQUEST_ABORTED');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  target.dispatchEvent(new Event(eventName));
  await result;
  expect(actionController.signal.aborted).toBe(true);
});
