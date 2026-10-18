import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileTokenApiError, requestMobileToken } from '../features/settings/mobileTokenApi';
import { prepareMobileTokenSession, requestMobileTokenJson } from '../services/mobileTokenSession';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';

const account = 'mobile-token-owner';
const sessionId = 'a'.repeat(64);
let db: StateDatabase;
let outbox: DurableOutbox;
let guard: OutboxReadGuard;

const me = () => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId } });
const scopedHeaders = () => ({ 'Content-Type': 'application/json',
  'X-FitFocus-Mobile-Token-Protocol': '1', 'X-FitFocus-Mobile-Token-Guard': '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sessionId });
const json = (body: unknown, headers: HeadersInit = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(headers)) } });

beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() });
  outbox = new DurableOutbox(db);
  guard = (await outbox.acceptReadSession(account, sessionId, 0))!;
});
afterEach(() => { db.close(); vi.restoreAllMocks(); });

const prepare = (fetchImpl: typeof fetch) => prepareMobileTokenSession(
  guard, new AbortController(), () => true, { outbox, fetchImpl, timeoutMs: 200 },
);

describe('mobile token feature API', () => {
  it('scopes the one-time POST and accepts only a matching guarded response', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).startsWith('/api/me')) return json(me());
      expect(String(input)).toBe('/api/mobile/token');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('include');
      expect(init?.cache).toBe('no-store');
      expect(init?.redirect).toBe('error');
      const headers = new Headers(init?.headers);
      expect(headers.get('X-Request-ID')).toMatch(/^web-/);
      expect(headers.get('X-FitFocus-State-Account')).toBe(account);
      expect(headers.get('X-FitFocus-State-Session')).toBe(sessionId);
      return json({ token: 'mobile-token', expiresAt: 123 }, scopedHeaders());
    });
    const session = await prepare(fetchMock);

    await expect(requestMobileToken(session)).resolves.toEqual({ token: 'mobile-token', expiresAt: 123 });
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/mobile/token')).toHaveLength(1);
  });

  it('rejects a token response with a mismatched session scope', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => String(input).startsWith('/api/me')
      ? json(me())
      : json({ token: 'must-not-escape' }, { ...scopedHeaders(), 'X-FitFocus-State-Session': 'b'.repeat(64) }));
    const session = await prepare(fetchMock);

    await expect(requestMobileToken(session)).rejects.toMatchObject({ code: 'PROTOCOL' });
  });

  it('maps unauthenticated issuance responses to the existing sign-in message', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => String(input).startsWith('/api/me')
      ? json(me())
      : json({ error: 'UNAUTH' }, {}, 401));
    const session = await prepare(fetchMock);

    await expect(requestMobileToken(session)).rejects.toMatchObject({
      code: 'UNAUTH',
      message: 'Сначала войдите в аккаунт FitFocus.',
    } satisfies Partial<MobileTokenApiError>);
  });

  it('discards a delayed token when another account takes the durable session fence', async () => {
    let release!: (response: Response) => void;
    let requested!: () => void;
    const requestStarted = new Promise<void>(resolve => { requested = resolve; });
    const pendingResponse = new Promise<Response>(resolve => { release = resolve; });
    const fetchMock = vi.fn<typeof fetch>(async input => {
      if (String(input).startsWith('/api/me')) return json(me());
      requested();
      return pendingResponse;
    });
    const session = await prepare(fetchMock);
    const result = requestMobileToken(session);
    await requestStarted;

    await outbox.acceptReadSession('another-account', 'b'.repeat(64), guard.authFence);
    release(json({ token: 'account-a-secret' }, scopedHeaders()));

    await expect(result).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  });

  it.each(['beforeunload', 'pagehide'] as const)('aborts a pending one-time token issuance on %s', async eventName => {
    const target = new EventTarget(); vi.stubGlobal('window', target);
    const fetchMock = vi.fn<typeof fetch>(async input => String(input).startsWith('/api/me')
      ? json(me()) : new Response(new ReadableStream({ start() {} }), { headers: scopedHeaders() }));
    const session = await prepare(fetchMock);
    const pending = requestMobileTokenJson(session);
    const result = expect(pending).rejects.toThrow('LOGIN_SESSION_CHANGED');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    target.dispatchEvent(new Event(eventName));
    await result;
    expect(session.controller.signal.aborted).toBe(false);
  });
});
