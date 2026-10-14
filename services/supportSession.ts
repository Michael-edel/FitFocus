import { errorMessage } from '../safeJson';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { requestJson } from '../storage/sessionTransport';

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
  session.controller.signal.addEventListener('abort', abort, { once: true });
  if (session.controller.signal.aborted) requestController.abort();
  const target = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : undefined;
  target?.addEventListener('pagehide', abort);
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
    target?.removeEventListener('pagehide', abort);
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
