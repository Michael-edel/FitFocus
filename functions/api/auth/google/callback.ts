import type { PagesFunction } from '@cloudflare/workers-types';
import { logApiEvent, requestIdFor, withRequestId } from '../../_lib/observability';
import { handleGoogleOAuthCallback, type GoogleOAuthEnv } from '../../_lib/google_oauth_callback';

export type { GoogleOAuthEnv } from '../../_lib/google_oauth_callback';

/** Records only the OAuth callback outcome; credentials and identity data stay private. */
export const onRequestGet: PagesFunction<GoogleOAuthEnv> = async (context) => {
  const response = await handleGoogleOAuthCallback(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("auth.google.callback.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};