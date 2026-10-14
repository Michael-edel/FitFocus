import { SessionReadError } from '../../storage/sessionRead';
import { requestHuaweiJson, type HuaweiSession } from '../../services/huaweiSession';

export type HuaweiHealthStatus = {
  configured: boolean;
  connected: boolean;
  status: string;
  scope: string;
  expiresAt: number | null;
  lastSyncAt: number | null;
};

type HuaweiProfileResponse = { profile?: unknown; updatedFields?: unknown };

function errorFor(code: unknown, fallback: string): Error {
  if (code === 'UNAUTH' || code === 'SESSION_MISMATCH') return new Error('Сначала войдите в аккаунт FitFocus.');
  return new Error(fallback);
}

export async function requestHuaweiHealthStatus(session: HuaweiSession): Promise<HuaweiHealthStatus> {
  const { response, body } = await requestHuaweiJson(session, '/api/wearable/huawei/status', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok || !body) throw errorFor(body?.error, 'Не удалось проверить Huawei Health.');
  return {
    configured: body.configured === true,
    connected: body.connected === true,
    status: typeof body.status === 'string' ? body.status : 'disconnected',
    scope: typeof body.scope === 'string' ? body.scope : '',
    expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : null,
    lastSyncAt: typeof body.lastSyncAt === 'number' ? body.lastSyncAt : null,
  };
}

export async function startHuaweiHealthOAuth(session: HuaweiSession, redirect: string): Promise<string> {
  const { response, body } = await requestHuaweiJson(session, '/api/wearable/huawei/start', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect }),
  });
  if (!response.ok || !body || typeof body.authorizeUrl !== 'string') {
    throw errorFor(body?.error, 'Не удалось начать подключение Huawei Health.');
  }
  let target: URL;
  try { target = new URL(body.authorizeUrl); } catch { throw new SessionReadError('protocol'); }
  if (target.protocol !== 'https:') throw new SessionReadError('protocol');
  return target.toString();
}

export async function disconnectHuaweiHealth(session: HuaweiSession): Promise<HuaweiProfileResponse> {
  const { response, body } = await requestHuaweiJson(session, '/api/wearable/huawei/disconnect', {
    method: 'POST', headers: { Accept: 'application/json' },
  });
  if (!response.ok || !body) throw errorFor(body?.error, 'Не удалось отключить Huawei Health.');
  return body;
}

export async function syncHuaweiHealth(session: HuaweiSession, timezone: string, date: string): Promise<HuaweiProfileResponse> {
  const { response, body } = await requestHuaweiJson(session, '/api/wearable/huawei/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ timezone, date }),
  });
  if (!response.ok || !body) {
    const message = body?.error === 'HUAWEI_NOT_CONNECTED'
      ? 'Huawei Health ещё не подключён.'
      : body?.error === 'NO_HUAWEI_DATA'
        ? 'Huawei Health не вернул данные за сегодня.'
        : body?.error === 'UNAUTH'
          ? 'Сначала войдите в аккаунт FitFocus.'
          : 'Не удалось синхронизировать Huawei Health.';
    throw new Error(message);
  }
  return body;
}
