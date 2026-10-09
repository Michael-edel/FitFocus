import { isJsonObject, type JsonObject } from './json';

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role?: 'user' | 'model'; parts: GeminiPart[] };
type OpenAiInputPart = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' };

export function normalizeAiContents(input: unknown): GeminiContent[] {
  const textContent = (text: string): GeminiContent => ({ role: 'user', parts: [{ text }] });
  const isPart = (part: unknown): part is GeminiPart => Boolean(part) && isJsonObject(part) && (
    typeof part.text === 'string' || (isJsonObject(part.inlineData) && typeof part.inlineData.mimeType === 'string' && typeof part.inlineData.data === 'string')
  );
  const content = (value: unknown): GeminiContent | null => {
    if (!value) return null;
    if (isJsonObject(value) && Array.isArray(value.parts) && value.parts.every(isPart)) return { role: value.role === 'model' ? 'model' : 'user', parts: value.parts };
    if (isPart(value)) return { role: 'user', parts: [value] };
    if (typeof value === 'string') return textContent(value);
    return isJsonObject(value) && typeof value.text === 'string' ? textContent(value.text) : null;
  };
  if (typeof input === 'string') return [textContent(input)];
  if (Array.isArray(input)) return input.map(content).filter((value): value is GeminiContent => value !== null);
  const single = content(input);
  return single ? [single] : [];
}

function normalizeOpenAiSchema(value: unknown): JsonObject | null {
  if (!isJsonObject(value)) return null;
  const type = typeof value.type === 'string' ? value.type.toLowerCase() : '';
  if (type === 'object') {
    const rawProperties = isJsonObject(value.properties) ? value.properties : {};
    const properties: JsonObject = {};
    for (const [name, property] of Object.entries(rawProperties)) {
      const normalized = normalizeOpenAiSchema(property);
      if (normalized) properties[name] = normalized;
    }
    return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false, ...(typeof value.description === 'string' ? { description: value.description } : {}) };
  }
  if (type === 'array') {
    const items = normalizeOpenAiSchema(value.items);
    return { type: 'array', ...(items ? { items } : {}), ...(typeof value.description === 'string' ? { description: value.description } : {}) };
  }
  return { ...value, ...(type ? { type } : {}) };
}

function openAiInput(input: unknown): JsonObject[] {
  return normalizeAiContents(input).flatMap((content) => {
    const parts: OpenAiInputPart[] = [];
    for (const part of content.parts) {
      if ('text' in part && typeof part.text === 'string') parts.push({ type: 'input_text', text: part.text });
      if ('inlineData' in part && part.inlineData.mimeType && part.inlineData.data) {
        const { mimeType, data } = part.inlineData;
        parts.push({ type: 'input_image', image_url: data.startsWith('data:') ? data : `data:${mimeType};base64,${data}`, detail: 'auto' });
      }
    }
    return parts.length ? [{ role: content.role === 'model' ? 'assistant' : 'user', content: parts }] : [];
  });
}

/** Translates the shared Gemini-shaped client payload into OpenAI Responses input. */
export function buildOpenAiProviderPayload(payload: JsonObject, model: string): JsonObject {
  const config = isJsonObject(payload.generationConfig) ? payload.generationConfig : {};
  const request: JsonObject = { model, input: openAiInput(payload.contents), store: false };
  const maxOutputTokens = Number(config.maxOutputTokens || 0);
  if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) request.max_output_tokens = Math.floor(maxOutputTokens);
  const schema = normalizeOpenAiSchema(config.responseSchema);
  request.text = schema
    ? { format: { type: 'json_schema', name: 'fitfocus_response', strict: true, schema } }
    : config.responseMimeType === 'application/json'
      ? { format: { type: 'json_object' } }
      : undefined;
  if (request.text === undefined) delete request.text;
  return request;
}
