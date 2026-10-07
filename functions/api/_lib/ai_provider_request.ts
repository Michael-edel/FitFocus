import { getAiFallbackModels } from '../../../aiModels';
import { isJsonObject, type JsonObject } from './json';

export type AiProviderResponse = JsonObject & {
  text?: string;
  output_text?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: string | { message?: string };
};

const DEFAULT_GEMINI_TIMEOUT_MS = 30_000;
const MIN_GEMINI_TIMEOUT_MS = 1_000;
const MAX_GEMINI_TIMEOUT_MS = 60_000;

export function normalizeGeminiTimeoutMs(value: unknown): number {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_GEMINI_TIMEOUT_MS;

  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed)) return DEFAULT_GEMINI_TIMEOUT_MS;
  return Math.min(MAX_GEMINI_TIMEOUT_MS, Math.max(MIN_GEMINI_TIMEOUT_MS, parsed));
}

export function classifyAiFetchFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError') return 'AI_FETCH_ABORTED';
  if (name === 'TimeoutError') return 'AI_FETCH_TIMEOUT';
  return 'AI_FETCH_FAILED';
}

export function getAiProviderErrorMessage(error: AiProviderResponse['error'], fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (isJsonObject(error) && typeof error.message === 'string' && error.message.trim()) return error.message;
  return fallback;
}

export function isGeminiModelAvailabilityError(status: number, data: AiProviderResponse): boolean {
  if (status === 404) return true;
  if (status !== 400 && status !== 403) return false;

  const errorText = [
    getAiProviderErrorMessage(data.error, ''),
    typeof data.message === 'string' ? data.message : '',
  ].join(' ').toLowerCase();

  return /model|not found|not supported|unsupported|does not exist|permission|access/.test(errorText);
}

function providerUrl(model: string): string {
  return model.startsWith('gpt-')
    ? 'https://api.openai.com/v1/responses'
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

/** Calls the selected provider and retries only known Gemini model-availability failures. */
export async function requestAiProvider(input: {
  model: string;
  apiKey: string;
  payload: Record<string, unknown>;
  timeoutMs: number;
}): Promise<{ response: Response; data: AiProviderResponse; effectiveModel: string }> {
  const usesOpenAiModel = input.model.startsWith('gpt-');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs);

  const requestProvider = async (model: string) => {
    const response = await fetch(providerUrl(model), {
      method: 'POST',
      headers: usesOpenAiModel
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` }
        : { 'Content-Type': 'application/json', 'x-goog-api-key': input.apiKey },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });
    const rawData: unknown = await response.json().catch(() => null);
    return { response, data: isJsonObject(rawData) ? rawData as AiProviderResponse : {} as AiProviderResponse };
  };

  try {
    let effectiveModel = input.model;
    let result = await requestProvider(effectiveModel);

    for (const fallbackModel of getAiFallbackModels(input.model)) {
      if (!isGeminiModelAvailabilityError(result.response.status, result.data)) break;
      effectiveModel = fallbackModel;
      result = await requestProvider(effectiveModel);
    }

    return { ...result, effectiveModel };
  } finally {
    clearTimeout(timeoutId);
  }
}
