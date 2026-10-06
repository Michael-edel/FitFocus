import { describe, expect, it, vi } from 'vitest';
import { logApiEvent, requestIdFor, withRequestId } from '../functions/api/_lib/observability';

describe('API observability', () => {
  it('keeps a safe caller request ID and returns it in the response', () => {
    const request = new Request('https://fitfocus.test/api/state', {
      headers: { 'X-Request-ID': 'web-8f4a0d3e-0001' },
    });
    const requestId = requestIdFor(request);

    expect(requestId).toBe('web-8f4a0d3e-0001');
    expect(withRequestId(new Response('{}'), requestId).headers.get('X-Request-ID')).toBe(requestId);
  });

  it('does not emit request bodies or user identifiers in structured events', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    logApiEvent('state.response', { requestId: 'web-8f4a0d3e-0001', status: 200, itemCount: 2 });

    expect(info).toHaveBeenCalledWith(expect.stringContaining('"event":"state.response"'));
    expect(info).toHaveBeenCalledWith(expect.not.stringContaining('userId'));
    info.mockRestore();
  });
});
