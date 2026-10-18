import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareBillingSession, requestBillingJson } from '../services/billingSession';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';

const account = 'billing-owner';
const serverSessionId = 'a'.repeat(64);
let db: StateDatabase;
let outbox: DurableOutbox;
let guard: OutboxReadGuard;

const me = (capability: unknown = { protocol: 1, guard: 1 }) => ({
  user: { sub: account },
  hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: serverSessionId },
  billingSync: capability,
});
const scopeHeaders = () => ({
  'X-FitFocus-Billing-Protocol': '1',
  'X-FitFocus-Billing-Guard': '1',
  'X-FitFocus-State-Account': account,
  'X-FitFocus-State-Session': serverSessionId,
});
const json = (body: unknown, headers: HeadersInit = {}, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
});
const prepare = (fetchImpl: typeof fetch) => prepareBillingSession(guard, new AbortController(), () => true,
  { outbox, fetchImpl, timeoutMs: 200 });

beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() });
  outbox = new DurableOutbox(db);
  guard = (await outbox.acceptReadSession(account, serverSessionId, 0))!;
});
afterEach(() => { db.close(); vi.restoreAllMocks(); });

describe('billing session transport', () => {
  it('requires the billing capability before sending a mutation', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me(null)));
    await expect(prepare(fetchImpl)).rejects.toThrow('SESSION_READ_PROTOCOL');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('sends the checkout mutation with the captured scope and validates response markers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).startsWith('/api/me')) return json(me());
      expect(input).toBe('/api/billing/checkout');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('include');
      expect(init?.cache).toBe('no-store');
      expect(init?.redirect).toBe('error');
      const headers = new Headers(init?.headers);
      expect(headers.get('X-Request-ID')).toMatch(/^web-/);
      expect(headers.get('X-FitFocus-State-Account')).toBe(account);
      expect(headers.get('X-FitFocus-State-Session')).toBe(serverSessionId);
      return json({ url: 'https://checkout.stripe.com/c/pay/session' }, scopeHeaders());
    });
    const session = await prepare(fetchImpl);

    const { response, body } = await requestBillingJson(session, '/api/billing/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'pro' }),
    });

    expect(response.ok).toBe(true);
    expect(body).toEqual({ url: 'https://checkout.stripe.com/c/pay/session' });
    expect(fetchImpl.mock.calls.filter(([input]) => String(input) === '/api/billing/checkout')).toHaveLength(1);
  });

  it('rejects a late checkout response after another tab changes the active session', async () => {
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
    const result = requestBillingJson(session, '/api/billing/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'family' }),
    });
    await started;

    await outbox.acceptReadSession('another-account', 'b'.repeat(64), guard.authFence);
    release(json({ url: 'https://checkout.stripe.com/c/pay/account-a' }, scopeHeaders()));

    await expect(result).rejects.toThrow('LOGIN_SESSION_CHANGED');
  });

  it('rejects responses without billing protocol or scope markers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => String(input).startsWith('/api/me')
      ? json(me()) : json({ url: 'https://checkout.stripe.com/c/pay/session' }));
    const session = await prepare(fetchImpl);
    await expect(requestBillingJson(session, '/api/billing/checkout', { method: 'POST' }))
      .rejects.toThrow('SESSION_READ_PROTOCOL');
  });

  it.each(['beforeunload', 'pagehide'] as const)('aborts a pending billing mutation on %s', async eventName => {
    const target = new EventTarget(); vi.stubGlobal('window', target);
    const fetchImpl = vi.fn<typeof fetch>(async input => String(input).startsWith('/api/me')
      ? json(me()) : new Response(new ReadableStream({ start() {} }), { headers: scopeHeaders() }));
    const session = await prepare(fetchImpl);
    const pending = requestBillingJson(session, '/api/billing/checkout', { method: 'POST' });
    const result = expect(pending).rejects.toThrow('LOGIN_SESSION_CHANGED');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    target.dispatchEvent(new Event(eventName));
    await result;
    expect(session.controller.signal.aborted).toBe(true);
  });
});
