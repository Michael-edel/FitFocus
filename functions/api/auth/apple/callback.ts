import type { PagesFunction } from '@cloudflare/workers-types';
import { logApiEvent, requestIdFor, withRequestId } from '../../_lib/observability';
import { handleAppleOAuthCallback, type AppleOAuthEnv } from '../../_lib/apple_oauth_callback';

export type { AppleOAuthEnv } from '../../_lib/apple_oauth_callback';

/** Records only the OAuth callback outcome; credentials and identity data stay private. */
export const onRequest: PagesFunction<AppleOAuthEnv> = async (context) => {
  const response = await handleAppleOAuthCallback(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("auth.apple.callback.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};