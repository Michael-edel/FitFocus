import { isRecord } from '../safeJson';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { requestJson, type JsonResponse } from '../storage/sessionTransport';

export type PushSession = {
  guard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  outbox: DurableOutbox;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type PushSessionOptions = Pick<PushSession, 'fetchImpl' | 'timeoutMs'> & { outbox?: DurableOutbox };

export async function assertPushSession(session: PushSession): Promise<void> {
  await assertReadSession(session.guard, {
    outbox: session.outbox,
    signal: session.controller.signal,
    isCurrentSession: session.isCurrentSession,
  });
}

/** Push API capability is required before a new client sends any mutation. */
export async function preparePushSession(
  previous: OutboxReadGuard,
  controller: AbortController,
  isCurrentSession: () => boolean,
  options: PushSessionOptions = {},
): Promise<PushSession> {
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
  const capability = body?.pushSync;
  if (!isRecord(capability) || capability.protocol !== 1 || capability.guard !== 1) {
    throw new SessionReadError('protocol');
  }
  const session: PushSession = {
    ...options,
    outbox,
    guard: Object.freeze({ ...guard }),
    controller,
    isCurrentSession,
  };
  await assertPushSession(session);
  return session;
}

/** Rebind background push recovery only to the account already active in IDB. */
export async function prepareActivePushSession(options: PushSessionOptions = {}): Promise<PushSession | null> {
  const outbox = options.outbox ?? new DurableOutbox();
  const { fence, active } = await outbox.sessionState();
  if (!active?.serverSessionId) return null;
  const previous: OutboxReadGuard = {
    accountId: active.accountId,
    serverSessionId: active.serverSessionId,
    sessionEpoch: active.sessionEpoch,
    authFence: fence,
  };
  const controller = new AbortController();
  try {
    return await preparePushSession(previous, controller, () => !controller.signal.aborted, { ...options, outbox });
  } catch {
    controller.abort();
    return null;
  }
}

/** One bounded, non-retried push API request, tied to the login that opened it. */
export async function requestPushJson(
  session: PushSession,
  url: '/api/push/status' | '/api/push/subscribe' | '/api/push/unsubscribe' | '/api/push/test',
  init: RequestInit = {},
): Promise<JsonResponse> {
  await assertPushSession(session);
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  session.controller.signal.addEventListener('abort', abortRequest, { once: true });
  if (session.controller.signal.aborted) abortRequest();
  const target = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : undefined;
  const abortForPagehide = () => session.controller.abort();
  target?.addEventListener('pagehide', abortForPagehide);
  try {
    const headers = new Headers(init.headers);
    headers.set('X-Request-ID', `web-${crypto.randomUUID()}`);
    headers.set('X-FitFocus-State-Account', session.guard.accountId);
    headers.set('X-FitFocus-State-Session', session.guard.serverSessionId);
    const result = await requestJson(session.fetchImpl ?? fetch, url, { ...init, headers }, controller, session.timeoutMs ?? 12_000);
    await assertPushSession(session);
    if (result.response.status === 401) throw new SessionReadError('auth');
    if (result.response.status === 403) throw new SessionReadError('access');
    const responseHeaders = result.response.headers;
    if (responseHeaders.get('X-FitFocus-Push-Protocol') !== '1'
      || responseHeaders.get('X-FitFocus-Push-Guard') !== '1'
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
    target?.removeEventListener('pagehide', abortForPagehide);
  }
}
