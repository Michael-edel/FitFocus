export type HttpRetryOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
};

export class HttpRequestError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'timeout' | 'aborted',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'HttpRequestError';
  }
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRY_DELAY_MS = 250;

function isSafeMethod(method: string) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function requestIdFor(headersInit: HeadersInit | undefined): { headers: Headers; requestId: string } {
  const headers = new Headers(headersInit);
  const existing = headers.get('X-Request-ID')?.trim();
  const requestId = existing || `web-${crypto.randomUUID()}`;
  headers.set('X-Request-ID', requestId);
  return { headers, requestId };
}

function wait(delayMs: number) {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
}

/**
 * A small browser transport for idempotent reads. Mutations are never retried
 * automatically because the server may have accepted a request before a
 * network error reaches the browser.
 */
export async function fetchWithResilience(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: HttpRetryOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const method = (init.method ?? 'GET').toUpperCase();
  const retries = isSafeMethod(method) ? Math.max(0, options.retries ?? 0) : 0;
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  const { headers } = requestIdFor(init.headers);

  const callerSignal = init.signal;
  let activeController: AbortController | null = null;
  const abortActiveRequest = () => activeController?.abort();
  const throwAborted = (cause?: unknown): never => {
    throw new HttpRequestError('HTTP request aborted', 'aborted', cause);
  };

  if (callerSignal?.aborted) throwAborted(callerSignal.reason);
  callerSignal?.addEventListener('abort', abortActiveRequest, { once: true });

  try {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (callerSignal?.aborted) throwAborted(callerSignal.reason);

      const controller = new AbortController();
      activeController = controller;
      let timedOut = false;
      const timeout = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const response = await fetchImpl(input, { ...init, headers, signal: controller.signal });
        if (callerSignal?.aborted) throwAborted(callerSignal.reason);
        if (response.status < 500 || attempt === retries) return response;
      } catch (error: unknown) {
        if (callerSignal?.aborted) throwAborted(error);
        if (controller.signal.aborted && !timedOut) throwAborted(error);
        if (attempt === retries) {
          throw new HttpRequestError(
            timedOut ? 'HTTP request timed out' : 'HTTP request failed',
            timedOut ? 'timeout' : 'network',
            error,
          );
        }
      } finally {
        globalThis.clearTimeout(timeout);
        if (activeController === controller) activeController = null;
      }

      await wait(retryDelayMs);
      if (callerSignal?.aborted) throwAborted(callerSignal.reason);
    }
  } finally {
    callerSignal?.removeEventListener('abort', abortActiveRequest);
  }

  throw new HttpRequestError('HTTP request failed', 'network');
}
