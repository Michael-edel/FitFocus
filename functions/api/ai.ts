import type { PagesFunction } from '@cloudflare/workers-types';
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';
import { handleAiPost, type Env } from './_lib/ai_request_handler';

export { buildFallbackAdvice, calcTargetCalories } from './_lib/ai_fallback';
export { isGeminiModelAvailabilityError, normalizeGeminiTimeoutMs } from './_lib/ai_provider_request';
export { resolveGeminiFallbackModels, resolveGeminiModel } from './_lib/ai_request_handler';
export type { Env } from './_lib/ai_request_handler';

/** Adds a correlation identifier to every AI response without logging user content. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleAiPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('ai.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};