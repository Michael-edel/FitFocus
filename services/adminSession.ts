import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { listenForPageExit } from '../storage/sessionTransport';

export type AdminSession = {
  guard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  outbox: DurableOutbox;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function prepareAdminSession(
  previous: OutboxReadGuard,
  controller: AbortController,
  isCurrentSession: () => boolean,
  options: { outbox?: DurableOutbox; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AdminSession> {
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
  const session: AdminSession = {
    ...options,
    guard: Object.freeze({ ...guard }),
    controller,
    isCurrentSession,
    outbox,
  };
  await assertAdminSession(session);
  return session;
}

export async function assertAdminSession(session: AdminSession): Promise<void> {
  await assertReadSession(session.guard, {
    outbox: session.outbox,
    signal: session.controller.signal,
    isCurrentSession: session.isCurrentSession,
  });
}

async function drainBoundedResponse(response: Response, signal: AbortSignal, maxBytes: number): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  let size = 0;
  let onAbort: (() => void) | undefined;
  const abort = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(new Error('STATE_REQUEST_ABORTED'));
    else {
      onAbort = () => reject(new Error('STATE_REQUEST_ABORTED'));
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), abort]);
      if (next.done) return;
      size += next.value.byteLength;
      if (size > maxBytes) throw new SessionReadError('protocol');
    }
  } finally {
    if (signal.aborted || size > maxBytes) void reader.cancel().catch(() => {});
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/** Sends one session-bound request; it never retries mutations or adopts a later login. */
export async function requestAdminResponse(
  session: AdminSession,
  url: string,
  init: RequestInit = {},
  resource: 'Admin' | 'Support-Attachment' = 'Admin',
): Promise<Response> {
  await assertAdminSession(session);
  const controller = new AbortController();
  const abort = () => controller.abort();
  session.controller.signal.addEventListener('abort', abort, { once: true });
  if (session.controller.signal.aborted) controller.abort();
  const removePageExit = listenForPageExit(abort);
  const timeout = setTimeout(abort, session.timeoutMs ?? 12_000);
  try {
    const headers = new Headers(init.headers);
    headers.set('X-Request-ID', `web-${crypto.randomUUID()}`);
    headers.set('X-FitFocus-State-Account', session.guard.accountId);
    headers.set('X-FitFocus-State-Session', session.guard.serverSessionId);
    const response = await (session.fetchImpl ?? fetch)(url, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    await drainBoundedResponse(response.clone(), controller.signal, 5 * 1024 * 1024);
    await assertAdminSession(session);
    if (response.status === 401) throw new SessionReadError('auth');
    if (response.status === 403) throw new SessionReadError('access');
    const responseHeaders = response.headers;
    if (responseHeaders.get(`X-FitFocus-${resource}-Protocol`) !== '1'
      || responseHeaders.get(`X-FitFocus-${resource}-Guard`) !== '1'
      || responseHeaders.get('X-FitFocus-State-Account') !== session.guard.accountId
      || responseHeaders.get('X-FitFocus-State-Session') !== session.guard.serverSessionId) {
      throw new SessionReadError('protocol');
    }
    return response;
  } finally {
    clearTimeout(timeout);
    session.controller.signal.removeEventListener('abort', abort);
    removePageExit();
  }
}
