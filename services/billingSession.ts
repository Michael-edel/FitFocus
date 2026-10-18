import { isRecord } from '../safeJson';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { listenForPageExit, requestJson, type JsonResponse } from '../storage/sessionTransport';

export type BillingSession = {
  guard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  outbox: DurableOutbox;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type BillingSessionOptions = Pick<BillingSession, 'fetchImpl' | 'timeoutMs'> & { outbox?: DurableOutbox };

export async function assertBillingSession(session: BillingSession): Promise<void> {
  await assertReadSession(session.guard, {
    outbox: session.outbox,
    signal: session.controller.signal,
    isCurrentSession: session.isCurrentSession,
  });
}

/** Refresh only the login that opened the paywall. */
export async function prepareBillingSession(
  previous: OutboxReadGuard,
  controller: AbortController,
  isCurrentSession: () => boolean,
  options: BillingSessionOptions = {},
): Promise<BillingSession> {
  const outbox = options.outbox ?? new DurableOutbox();
  const { body, guard } = await verifyReadSession({
    ...options,
    outbox,
    previous,
    accountId: previous.accountId,
    isCurrentSession,
    signal: controller.signal,
  });
  if (!guard) throw new SessionReadError('auth');
  const capability = body?.billingSync;
  if (!isRecord(capability) || capability.protocol !== 1 || capability.guard !== 1) {
    throw new SessionReadError('protocol');
  }
  const session: BillingSession = {
    ...options,
    guard: Object.freeze({ ...guard }),
    controller,
    isCurrentSession,
    outbox,
  };
  await assertBillingSession(session);
  return session;
}

/** A bounded, non-retried mutation with a response bound to its initiating login. */
export async function requestBillingJson(
  session: BillingSession,
  url: '/api/billing/checkout' | '/api/admin/subscription',
  init: RequestInit,
): Promise<JsonResponse> {
  await assertBillingSession(session);
  const headers = new Headers(init.headers);
  headers.set('X-Request-ID', `web-${crypto.randomUUID()}`);
  headers.set('X-FitFocus-State-Account', session.guard.accountId);
  headers.set('X-FitFocus-State-Session', session.guard.serverSessionId);
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  session.controller.signal.addEventListener('abort', abortRequest, { once: true });
  if (session.controller.signal.aborted) abortRequest();
  const removePageExit = listenForPageExit(() => session.controller.abort());
  try {
    const result = await requestJson(session.fetchImpl ?? fetch, url, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
    }, requestController, session.timeoutMs ?? 12_000);
    await assertBillingSession(session);
    if (result.response.status === 401) throw new SessionReadError('auth');
    if (result.response.status === 403) throw new SessionReadError('access');
    const responseHeaders = result.response.headers;
    if (responseHeaders.get('X-FitFocus-Billing-Protocol') !== '1'
      || responseHeaders.get('X-FitFocus-Billing-Guard') !== '1'
      || responseHeaders.get('X-FitFocus-State-Account') !== session.guard.accountId
      || responseHeaders.get('X-FitFocus-State-Session') !== session.guard.serverSessionId) {
      throw new SessionReadError('protocol');
    }
    return result;
  } catch (error) {
    if (session.controller.signal.aborted) throw new SessionReadError('session');
    throw error;
  } finally {
    session.controller.signal.removeEventListener('abort', abortRequest);
    removePageExit();
  }
}
