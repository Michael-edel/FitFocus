import { isJsonObject, safeJsonParse, type JsonObject } from "./json";

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("REQUEST_BODY_TOO_LARGE");
  }
}

export const SMALL_JSON_BODY_LIMIT_BYTES = 64 * 1024;
export const SUPPORT_FORM_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

export async function readRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readRequestText(request: Request, maxBytes: number): Promise<string> {
  const bytes = await readRequestBytes(request, maxBytes);
  return new TextDecoder().decode(bytes);
}

export async function readJsonRequest<T = unknown>(
  request: Request,
  maxBytes = SMALL_JSON_BODY_LIMIT_BYTES,
): Promise<T | null> {
  const text = await readRequestText(request, maxBytes);
  if (!text.trim()) return null;
  const parsed = safeJsonParse(text);
  return (parsed as T | null) ?? null;
}

export async function readJsonObjectRequest(
  request: Request,
  maxBytes = SMALL_JSON_BODY_LIMIT_BYTES,
): Promise<JsonObject | null> {
  const parsed = await readJsonRequest(request, maxBytes);
  return isJsonObject(parsed) ? parsed : null;
}

export async function readFormDataRequest(
  request: Request,
  maxBytes = SUPPORT_FORM_BODY_LIMIT_BYTES,
): Promise<FormData | null> {
  const bytes = await readRequestBytes(request, maxBytes);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  });

  try {
    return await boundedRequest.formData();
  } catch {
    return null;
  }
}
