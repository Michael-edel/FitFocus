import { json } from '../_lib/auth';
import { withSessionGuard } from '../_lib/state_session';

type Env = { DB?: D1Database; AUTH_JWT_SECRET?: string };

/** Marks admin responses so the client can reject stale or unguarded results. */
export const onRequest: PagesFunction<Env> = async ({ request, next }) => {
  let response: Response;
  try {
    response = await next();
  } catch (error) {
    if (!(error instanceof Error) || !['STATE_SESSION_CHANGED', 'STATE_SESSION_REQUIRED'].includes(error.message)) throw error;
    response = json({ error: 'UNAUTH' }, 401);
  }
  return withSessionGuard(response, request, 'Admin');
};
