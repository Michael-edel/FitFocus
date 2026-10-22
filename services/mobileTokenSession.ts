import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { listenForPageExit, requestJson, type JsonResponse } from '../storage/sessionTransport';

export type MobileTokenSession = {
  guard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  outbox: DurableOutbox;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type MobileTokenSessionOptions = Pick<MobileTokenSession, 'fetchImpl' | 'timeoutMs'> & {
  outbox?: DurableOutbox;
};

export async function assertMobileTokenSession(session: MobileTokenSession): Promise<void> {
  await assertReadSession(session.guard, {
    outbox: session.outbox,
    signal: session.controller.signal,
    isCurrentSession: session.isCurrentSession,
  });
}

/** Refresh only the login that opened Settings; never bind a request to a later cookie. */
export async function prepareMobileTokenSession(
  previous: OutboxReadGuard,
  controller: AbortController,
  isCurrentSession: () => boolean,
  options: MobileTokenSessionOptions = {},
): Promise<MobileTokenSession> {
  const outbox = options.outbox ?? new DurableOutbox();
  const { guard } = await verifyReadSession({
    ...options,
    outbox,
    previous,
    accountId: previous.accountId,
    isCurrentSession,
    signal: controller.signal,
  });
  if (!guard) throw new SessionReadError('auth');
  const session: MobileTokenSession = {
    ...options,
    guard: Object.freeze({ ...guard }),
    controller,
    isCurrentSession,
    outbox,
  };
  await assertMobileTokenSession(session);
  return session;
}

/** One bounded, scoped POST. Token-issuing requests are never automatically retried. */
export async function requestMobileTokenJson(session: MobileTokenSession): Promise<JsonResponse> {
  await assertMobileTokenSession(session);
  const requestController = new AbortController();
  let lifecycleAbort = false;
  const abortRequest = () => {
    lifecycleAbort = true;
    requestController.abort();
  };
  session.controller.signal.addEventListener('abort', abortRequest, { once: true });
  if (session.controller.signal.aborted) abortRequest();
  const removePageExit = listenForPageExit(abortRequest);
  try {
    const headers = new Headers({ Accept: 'application/json' });
    headers.set('X-Request-ID', `web-${crypto.randomUUID()}`);
    headers.set('X-FitFocus-State-Account', session.guard.accountId);
    headers.set('X-FitFocus-State-Session', session.guard.serverSessionId);
    const result = await requestJson(session.fetchImpl ?? fetch, '/api/mobile/token', {
      method: 'POST',
      headers,
    }, requestController, session.timeoutMs ?? 12_000);
    await assertMobileTokenSession(session);
    if (result.response.status === 401) throw new SessionReadError('auth');
    if (result.response.status === 403) throw new SessionReadError('access');

    const responseHeaders = result.response.headers;
    if (responseHeaders.get('X-FitFocus-Mobile-Token-Protocol') !== '1'
      || responseHeaders.get('X-FitFocus-Mobile-Token-Guard') !== '1'
      || responseHeaders.get('X-FitFocus-State-Account') !== session.guard.accountId
      || responseHeaders.get('X-FitFocus-State-Session') !== session.guard.serverSessionId) {
      throw new SessionReadError('protocol');
    }
    return result;
  } catch (error) {
    if (lifecycleAbort) throw new SessionReadError('session');
    throw error;
  } finally {
    session.controller.signal.removeEventListener('abort', abortRequest);
    removePageExit();
  }
}
