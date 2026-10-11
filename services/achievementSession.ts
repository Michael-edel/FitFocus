import { isRecord } from '../safeJson';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { requestJson } from '../storage/sessionTransport';

export type AchievementSession = {
  guard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  outbox: DurableOutbox;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};
export type AchievementSessionOptions = Pick<AchievementSession, 'fetchImpl' | 'timeoutMs'> & { outbox?: DurableOutbox };

export async function assertAchievementSession(session: AchievementSession): Promise<void> {
  await assertReadSession(session.guard, {
    outbox: session.outbox, signal: session.controller.signal, isCurrentSession: session.isCurrentSession,
  });
}

/** Refresh only the captured login: a delayed queue must never adopt a newer same-account session. */
export async function prepareAchievementSession(previous: OutboxReadGuard, controller: AbortController,
  isCurrentSession: () => boolean, options: AchievementSessionOptions = {}): Promise<AchievementSession> {
  const outbox = options.outbox ?? new DurableOutbox();
  const { body, guard } = await verifyReadSession({
    ...options, outbox, previous, accountId: previous.accountId, isCurrentSession, signal: controller.signal,
  });
  if (!guard) throw new SessionReadError('auth');
  const capability = body?.achievementSync;
  if (!isRecord(capability) || capability.protocol !== 1 || capability.guard !== 1) throw new SessionReadError('protocol');
  const session = { ...options, outbox, guard: Object.freeze({ ...guard }), controller, isCurrentSession };
  await assertAchievementSession(session);
  return session;
}

/** A bounded, scoped request including the response body; mutations have no automatic retries. */
export async function requestAchievementJson(session: AchievementSession, context?: unknown) {
  await assertAchievementSession(session);
  const requestController = new AbortController();
  const onAbort = () => requestController.abort();
  session.controller.signal.addEventListener('abort', onAbort, { once: true });
  if (session.controller.signal.aborted) requestController.abort();
  const onHide = () => session.controller.abort();
  const target = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : undefined;
  target?.addEventListener('pagehide', onHide);
  try {
    const headers = {
      'Content-Type': 'application/json', 'X-Request-ID': `web-${crypto.randomUUID()}`,
      'X-FitFocus-State-Account': session.guard.accountId, 'X-FitFocus-State-Session': session.guard.serverSessionId,
    };
    const result = await requestJson(session.fetchImpl ?? fetch,
      context === undefined ? '/api/achievements' : '/api/achievements/check', {
        method: context === undefined ? 'GET' : 'POST', headers,
        ...(context === undefined ? {} : { body: JSON.stringify({ context }) }),
      }, requestController, session.timeoutMs ?? 12_000);
    await assertAchievementSession(session);
    const scope = result.response.headers;
    if (scope.get('X-FitFocus-Achievements-Protocol') !== '1' || scope.get('X-FitFocus-Achievements-Guard') !== '1'
      || scope.get('X-FitFocus-State-Account') !== session.guard.accountId
      || scope.get('X-FitFocus-State-Session') !== session.guard.serverSessionId) throw new SessionReadError('protocol');
    if (result.response.status === 401) throw new SessionReadError('auth');
    if (result.response.status === 403) throw new SessionReadError('access');
    return result;
  } finally {
    session.controller.signal.removeEventListener('abort', onAbort);
    target?.removeEventListener('pagehide', onHide);
  }
}
