import { afterEach, describe, expect, it, vi } from 'vitest';
import { disconnectHuaweiHealth, requestHuaweiHealthStatus, syncHuaweiHealth } from '../features/settings/huaweiHealthApi';

describe('Huawei Health feature API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the shared GET transport for status and normalizes its public contract', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBeUndefined();
      expect(new Headers(init?.headers).get('X-Request-ID')).toMatch(/^web-/);
      return new Response(JSON.stringify({ configured: true, connected: true, status: 'connected', scope: 'health.read', expiresAt: 7, lastSyncAt: 3 }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestHuaweiHealthStatus()).resolves.toEqual({ configured: true, connected: true, status: 'connected', scope: 'health.read', expiresAt: 7, lastSyncAt: 3 });
  });

  it('does not retry credential-changing Huawei requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({ disconnected: true, profile: {}, updatedFields: ['wearableStepsToday'] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(disconnectHuaweiHealth()).resolves.toMatchObject({ disconnected: true });
    await expect(syncHuaweiHealth('UTC', '2026-10-08')).resolves.toMatchObject({ updatedFields: ['wearableStepsToday'] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
