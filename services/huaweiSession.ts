import { isRecord } from '../safeJson';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { listenForPageExit, requestJson } from '../storage/sessionTransport';

export type HuaweiSession = {
  guard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  outbox: DurableOutbox;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type HuaweiSessionOptions = Pick<HuaweiSession, 'fetchImpl' | 'timeoutMs'> & { outbox?: DurableOutbox };

export async function assertHuaweiSession(session: HuaweiSession): Promise<void> {
  await assertReadSession(session.guard, {
    outbox: session.outbox,
    signal: session.controller.signal,
    isCurrentSession: session.isCurrentSession,
  });
}

/** Refreshes only the login that opened Settings and requires the server Huawei guard. */
export async function prepareHuaweiSession(
  previous: OutboxReadGuard,
  controller: AbortController,
  isCurrentSession: () => boolean,
  options: HuaweiSessionOptions = {},
): Promise<HuaweiSession> {
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
  const capability = body?.huaweiSync;
  if (!isRecord(capability) || capability.protocol !== 1 || capability.guard !== 1) {
    throw new SessionReadError('protocol');
  }
  const session = { ...options, outbox, guard: Object.freeze({ ...guard }), controller, isCurrentSession };
  await assertHuaweiSession(session);
  return session;
}

/** Makes one bounded, session-scoped HTTP attempt; Huawei mutations are never retried. */
export async function requestHuaweiJson(session: HuaweiSession, url: string, init: RequestInit = {}) {
  await assertHuaweiSession(session);
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  session.controller.signal.addEventListener('abort', abortRequest, { once: true });
  if (session.controller.signal.aborted) abortRequest();
  const removePageExit = listenForPageExit(() => session.controller.abort());
  try {
    const headers = new Headers(init.headers);
    headers.set('X-Request-ID', `web-${crypto.randomUUID()}`);
    headers.set('X-FitFocus-State-Account', session.guard.accountId);
    headers.set('X-FitFocus-State-Session', session.guard.serverSessionId);
    const result = await requestJson(session.fetchImpl ?? fetch, url, { ...init, headers }, requestController,
      session.timeoutMs ?? 12_000);
    await assertHuaweiSession(session);
    const responseHeaders = result.response.headers;
    if (responseHeaders.get('X-FitFocus-Huawei-Protocol') !== '1'
      || responseHeaders.get('X-FitFocus-Huawei-Guard') !== '1'
      || responseHeaders.get('X-FitFocus-State-Account') !== session.guard.accountId
      || responseHeaders.get('X-FitFocus-State-Session') !== session.guard.serverSessionId) {
      throw new SessionReadError('protocol');
    }
    if (result.response.status === 401) throw new SessionReadError('auth');
    if (result.response.status === 403) throw new SessionReadError('access');
    return result;
  } catch (error) {
    if (session.controller.signal.aborted) throw new SessionReadError('session');
    throw error;
  } finally {
    session.controller.signal.removeEventListener('abort', abortRequest);
    removePageExit();
  }
}
