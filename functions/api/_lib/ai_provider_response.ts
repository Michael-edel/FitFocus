import { isJsonObject, type JsonObject } from './json';
import type { AiProviderResponse } from './ai_provider_request';

export function getAiProviderUsage(data: AiProviderResponse) {
  const usage = isJsonObject(data.usageMetadata) ? data.usageMetadata : {};
  const openAiUsage = isJsonObject(data.usage) ? data.usage : {};
  const inputTokens = Number(usage.promptTokenCount || openAiUsage.input_tokens || 0);
  const outputTokens = Number(usage.candidatesTokenCount || openAiUsage.output_tokens || 0);
  const totalTokens = Number(usage.totalTokenCount || openAiUsage.total_tokens || inputTokens + outputTokens || 0);
  return { inputTokens, outputTokens, totalTokens };
}

export function estimateAiProviderCostUsd(inputTokens: number, outputTokens: number, inputPerMillion: number, outputPerMillion: number) {
  return (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
}

/** Reads the common text field from both Gemini and OpenAI Responses payloads. */
export function extractAiProviderText(data: AiProviderResponse): string {
  if (typeof data.text === 'string') return data.text;

  const parts: string[] = [];
  const candidates = data.candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (!isJsonObject(candidate) || !isJsonObject(candidate.content) || !Array.isArray(candidate.content.parts)) continue;
      for (const part of candidate.content.parts) {
        if (isJsonObject(part) && typeof part.text === 'string') parts.push(part.text);
      }
    }
  }

  const output = data.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!isJsonObject(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (!isJsonObject(content) || content.type !== 'output_text' || typeof content.text !== 'string') continue;
        parts.push(content.text);
      }
    }
  }
  return !parts.length && typeof data.output_text === 'string' ? data.output_text : parts.join('\n').trim();
}

export function aiProviderResponsePayload(text: string): JsonObject {
  return { text };
}
