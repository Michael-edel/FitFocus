import { isRecord } from '../safeJson';
export type JsonResponse = { response: Response; body: Record<string, unknown> | null };

/** One transport attempt includes headers and the bounded response body; no hidden mutation retries. */
export async function requestJson(fetchFn: typeof fetch, url: string, init: RequestInit, controller: AbortController, timeoutMs: number): Promise<JsonResponse> {
  if (controller.signal.aborted) throw new Error('STATE_REQUEST_ABORTED');
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
