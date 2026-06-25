import { describe, expect, it } from 'vitest';
import { resolveGeminiModel } from '../functions/api/ai';

describe('resolveGeminiModel', () => {
  it('keeps server-supported Gemini models', () => {
    expect(resolveGeminiModel('gemini-2.5-flash')).toBe('gemini-2.5-flash');
    expect(resolveGeminiModel('gemini-2.5-pro')).toBe('gemini-2.5-pro');
  });

  it('falls back to the default model for unknown or blank input', () => {
    expect(resolveGeminiModel('gemini-expensive-preview')).toBe('gemini-2.5-flash');
    expect(resolveGeminiModel('   ')).toBe('gemini-2.5-flash');
    expect(resolveGeminiModel(undefined)).toBe('gemini-2.5-flash');
  });
});
