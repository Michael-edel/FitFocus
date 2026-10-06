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
});
