import { isRecord } from '../safeJson';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { assertReadSession, SessionReadError, verifyReadSession } from '../storage/sessionRead';
import { requestJson } from '../storage/sessionTransport';

export type AiSession = {
  guard: OutboxReadGuard;
  controller: AbortController;
  isCurrentSession: () => boolean;
  outbox: DurableOutbox;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};
type AiSessionOptions = Pick<AiSession, 'fetchImpl' | 'timeoutMs'> & {
  outbox?: DurableOutbox; previous?: OutboxReadGuard; allowInitialSession?: boolean;
  requireMenuProjection?: boolean; requireFamilyMenu?: boolean;
};

export async function assertAiSession(session: AiSession): Promise<void> {
  await assertReadSession(session.guard, {
    outbox: session.outbox, isCurrentSession: session.isCurrentSession, signal: session.controller.signal,
  });
}

/** Refresh the original login proof; never adopt another cookie session during an old action. */
export async function prepareAiSession(accountId: string, controller: AbortController, isCurrentSession: () => boolean,
  options: AiSessionOptions = {}): Promise<AiSession> {
  if (controller.signal.aborted || !isCurrentSession()) throw new SessionReadError('session');
  const outbox = options.outbox ?? new DurableOutbox();
  const { active, fence } = await outbox.sessionState();
  if (active && (active.accountId !== accountId || active.pause || !active.serverSessionId)) throw new SessionReadError('session');
  let previous = options.previous;
  let initialVerification: Awaited<ReturnType<typeof verifyReadSession>> | undefined;
  if (!previous && active?.accountId === accountId && !active.pause && active.serverSessionId) {
    previous = { accountId, sessionEpoch: active.sessionEpoch, serverSessionId: active.serverSessionId, authFence: fence };
  } else if (!previous && options.allowInitialSession && !active) {
    initialVerification = await verifyReadSession({
      outbox, fetchImpl: options.fetchImpl, accountId, isCurrentSession, signal: controller.signal,
      expectedAuthFence: fence, requireNoActiveSession: true,
    });
    if (!initialVerification.guard) throw new SessionReadError('auth');
    if (initialVerification.guard.authFence !== fence + 1) throw new SessionReadError('session');
    previous = initialVerification.guard;
  }
  if (!previous) throw new SessionReadError('session');
  if (previous.accountId !== accountId) throw new SessionReadError('session');
  await assertReadSession(previous, { outbox, isCurrentSession, signal: controller.signal });
  const { body, guard } = initialVerification ?? await verifyReadSession({
    ...options, outbox, accountId, previous, isCurrentSession, signal: controller.signal,
  });
  if (!guard) throw new SessionReadError('auth');
  for (const name of ['aiSync', 'weeklyMenuSync']) {
    const capability = body?.[name];
    if (!isRecord(capability) || capability.protocol !== 1 || capability.guard !== 1) throw new SessionReadError('protocol');
  }
  if (options.requireMenuProjection && (!isRecord(body?.profileSync) || body.profileSync.protocol !== 1
    || body.profileSync.guard !== 1 || body.profileSync.weeklyMenuProjection !== 1)) throw new SessionReadError('protocol');
  if (options.requireFamilyMenu && (!isRecord(body?.familyMenuSync) || body.familyMenuSync.protocol !== 1
    || body.familyMenuSync.guard !== 1 || body.familyMenuSync.cas !== 1)) throw new SessionReadError('protocol');
  const session = { ...options, guard: Object.freeze({ ...guard }), controller, isCurrentSession, outbox };
  await assertAiSession(session);
  return session;
}

/** One bounded POST, including its body; fallback models reuse this same captured scope. */
export async function postScopedAiJson(session: AiSession, url: '/api/ai' | '/api/weekly_menu/items', payload: unknown) {
  const body = JSON.stringify(payload);
  await assertAiSession(session);
  // A request deadline must not cancel the page action: its catch/finally still need to update the UI.
  const requestController = new AbortController();
  const onAbort = () => requestController.abort();
  session.controller.signal.addEventListener('abort', onAbort, { once: true });
  if (session.controller.signal.aborted) requestController.abort();
  const onHide = () => session.controller.abort();
  const target = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : undefined;
  target?.addEventListener('pagehide', onHide);
  try {
    const result = await requestJson(session.fetchImpl ?? fetch, url, {
      method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-Request-ID': `web-${crypto.randomUUID()}`,
        'X-FitFocus-State-Account': session.guard.accountId, 'X-FitFocus-State-Session': session.guard.serverSessionId,
      }, body,
    }, requestController, session.timeoutMs ?? 12_000);
    await assertAiSession(session);
    const resource = url === '/api/ai' ? 'AI' : 'Weekly-Menu';
    const headers = result.response.headers;
    if (headers.get(`X-FitFocus-${resource}-Protocol`) !== '1' || headers.get(`X-FitFocus-${resource}-Guard`) !== '1'
      || headers.get('X-FitFocus-State-Account') !== session.guard.accountId
      || headers.get('X-FitFocus-State-Session') !== session.guard.serverSessionId) throw new SessionReadError('protocol');
    if (result.response.status === 401) throw new SessionReadError('auth');
    if (result.response.status === 403 && result.body?.error === 'ACCESS_REQUIRED') throw new SessionReadError('access');
    return result;
  } finally {
    session.controller.signal.removeEventListener('abort', onAbort);
    target?.removeEventListener('pagehide', onHide);
  }
}
