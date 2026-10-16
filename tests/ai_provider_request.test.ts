import { describe, expect, it, vi } from 'vitest';
import { requestAiProvider } from '../functions/api/_lib/ai_provider_request';

describe('AI provider request', () => {
  it('retries only a Gemini model availability failure with the configured fallback model', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const result = await requestAiProvider({
        model: 'gemini-2.5-pro',
        apiKey: 'test-gemini-key',
        payload: { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] },
        timeoutMs: 1_000,
      });

      expect(result.response.status).toBe(200);
      expect(result.effectiveModel).toBe('gemini-2.5-flash');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[0][0])).toContain('/models/gemini-2.5-pro:generateContent');
      expect(String(fetchMock.mock.calls[1][0])).toContain('/models/gemini-2.5-flash:generateContent');
      expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-goog-api-key')).toBe('test-gemini-key');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
