import { errorMessage, isRecord } from '../safeJson';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { requestJson } from '../storage/sessionTransport';

export type FamilySession = {
  guard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  outbox?: DurableOutbox;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function familyErrorMessage(error: unknown): string {
  if (error instanceof SessionReadError) {
    if (error.kind === 'access') return 'Нет доступа к семейным данным.';
    if (error.kind === 'protocol') return 'Сервер пока не поддерживает безопасную работу с семьёй. Повторите позже.';
    return 'Сессия изменилась. Войдите снова и повторите действие.';
  }
  if (error instanceof Error && /STATE_REQUEST_ABORTED|STATE_RESPONSE_TOO_LARGE|Failed to fetch|Load failed|NetworkError/.test(error.message)) {
    return 'Не удалось получить ответ сервера. Проверьте соединение и повторите действие.';
  }
  return errorMessage(error, 'Не удалось выполнить действие с семьёй.');
}

/** Every request refreshes the original login proof, including another login of the same account. */
export async function requestFamilyJson(session: FamilySession, url: string, init: RequestInit) {
  const options = { outbox: session.outbox ?? new DurableOutbox(), isCurrentSession: session.isCurrentSession,
    signal: session.controller.signal, fetchImpl: session.fetchImpl, timeoutMs: session.timeoutMs };
  await assertReadSession(session.guard, options);
  const { body, guard } = await verifyReadSession({ ...options, previous: session.guard, accountId: session.guard.accountId });
  if (!guard) throw new SessionReadError('auth');
  const capability = body?.familySync;
  if (!isRecord(capability) || capability.protocol !== 1 || capability.guard !== 1) throw new SessionReadError('protocol');
  const resource = url.startsWith('/api/family/menu/state') ? 'Family-Menu' : url === '/api/weekly_menu/items' ? 'Weekly-Menu' : 'Family';
  if ((resource === 'Family-Menu' || url.startsWith('/api/family/menu/generate'))
    && (!isRecord(body?.familyMenuSync) || body.familyMenuSync.protocol !== 1
      || body.familyMenuSync.guard !== 1 || body.familyMenuSync.cas !== 1)) throw new SessionReadError('protocol');
  if (resource === 'Weekly-Menu' && (!isRecord(body?.weeklyMenuSync) || body.weeklyMenuSync.protocol !== 1 || body.weeklyMenuSync.guard !== 1)) {
    throw new SessionReadError('protocol');
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  const hide = () => session.controller.abort();
  session.controller.signal.addEventListener('abort', abort, { once: true });
  if (session.controller.signal.aborted) controller.abort();
  const target = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : undefined;
  target?.addEventListener('pagehide', hide);
  try {
    const headers = new Headers(init.headers);
    headers.set('X-Request-ID', `web-${crypto.randomUUID()}`);
    headers.set('X-FitFocus-State-Account', guard.accountId);
    headers.set('X-FitFocus-State-Session', guard.serverSessionId);
    const result = await requestJson(session.fetchImpl ?? fetch, url, { ...init, headers }, controller, session.timeoutMs ?? 12_000);
    await assertReadSession(session.guard, options);
    const scope = result.response.headers;
    if (scope.get(`X-FitFocus-${resource}-Protocol`) !== '1' || scope.get(`X-FitFocus-${resource}-Guard`) !== '1'
      || scope.get('X-FitFocus-State-Account') !== guard.accountId
      || scope.get('X-FitFocus-State-Session') !== guard.serverSessionId) throw new SessionReadError('protocol');
    if (result.response.status === 401) throw new SessionReadError('auth');
    if (result.response.status === 403) throw new SessionReadError('access');
    return result;
  } finally {
    session.controller.signal.removeEventListener('abort', abort);
    target?.removeEventListener('pagehide', hide);
  }
}
