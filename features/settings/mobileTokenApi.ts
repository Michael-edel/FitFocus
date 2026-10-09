import { fetchWithResilience } from '../../services/httpClient';

type MobileTokenResponse = {
  token?: unknown;
  expiresAt?: unknown;
  error?: unknown;
};

export class MobileTokenApiError extends Error {
  constructor(readonly code: string) {
    super(code === 'UNAUTH' ? 'Сначала войдите в аккаунт FitFocus.' : 'Не удалось создать мобильный токен.');
    this.name = 'MobileTokenApiError';
  }
}

async function readResponse(response: Response): Promise<MobileTokenResponse | null> {
  const value: unknown = await response.json().catch(() => null);
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MobileTokenResponse : null;
}

/** Issues a short-lived mobile token without retrying this session-creating POST. */
export async function requestMobileToken(): Promise<{ token: string; expiresAt: number | null }> {
  const response = await fetchWithResilience('/api/mobile/token', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const payload = await readResponse(response);
  if (!response.ok || !payload || typeof payload.token !== 'string') {
    throw new MobileTokenApiError(payload?.error === 'UNAUTH' ? 'UNAUTH' : 'REQUEST_FAILED');
  }
  return {
    token: payload.token,
    expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : null,
  };
}
