import { fetchWithResilience } from '../../services/httpClient';

type JsonRecord = Record<string, unknown>;

export type HuaweiHealthStatus = {
  configured: boolean;
  connected: boolean;
  status: string;
  scope: string;
  expiresAt: number | null;
  lastSyncAt: number | null;
};

type HuaweiProfileResponse = { profile?: unknown; updatedFields?: unknown };

async function readJsonRecord(response: Response): Promise<JsonRecord | null> {
  const value: unknown = await response.json().catch(() => null);
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function errorFor(code: unknown, fallback: string): Error {
  return new Error(code === 'UNAUTH' ? 'Сначала войдите в аккаунт FitFocus.' : fallback);
}

/** Reads Huawei connection status through the retryable GET transport. */
export async function requestHuaweiHealthStatus(): Promise<HuaweiHealthStatus> {
  const response = await fetchWithResilience('/api/wearable/huawei/status', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }, { retries: 1 });
  const payload = await readJsonRecord(response);
  if (!response.ok || !payload) throw errorFor(payload?.error, 'Не удалось проверить Huawei Health.');
  return {
    configured: payload.configured === true,
    connected: payload.connected === true,
    status: typeof payload.status === 'string' ? payload.status : 'disconnected',
    scope: typeof payload.scope === 'string' ? payload.scope : '',
    expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : null,
    lastSyncAt: typeof payload.lastSyncAt === 'number' ? payload.lastSyncAt : null,
  };
}

/** Disconnects without automatic retry because it changes server-side credentials. */
export async function disconnectHuaweiHealth(): Promise<HuaweiProfileResponse> {
  const response = await fetchWithResilience('/api/wearable/huawei/disconnect', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const payload = await readJsonRecord(response);
  if (!response.ok || !payload) throw errorFor(payload?.error, 'Не удалось отключить Huawei Health.');
  return payload;
}

/** Syncs a single local day without automatic retry to avoid duplicate provider work. */
export async function syncHuaweiHealth(timezone: string, date: string): Promise<HuaweiProfileResponse> {
  const response = await fetchWithResilience('/api/wearable/huawei/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ timezone, date }),
  });
  const payload = await readJsonRecord(response);
  if (!response.ok || !payload) {
    const message = payload?.error === 'HUAWEI_NOT_CONNECTED'
      ? 'Huawei Health ещё не подключён.'
      : payload?.error === 'NO_HUAWEI_DATA'
        ? 'Huawei Health не вернул данные за сегодня.'
        : payload?.error === 'UNAUTH'
          ? 'Сначала войдите в аккаунт FitFocus.'
          : 'Не удалось синхронизировать Huawei Health.';
    throw new Error(message);
  }
  return payload;
}
