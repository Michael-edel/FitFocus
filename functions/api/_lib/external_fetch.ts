export type FetchTimeoutOptions = {
  timeoutMs: number;
  timeoutError?: string;
};

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  options: FetchTimeoutOptions,
): Promise<Response>;
export function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: FetchTimeoutOptions,
  consumeResponse: (response: Response) => Promise<T>,
): Promise<T>;

/** Keeps the deadline through required response processing as well as headers. */
export async function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchTimeoutOptions,
  consumeResponse?: (response: Response) => Promise<T>,
): Promise<Response | T> {
  const controller = new AbortController();
  const inherited = init.signal;
  const onAbort = () => controller.abort();
  if (inherited?.aborted) {
    controller.abort();
  } else {
    inherited?.addEventListener("abort", onAbort, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return consumeResponse ? await consumeResponse(response) : response;
  } catch (error) {
    if (options.timeoutError && controller.signal.aborted && !inherited?.aborted) {
      throw new Error(options.timeoutError);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    inherited?.removeEventListener("abort", onAbort);
  }
}
