const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Use a caller-provided correlation ID only when it has a safe bounded form. */
export function requestIdFor(request: Request): string {
  const requestId = request.headers.get('x-request-id')?.trim() || '';
  return REQUEST_ID_PATTERN.test(requestId) ? requestId : createRequestId();
}

export function withRequestId(response: Response, requestId: string): Response {
  response.headers.set('X-Request-ID', requestId);
  return response;
}

/** Emit compact, machine-readable server events without request bodies or user identifiers. */
export function logApiEvent(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({
    component: 'api',
    event,
    at: new Date().toISOString(),
    ...fields,
  }));
}
