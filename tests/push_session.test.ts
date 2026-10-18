import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareActivePushSession, preparePushSession, requestPushJson } from '../services/pushSession';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';

const account = 'push-owner';
const serverSessionId = 'a'.repeat(64);
let db: StateDatabase;
let outbox: DurableOutbox;
let guard: OutboxReadGuard;

const me = (capability: unknown = { protocol: 1, guard: 1 }, accountId = account, sessionId = serverSessionId) => ({
  user: { sub: accountId },
  hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId, sessionId },
  pushSync: capability,
});
const scopeHeaders = (accountId = account, sessionId = serverSessionId) => ({
  'X-FitFocus-Push-Protocol': '1',
  'X-FitFocus-Push-Guard': '1',
  'X-FitFocus-State-Account': accountId,
  'X-FitFocus-State-Session': sessionId,
});
const json = (body: unknown, headers: HeadersInit = {}, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
});
const prepare = (fetchImpl: typeof fetch) => preparePushSession(guard, new AbortController(), () => true,
  { outbox, fetchImpl, timeoutMs: 200 });

beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() });
  outbox = new DurableOutbox(db);
  guard = (await outbox.acceptReadSession(account, serverSessionId, 0))!;
});
afterEach(() => { db.close(); vi.restoreAllMocks(); });

describe('push session transport', () => {
  it('requires the push capability before making a push request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me(null)));
    await expect(prepare(fetchImpl)).rejects.toThrow('SESSION_READ_PROTOCOL');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('sends subscription writes with the captured session and checks response scope', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).startsWith('/api/me')) return json(me());
      expect(String(input)).toBe('/api/push/subscribe');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('include');
      const headers = new Headers(init?.headers);
      expect(headers.get('X-Request-ID')).toMatch(/^web-/);
      expect(headers.get('X-FitFocus-State-Account')).toBe(account);
      expect(headers.get('X-FitFocus-State-Session')).toBe(serverSessionId);
      return json({ ok: true }, scopeHeaders());
    });
    const session = await prepare(fetchImpl);

    const { response, body } = await requestPushJson(session, '/api/push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: { endpoint: 'https://push.example/' } }),
    });

    expect(response.ok).toBe(true);
    expect(body).toEqual({ ok: true });
    expect(fetchImpl.mock.calls.filter(([input]) => String(input) === '/api/push/subscribe')).toHaveLength(1);
  });

  it('does not adopt an account switch while a push mutation is pending', async () => {
    let release!: (response: Response) => void;
    let requested!: () => void;
    const started = new Promise<void>(resolve => { requested = resolve; });
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      if (String(input).startsWith('/api/me')) return json(me());
      requested();
      return pending;
    });
    const session = await prepare(fetchImpl);
    const result = requestPushJson(session, '/api/push/unsubscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionId: 'sub-a' }),
    });
    await started;

    await outbox.acceptReadSession('another-account', 'b'.repeat(64), guard.authFence);
    release(json({ ok: true }, scopeHeaders()));

    await expect(result).rejects.toThrow('LOGIN_SESSION_CHANGED');
  });

  it('discards a late push status response from account A after account B becomes active', async () => {
    let release!: (response: Response) => void;
    let requested!: () => void;
    const started = new Promise<void>(resolve => { requested = resolve; });
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      if (String(input).startsWith('/api/me')) return json(me());
      expect(String(input)).toBe('/api/push/status');
      requested();
      return pending;
    });
    const session = await prepare(fetchImpl);

    const status = requestPushJson(session, '/api/push/status');
    await started;
    await outbox.acceptReadSession('account-b', 'b'.repeat(64), guard.authFence);
    release(json({ configured: true, current_subscription_id: 'account-a-subscription' }, scopeHeaders()));

    await expect(status).rejects.toThrow('LOGIN_SESSION_CHANGED');
  });

  it('uses only the already active IDB owner for background subscription recovery', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me()));
    const activeSession = await prepareActivePushSession({ outbox, fetchImpl, timeoutMs: 200 });
    expect(activeSession?.guard).toMatchObject({ accountId: account, serverSessionId });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rebinds background subscription recovery to the newer active IDB login session', async () => {
    const nextSessionId = 'b'.repeat(64);
    await outbox.acceptReadSession(account, nextSessionId, guard.authFence);
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).startsWith('/api/me')) return json(me(undefined, account, nextSessionId));
      expect(String(input)).toBe('/api/push/subscribe');
      const headers = new Headers(init?.headers);
      expect(headers.get('X-FitFocus-State-Account')).toBe(account);
      expect(headers.get('X-FitFocus-State-Session')).toBe(nextSessionId);
      return json({ ok: true }, scopeHeaders(account, nextSessionId));
    });

    const activeSession = await prepareActivePushSession({ outbox, fetchImpl, timeoutMs: 200 });
    expect(activeSession?.guard).toMatchObject({ accountId: account, serverSessionId: nextSessionId });
    await requestPushJson(activeSession!, '/api/push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: { endpoint: 'https://push.example/' } }),
    });
    expect(fetchImpl.mock.calls.filter(([input]) => String(input) === '/api/push/subscribe')).toHaveLength(1);
  });

  it.each(['beforeunload', 'pagehide'] as const)('aborts a pending push mutation on %s', async eventName => {
    const target = new EventTarget(); vi.stubGlobal('window', target);
    const fetchImpl = vi.fn<typeof fetch>(async input => String(input).startsWith('/api/me')
      ? json(me()) : new Response(new ReadableStream({ start() {} }), { headers: scopeHeaders() }));
    const session = await prepare(fetchImpl);
    const pending = requestPushJson(session, '/api/push/subscribe', { method: 'POST', body: '{}' });
    const result = expect(pending).rejects.toThrow('LOGIN_SESSION_CHANGED');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    target.dispatchEvent(new Event(eventName));
    await result;
    expect(session.controller.signal.aborted).toBe(true);
  });
});
