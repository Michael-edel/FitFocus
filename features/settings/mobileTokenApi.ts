import { SessionReadError } from '../../storage/sessionRead';
import { assertMobileTokenSession, requestMobileTokenJson, type MobileTokenSession } from '../../services/mobileTokenSession';

type MobileTokenResponse = {
  token?: unknown;
  expiresAt?: unknown;
  error?: unknown;
};

export class MobileTokenApiError extends Error {
  constructor(readonly code: 'UNAUTH' | 'ACCESS_REQUIRED' | 'PROTOCOL' | 'SESSION_CHANGED' | 'REQUEST_FAILED') {
    const messages: Record<typeof code, string> = {
      UNAUTH: 'Сначала войдите в аккаунт FitFocus.',
      ACCESS_REQUIRED: 'Для создания мобильного токена требуется активированный доступ.',
      PROTOCOL: 'Сервер пока не поддерживает безопасную выдачу токена. Обновите приложение.',
      SESSION_CHANGED: 'Сессия изменилась. Войдите снова и повторите действие.',
      REQUEST_FAILED: 'Не удалось создать мобильный токен.',
    };
    super(messages[code]);
    this.name = 'MobileTokenApiError';
  }
}

function mapSessionError(error: unknown): never {
  if (error instanceof SessionReadError) {
    if (error.kind === 'auth') throw new MobileTokenApiError('UNAUTH');
    if (error.kind === 'access') throw new MobileTokenApiError('ACCESS_REQUIRED');
    if (error.kind === 'protocol') throw new MobileTokenApiError('PROTOCOL');
    throw new MobileTokenApiError('SESSION_CHANGED');
  }
  if (error instanceof Error && /STATE_REQUEST_ABORTED|STATE_RESPONSE_TOO_LARGE|Failed to fetch|Load failed|NetworkError/.test(error.message)) {
    throw new MobileTokenApiError('REQUEST_FAILED');
  }
  throw error;
}

/** Issues a short-lived mobile token without retrying this session-creating POST. */
export async function requestMobileToken(session: MobileTokenSession): Promise<{ token: string; expiresAt: number | null }> {
  try {
    const { response, body } = await requestMobileTokenJson(session);
    const payload = body as MobileTokenResponse | null;
    if (!response.ok || !payload || typeof payload.token !== 'string' || payload.token.length === 0) {
      throw new MobileTokenApiError(payload?.error === 'UNAUTH' ? 'UNAUTH' : 'REQUEST_FAILED');
    }
    await assertMobileTokenSession(session);
    return {
      token: payload.token,
      expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : null,
    };
  } catch (error) {
    if (error instanceof MobileTokenApiError) throw error;
    mapSessionError(error);
  }
}
