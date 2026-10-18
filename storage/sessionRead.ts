import { isRecord } from '../safeJson';
import { DurableOutbox, type OutboxReadGuard } from './durableOutbox';
import { listenForPageExit, requestJson, type JsonResponse } from './sessionTransport';

export class SessionReadError extends Error {
  constructor(readonly kind: 'session' | 'protocol' | 'auth' | 'access') {
    super(kind === 'session' ? 'LOGIN_SESSION_CHANGED' : `SESSION_READ_${kind.toUpperCase()}`);
  }
}
export type SessionReadOptions = {
  outbox?: DurableOutbox;
  fetchImpl?: typeof fetch;
  isCurrentSession?: () => boolean;
  timeoutMs?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  expectedAuthFence?: number;
  requireNoActiveSession?: boolean;
};
const current = (options: SessionReadOptions) => {
  if (options.signal?.aborted || options.isCurrentSession?.() === false) throw new SessionReadError('session');
};
export async function assertReadSession(guard: OutboxReadGuard, options: SessionReadOptions = {}): Promise<void> {
  current(options);
  if (!await (options.outbox ?? new DurableOutbox()).isReadSessionCurrent(guard)) throw new SessionReadError('session');
  current(options);
}

/** Safe GET retries share one request id and one deadline, including the body. */
async function readJson(url: string, headers: HeadersInit, options: SessionReadOptions): Promise<JsonResponse> {
  const controller = new AbortController();
  let hidden = false;
  const onHide = () => { hidden = true; controller.abort(); };
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const removePageExit = listenForPageExit(onHide);
  const deadline = Date.now() + (options.timeoutMs ?? 12_000);
  const requestHeaders = new Headers(headers);
  requestHeaders.set('X-Request-ID', `web-${crypto.randomUUID()}`);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      current(options);
      const remaining = deadline - Date.now();
      if (remaining <= 0 || controller.signal.aborted) throw new Error('STATE_REQUEST_ABORTED');
      try {
        const result = await requestJson(options.fetchImpl ?? fetch, url, { headers: requestHeaders }, controller, remaining);
        current(options);
        if (result.response.status < 500 || attempt === 1) return result;
      } catch (error) {
        if (error instanceof Error && error.message === 'STATE_RESPONSE_TOO_LARGE') throw new SessionReadError('protocol');
        if (error instanceof SessionReadError || attempt === 1 || controller.signal.aborted) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, options.retryDelayMs ?? 250));
    }
    throw new Error('STATE_REQUEST_FAILED');
  } catch (error) {
    if (hidden || options.signal?.aborted) throw new SessionReadError('session');
    throw error;
  } finally {
    removePageExit();
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** A /me result cannot cross logout or another accepted account/session in IDB. */
export async function verifyReadSession(options: SessionReadOptions & {
  accountId?: string; bootstrap?: boolean; previous?: OutboxReadGuard;
} = {}): Promise<{ body: Record<string, unknown> | null; guard: OutboxReadGuard | null }> {
  const outbox = options.outbox ?? new DurableOutbox();
  if (options.previous) await assertReadSession(options.previous, { ...options, outbox });
  const before = await outbox.sessionState(); current(options);
  if (options.expectedAuthFence !== undefined && before.fence !== options.expectedAuthFence
    || options.requireNoActiveSession && before.active) throw new SessionReadError('session');
  const { response, body } = await readJson(`/api/me?t=${Date.now()}`, {}, options);
  current(options);
  if (response.status === 408 || response.status === 429 || response.status >= 500) throw new Error('SESSION_READ_UNAVAILABLE');
  const proof = body?.stateSync;
  if (!response.ok || !isRecord(body?.user) || typeof body.user.sub !== 'string' || !body.user.sub
    || body.hasAccess !== true || !isRecord(proof) || proof.protocol !== 2 || proof.guard !== 1
    || proof.accountId !== body.user.sub || typeof proof.sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(proof.sessionId)
    || options.bootstrap && (!isRecord(body.bootstrapSync) || body.bootstrapSync.protocol !== 1 || body.bootstrapSync.guard !== 1)) {
    return { body, guard: null };
  }
  if (options.accountId && proof.accountId !== options.accountId
    || options.previous && (proof.accountId !== options.previous.accountId || proof.sessionId !== options.previous.serverSessionId)) {
    throw new SessionReadError('session');
  }
  const accepted = await outbox.acceptReadSession(proof.accountId, proof.sessionId, before.fence, options.previous,
    options.requireNoActiveSession);
  current(options);
  if (!accepted) throw new SessionReadError('session');
  await assertReadSession(accepted, { ...options, outbox });
  return { body, guard: accepted };
}

export async function readScopedJson(url: string, guard: OutboxReadGuard, protocol: 'bootstrap' | 'state', options: SessionReadOptions = {}): Promise<JsonResponse> {
  await assertReadSession(guard, options);
  const result = await readJson(url, {
    'X-FitFocus-State-Account': guard.accountId, 'X-FitFocus-State-Session': guard.serverSessionId,
  }, options);
  await assertReadSession(guard, options);
  if (result.response.status === 401) throw new SessionReadError('auth');
  if (result.response.status === 403) throw new SessionReadError('access');
  if (result.response.ok) {
    const name = protocol === 'bootstrap' ? 'Bootstrap' : 'State';
    const headers = result.response.headers;
    if (headers.get(`X-FitFocus-${name}-Protocol`) !== (protocol === 'state' ? '2' : '1')
      || headers.get(`X-FitFocus-${name}-Guard`) !== '1'
      || headers.get('X-FitFocus-State-Account') !== guard.accountId
      || headers.get('X-FitFocus-State-Session') !== guard.serverSessionId
      || protocol === 'bootstrap' && (!isRecord(result.body?.user) || result.body.user.sub !== guard.accountId)) {
      throw new SessionReadError('protocol');
    }
  }
  return result;
}
