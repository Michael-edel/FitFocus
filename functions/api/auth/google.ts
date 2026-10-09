import type { PagesFunction } from '@cloudflare/workers-types';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';
import { handleGoogleIdentityPost, type GoogleIdentityEnv } from '../_lib/google_identity_handler';

export type { GoogleIdentityEnv } from '../_lib/google_identity_handler';

/** Records only the sign-in outcome; credentials and identity data stay private. */
export const onRequestPost: PagesFunction<GoogleIdentityEnv> = async (context) => {
  const response = await handleGoogleIdentityPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("auth.google.identity.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};