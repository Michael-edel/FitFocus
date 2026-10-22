import { describe, expect, it, vi } from 'vitest';
import { fetchWithResilience } from '../services/httpClient';

describe('HTTP client', () => {
  it('retries a safe GET request after a temporary network failure', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(fetchWithResilience('/api/family', {}, {
      retries: 1,
      retryDelayMs: 0,
      fetchImpl: fetchMock,
    })).resolves.toBeInstanceOf(Response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a mutation after a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(fetchWithResilience('/api/family', { method: 'POST' }, {
      retries: 3,
      retryDelayMs: 0,
      fetchImpl: fetchMock,
    })).rejects.toMatchObject({ kind: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors the caller abort signal and never retries the aborted request', async () => {
    const controller = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      markStarted();
    }));

    const request = fetchWithResilience('/api/env', { signal: controller.signal }, {
      retries: 2,
      retryDelayMs: 0,
      fetchImpl: fetchMock,
    });
    await started;
    controller.abort();

    await expect(request).rejects.toMatchObject({ kind: 'aborted' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an already-aborted caller signal without starting a request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn<typeof fetch>();

    await expect(fetchWithResilience('/api/env', { signal: controller.signal }, { fetchImpl: fetchMock }))
      .rejects.toMatchObject({ kind: 'aborted' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not start a safe-read retry when the caller aborts during backoff', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    const request = fetchWithResilience('/api/env', { signal: controller.signal }, {
      retries: 1,
      retryDelayMs: 100,
      fetchImpl: fetchMock,
    });
    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ kind: 'aborted' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('adds a correlation ID when the caller did not provide one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await fetchWithResilience('/api/shopping/list', {}, { fetchImpl: fetchMock });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get('X-Request-ID')).toMatch(/^web-/);
  });
});
