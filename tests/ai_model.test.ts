import { describe, expect, it } from 'vitest';
import { normalizeGeminiTimeoutMs, resolveGeminiModel } from '../functions/api/ai';

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

describe('normalizeGeminiTimeoutMs', () => {
  it('falls back to the default timeout for missing or invalid input', () => {
    expect(normalizeGeminiTimeoutMs(undefined)).toBe(30000);
    expect(normalizeGeminiTimeoutMs('abc')).toBe(30000);
    expect(normalizeGeminiTimeoutMs('   ')).toBe(30000);
  });

  it('clamps explicit timeout values to the supported range', () => {
    expect(normalizeGeminiTimeoutMs('500')).toBe(1000);
    expect(normalizeGeminiTimeoutMs('2500')).toBe(2500);
    expect(normalizeGeminiTimeoutMs('120000')).toBe(60000);
  });
});
