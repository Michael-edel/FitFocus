export type FetchTimeoutOptions = {
  timeoutMs: number;
  timeoutError?: string;
};

/** Runs one external request with a bounded lifetime while preserving caller cancellation. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchTimeoutOptions,
): Promise<Response> {
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
    return await fetch(input, { ...init, signal: controller.signal });
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
