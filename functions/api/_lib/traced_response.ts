import { json } from './auth';
import { logApiEvent, withRequestId } from './observability';

/** Return JSON with a request correlation ID and a body-free structured event. */
export function tracedJsonResponse(
  event: string,
  requestId: string,
  body: unknown,
  status: number,
): Response {
  logApiEvent(event, { requestId, status });
  return withRequestId(json(body, status), requestId);
}
