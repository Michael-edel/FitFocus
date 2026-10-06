export type HttpRetryOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
};

export class HttpRequestError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'timeout',
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

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(input, { ...init, signal: controller.signal });
      if (response.status < 500 || attempt === retries) return response;
    } catch (error: unknown) {
      const timedOut = controller.signal.aborted;
      if (attempt === retries) {
        throw new HttpRequestError(
          timedOut ? 'HTTP request timed out' : 'HTTP request failed',
          timedOut ? 'timeout' : 'network',
          error,
        );
      }
    } finally {
      globalThis.clearTimeout(timeout);
    }

    await wait(retryDelayMs);
  }

  throw new HttpRequestError('HTTP request failed', 'network');
}
