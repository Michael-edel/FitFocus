import { isRecord } from '../safeJson';
import { DurableOutbox, type ActiveOutboxSession, type OutboxClaim, type OutboxOutcome } from './durableOutbox';
import { reportStateQueue, reportStateSaveIssue, reportStateSyncPause, subscribeStateSaveIssues } from './stateSaveStatus';
import { LEGACY_QUEUE_SOURCE_KEY } from './legacyQueue';

type JsonResponse = { response: Response; body: Record<string, unknown> | null };
type Options = { outbox?: DurableOutbox; fetchImpl?: typeof fetch; now?: () => number; random?: () => number; timeoutMs?: number; legacyPending?: () => boolean };
const LEASE_MS = 30_000;
const MAX_RETRIES = 8;
const MAX_RETRY_DELAY_MS = 15 * 60_000;

/** Until runtime migration proves its writer barrier, a nonempty/unknown old source blocks sending. */
function legacyPending(): boolean {
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_SOURCE_KEY);
    if (raw === null) return false;
    const records: unknown = JSON.parse(raw);
    return !Array.isArray(records) || records.length > 0;
  } catch { return true; }
}

/** One transport attempt includes headers and the bounded response body; no hidden mutation retries. */
async function requestJson(fetchFn: typeof fetch, url: string, init: RequestInit, controller: AbortController, timeoutMs: number): Promise<JsonResponse> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(new Error('STATE_REQUEST_ABORTED'));
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const work = (async () => {
    const response = await fetchFn(url, { ...init, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal });
    if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new Error('STATE_REQUEST_ABORTED'); }
    reader = response.body?.getReader();
    let text = ''; let size = 0;
    const decoder = new TextDecoder();
    if (reader) for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1024 * 1024) throw new Error('STATE_RESPONSE_TOO_LARGE');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    let body: unknown = null;
    try { body = JSON.parse(text); } catch {}
    return { response, body: isRecord(body) ? body : null };
  })();
  try { return await Promise.race([work, aborted]); }
  finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    void reader?.cancel().catch(() => {});
  }
}

export class StateSync {
  private readonly outbox: DurableOutbox;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly legacyPending: () => boolean;
  private readonly owner = crypto.randomUUID();
  private generation = 0;
  private accountId?: string;
  private session?: ActiveOutboxSession;
  private readonly requests = new Set<AbortController>();
  private running?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;

  constructor(options: Options = {}) {
    this.outbox = options.outbox ?? new DurableOutbox();
    this.fetchFn = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.legacyPending = options.legacyPending ?? legacyPending;
  }

  stop(): void {
    this.generation += 1;
    this.accountId = undefined; this.session = undefined;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.unsubscribe?.(); this.unsubscribe = undefined;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.reverify);
      window.removeEventListener('focus', this.reverify);
    }
  }

  async invalidate(): Promise<void> { this.stop(); await this.outbox.invalidateSessions(); }

  async connect(accountId: string): Promise<boolean> {
    this.stop(); this.accountId = accountId;
    return this.verify(this.generation);
  }

  start(accountId: string): void {
    const connecting = this.connect(accountId);
    const generation = this.generation;
    void connecting.then(() => this.wake()).catch(() => { if (generation === this.generation) this.storageError(accountId); });
    this.unsubscribe = subscribeStateSaveIssues(this.wake);
    // Polling also observes commits from tabs that do not have BroadcastChannel/Web Locks.
    this.timer = setInterval(this.wake, 1_000);
    window.addEventListener('online', this.reverify);
    window.addEventListener('focus', this.reverify);
  }

  private storageError(accountId: string): void {
    this.stop();
    reportStateSaveIssue({ accountId, key: `fitfocus_data_${accountId}_sync`, kind: 'error', reason: 'storage' });
  }

  private readonly reverify = () => {
    const generation = this.generation;
    const accountId = this.accountId;
    if (accountId) void this.verify(generation).then(() => this.wake()).catch(() => { if (generation === this.generation) this.storageError(accountId); });
  };

  private readonly wake = () => {
    if (!this.accountId || this.running) return;
    const accountId = this.accountId;
    const generation = this.generation;
    void this.flush().catch(() => { if (generation === this.generation) this.storageError(accountId); });
  };

  private async verify(generation: number): Promise<boolean> {
    const accountId = this.accountId;
    if (!accountId) return false;
    this.session = undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = await this.outbox.sessionState();
      if (generation !== this.generation || accountId !== this.accountId) return false;
      const controller = new AbortController(); this.requests.add(controller);
      let result: JsonResponse;
      try { result = await requestJson(this.fetchFn, '/api/me', {}, controller, this.timeoutMs); }
      catch { if (generation === this.generation) reportStateSyncPause(accountId, 'auth'); return false; }
      finally { this.requests.delete(controller); }
      if (generation !== this.generation || accountId !== this.accountId) return false;
      const { response, body } = result;
      const proof = body?.stateSync;
      if (!response.ok || !isRecord(body?.user) || body.user.sub !== accountId) {
        reportStateSyncPause(accountId, 'auth'); return false;
      }
      if (body?.hasAccess !== true) { reportStateSyncPause(accountId, 'access'); return false; }
      if (!isRecord(proof) || proof.accountId !== accountId || proof.protocol !== 2 || proof.guard !== 1
        || typeof proof.sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(proof.sessionId)) {
        reportStateSyncPause(accountId, 'protocol'); return false;
      }
      const accepted = await this.outbox.acceptSession(accountId, proof.sessionId, before.fence);
      if (generation !== this.generation || accountId !== this.accountId) return false;
      if (accepted) {
        this.session = accepted;
        reportStateSyncPause(accountId, null);
        return true;
      }
      // A competing proof changed the fence: obtain a new server observation, never adopt the old response.
    }
    reportStateSyncPause(accountId, 'auth');
    return false;
  }

  flush(): Promise<void> {
    if (this.running) return this.running;
    const generation = this.generation;
    this.running = this.drain(generation).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async drain(generation: number): Promise<void> {
    const accountId = this.accountId;
    if (!accountId) return;
    try {
      for (let count = 0; count < 20 && generation === this.generation; count += 1) {
        const state = await this.outbox.sessionState();
        if (generation !== this.generation) return;
        if (state.active?.accountId === accountId && state.active.pause === 'legacy' && !this.legacyPending()) {
          if (await this.verify(generation)) continue;
          return;
        }
        if (state.active?.accountId === accountId && (state.active.pause || state.active.sessionEpoch === this.session?.sessionEpoch)) {
          reportStateSyncPause(accountId, state.active.pause ?? null);
        }
        if (!this.session || state.active?.sessionEpoch !== this.session.sessionEpoch || state.active.pause
          || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
        const session = this.session;
        const claim = await this.outbox.claim({ accountId, sessionEpoch: session.sessionEpoch, owner: this.owner, nowMs: this.now(), leaseMs: LEASE_MS });
        if (!claim || generation !== this.generation) return;
        if (this.legacyPending()) {
          await this.outbox.finish(claim, { kind: 'retry', reason: 'legacy-import-required', pause: 'legacy', nextAttemptAtMs: this.now() }, this.now());
          continue;
        }
        const controller = new AbortController(); this.requests.add(controller);
        let outcome: OutboxOutcome;
        try {
          const headers = { 'Content-Type': 'application/json', 'X-FitFocus-State-Account': accountId,
            'X-FitFocus-State-Session': session.serverSessionId! };
          const url = claim.type === 'put' ? '/api/state' : `/api/state?key=${encodeURIComponent(claim.key)}&baseVersion=${claim.baseVersion}`;
          const init: RequestInit = claim.type === 'put'
            ? { method: 'PUT', headers, body: JSON.stringify({ items: [{ key: claim.key, value: claim.value, baseVersion: claim.baseVersion }] }) }
            : { method: 'DELETE', headers };
          const result = await requestJson(this.fetchFn, url, init, controller, this.timeoutMs);
          outcome = this.outcome(claim, result, session.serverSessionId!);
        } catch { outcome = this.retry(claim, 'network-or-timeout'); }
        finally { this.requests.delete(controller); }
        if (generation !== this.generation) return;
        await this.outbox.finish(claim, outcome, this.now());
      }
    } finally {
      if (generation === this.generation) reportStateQueue(accountId, await this.outbox.list(accountId));
    }
  }

  private retry(claim: OutboxClaim, reason: string, retryAfter?: string | null): OutboxOutcome {
    if (claim.retryCount >= MAX_RETRIES - 1) return { kind: 'failed', reason: 'retry-exhausted' };
    const cap = Math.min(60_000, 1_000 * 2 ** Math.min(claim.retryCount, 6));
    const jitter = Math.max(250, Math.floor(cap * Math.max(0, Math.min(1, this.random()))));
    const seconds = retryAfter == null ? NaN : Number(retryAfter);
    const requested = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : Date.parse(retryAfter ?? '') - this.now();
    const delay = Math.min(MAX_RETRY_DELAY_MS, Math.max(jitter, Number.isFinite(requested) ? requested : 0));
    return { kind: 'retry', reason, nextAttemptAtMs: this.now() + delay };
  }

  private outcome(claim: OutboxClaim, { response, body }: JsonResponse, serverSessionId: string): OutboxOutcome {
    const scope = response.headers.get('X-FitFocus-State-Protocol') === '2' && response.headers.get('X-FitFocus-State-Guard') === '1'
      && response.headers.get('X-FitFocus-State-Account') === claim.accountId && response.headers.get('X-FitFocus-State-Session') === serverSessionId;
    const pause = (reason: 'auth' | 'access' | 'protocol'): OutboxOutcome => ({ kind: 'retry', reason, pause: reason, nextAttemptAtMs: this.now() });
    if (response.status === 401) return pause('auth');
    if (response.status === 403 && body?.error === 'ACCESS_REQUIRED') return pause('access');
    if (response.status === 409) {
      const snapshot = scope && body?.key === claim.key && typeof body.value === 'string' && typeof body.exists === 'boolean'
        && typeof body.version === 'number' && Number.isSafeInteger(body.version) && body.version >= (body.exists ? 1 : 0)
        ? { value: body.value, version: body.version, exists: body.exists } : undefined;
      return { kind: 'conflicted', reason: 'server-version-conflict', ...(snapshot ? { serverSnapshot: snapshot } : {}) };
    }
    if (response.ok) {
      const item = claim.type === 'put' && Array.isArray(body?.items) && body.items.length === 1 ? body.items[0] : claim.type === 'delete' ? body : null;
      if (scope && body?.ok === true && isRecord(item) && item.key === claim.key && item.exists === (claim.type === 'put')
        && typeof item.version === 'number' && Number.isSafeInteger(item.version) && item.version > claim.baseVersion) {
        return { kind: 'acknowledged', version: item.version };
      }
      return pause('protocol');
    }
    if (response.status === 408 || response.status === 429 || response.status >= 500) return this.retry(claim, `http-${response.status}`, response.headers.get('Retry-After'));
    return { kind: 'failed', reason: response.status === 403 && body?.error === 'FORBIDDEN_KEYSPACE' ? 'FORBIDDEN_KEYSPACE' : `http-${response.status}` };
  }
}

export const stateSync = new StateSync();
