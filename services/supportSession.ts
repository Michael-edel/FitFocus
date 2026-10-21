import { errorMessage } from '../safeJson';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { listenForPageExit, requestJson } from '../storage/sessionTransport';

export type SupportSession = {
  guard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  outbox: DurableOutbox;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};
export type SupportSessionOptions = Pick<SupportSession, 'fetchImpl' | 'timeoutMs'> & { outbox?: DurableOutbox };

export async function assertSupportSession(session: SupportSession): Promise<void> {
  await assertReadSession(session.guard, {
    outbox: session.outbox,
    signal: session.controller.signal,
    isCurrentSession: session.isCurrentSession,
  });
}

/** Refresh the captured login before a support action; never adopt a later cookie session. */
export async function prepareSupportSession(
  previous: OutboxReadGuard,
  controller: AbortController,
  isCurrentSession: () => boolean,
  options: SupportSessionOptions = {},
): Promise<SupportSession> {
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
  const session: SupportSession = {
    ...options,
    guard: Object.freeze({ ...guard }),
    controller,
    isCurrentSession,
    outbox,
  };
  await assertSupportSession(session);
  return session;
}

/** Sends one bounded request with the captured scope; mutations are never retried. */
export async function requestSupportJson(session: SupportSession, url: string, init: RequestInit) {
  await assertSupportSession(session);
  const requestController = new AbortController();
  const abort = () => requestController.abort();
  const onHide = () => { abort(); session.controller.abort(); };
  session.controller.signal.addEventListener('abort', abort, { once: true });
  if (session.controller.signal.aborted) requestController.abort();
  const removePageExit = listenForPageExit(onHide);
  try {
    const headers = new Headers(init.headers);
    headers.set('X-Request-ID', `web-${crypto.randomUUID()}`);
    headers.set('X-FitFocus-State-Account', session.guard.accountId);
    headers.set('X-FitFocus-State-Session', session.guard.serverSessionId);
    const result = await requestJson(session.fetchImpl ?? fetch, url, { ...init, headers }, requestController, session.timeoutMs ?? 12_000);
    await assertSupportSession(session);
    if (result.response.status === 401) throw new SessionReadError('auth');
    if (result.response.status === 403) throw new SessionReadError('access');
    const scope = result.response.headers;
    if (scope.get('X-FitFocus-Support-Protocol') !== '1'
      || scope.get('X-FitFocus-Support-Guard') !== '1'
      || scope.get('X-FitFocus-State-Account') !== session.guard.accountId
      || scope.get('X-FitFocus-State-Session') !== session.guard.serverSessionId) {
      throw new SessionReadError('protocol');
    }
    return result;
  } finally {
    session.controller.signal.removeEventListener('abort', abort);
    removePageExit();
  }
}

/** Loads private support media with the captured session proof; media tags cannot add these headers. */
export async function requestSupportAttachmentBlob(session: SupportSession, url: string): Promise<Blob> {
  await assertSupportSession(session);
  const requestController = new AbortController();
  const abort = () => requestController.abort();
  const onHide = () => { abort(); session.controller.abort(); };
  session.controller.signal.addEventListener('abort', abort, { once: true });
  if (session.controller.signal.aborted) requestController.abort();
  const removePageExit = listenForPageExit(onHide);
  const timeout = setTimeout(abort, session.timeoutMs ?? 12_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let removeAbortListener: (() => void) | undefined;
  let completed = false;
  try {
    const headers = new Headers({ 'X-Request-ID': `web-${crypto.randomUUID()}` });
    headers.set('X-FitFocus-State-Account', session.guard.accountId);
    headers.set('X-FitFocus-State-Session', session.guard.serverSessionId);
    const response = await (session.fetchImpl ?? fetch)(url, {
      headers,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal: requestController.signal,
    });
    await assertSupportSession(session);
    if (response.status === 401) throw new SessionReadError('auth');
    if (response.status === 403) throw new SessionReadError('access');
    const responseHeaders = response.headers;
    if (responseHeaders.get('X-FitFocus-Support-Attachment-Protocol') !== '1'
      || responseHeaders.get('X-FitFocus-Support-Attachment-Guard') !== '1'
      || responseHeaders.get('X-FitFocus-State-Account') !== session.guard.accountId
      || responseHeaders.get('X-FitFocus-State-Session') !== session.guard.serverSessionId) {
      void response.body?.cancel().catch(() => {});
      throw new SessionReadError('protocol');
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new Error('SUPPORT_ATTACHMENT_FAILED');
    }

    reader = response.body?.getReader();
    const chunks: ArrayBuffer[] = [];
    let size = 0;
    let rejectAbort: (reason: Error) => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(new Error('STATE_REQUEST_ABORTED'));
    requestController.signal.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => requestController.signal.removeEventListener('abort', onAbort);
    if (requestController.signal.aborted) onAbort();
    if (reader) for (;;) {
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 5 * 1024 * 1024) {
        void reader?.cancel().catch(() => {});
        throw new SessionReadError('protocol');
      }
      const chunk = new Uint8Array(next.value.byteLength);
      chunk.set(next.value);
      chunks.push(chunk.buffer);
    }
    completed = true;
    await assertSupportSession(session);
    return new Blob(chunks, { type: responseHeaders.get('content-type') || 'application/octet-stream' });
  } catch (error) {
    if (requestController.signal.aborted) throw new Error('STATE_REQUEST_ABORTED');
    throw error;
  } finally {
    clearTimeout(timeout);
    removeAbortListener?.();
    if (!completed) void reader?.cancel().catch(() => {});
    session.controller.signal.removeEventListener('abort', abort);
    removePageExit();
  }
}

export function supportSessionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SessionReadError) {
    if (error.kind === 'access') return 'Нет доступа к обращениям поддержки.';
    if (error.kind === 'protocol') return 'Сервер пока не поддерживает безопасную работу с обращениями. Обновите приложение и повторите.';
    return 'Сессия изменилась или истекла. Войдите снова и повторите действие.';
  }
  if (error instanceof Error && /STATE_REQUEST_ABORTED|Failed to fetch|Load failed|NetworkError/.test(error.message)) {
    return 'Не удалось получить ответ сервера. Проверьте соединение и повторите действие.';
  }
  return errorMessage(error, fallback);
}
