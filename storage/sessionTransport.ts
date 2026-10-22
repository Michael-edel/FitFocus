import { isRecord } from '../safeJson';
export type JsonResponse = { response: Response; body: Record<string, unknown> | null };

type PageExitState = { exited: boolean };
const pageExitStates = new WeakMap<EventTarget, PageExitState>();

/** Remember pagehide across asynchronous preparation and the next request's listener registration. */
export function trackPageExit(target?: EventTarget): PageExitState | null {
  const page = target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!page) return null;
  const existing = pageExitStates.get(page);
  if (existing) return existing;
  const state = { exited: false };
  pageExitStates.set(page, state);
  page.addEventListener('pagehide', () => { state.exited = true; });
  page.addEventListener('pageshow', event => {
    if ((event as PageTransitionEvent).persisted) state.exited = false;
  });
  return state;
}

if (typeof window !== 'undefined') trackPageExit(window);

/** Run a request/session guard on exit, including an exit before listener registration. */
export function listenForPageExit(onPageExit: () => void, target?: EventTarget): () => void {
  const page = target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!page) return () => {};
  if (trackPageExit(page)?.exited) { onPageExit(); return () => {}; }

  let active = true;
  const cleanup = () => {
    if (!active) return;
    active = false;
    page.removeEventListener('beforeunload', handlePageExit);
    page.removeEventListener('pagehide', handlePageExit);
  };
  const handlePageExit = () => {
    if (!active) return;
    cleanup();
    onPageExit();
  };

  page.addEventListener('beforeunload', handlePageExit, { once: true });
  page.addEventListener('pagehide', handlePageExit);
  return cleanup;
}

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
