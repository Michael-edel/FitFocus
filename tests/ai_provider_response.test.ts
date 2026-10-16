import { describe, expect, it } from 'vitest';
import { estimateAiProviderCostUsd, extractAiProviderText, getAiProviderUsage } from '../functions/api/_lib/ai_provider_response';

describe('AI provider response helpers', () => {
  it('reads usage from Gemini and OpenAI response formats', () => {
    expect(getAiProviderUsage({ usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, totalTokenCount: 16 } })).toEqual({ inputTokens: 12, outputTokens: 4, totalTokens: 16 });
    expect(getAiProviderUsage({ usage: { input_tokens: 8, output_tokens: 3, total_tokens: 11 } })).toEqual({ inputTokens: 8, outputTokens: 3, totalTokens: 11 });
  });

  it('extracts OpenAI Responses output and calculates cost', () => {
    expect(extractAiProviderText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Готово' }] }] })).toBe('Готово');
    expect(estimateAiProviderCostUsd(500_000, 250_000, 0.2, 1.2)).toBeCloseTo(0.4);
  });
});
