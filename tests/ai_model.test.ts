import { describe, expect, it } from 'vitest';
import {
  isGeminiModelAvailabilityError,
  normalizeGeminiTimeoutMs,
  resolveGeminiFallbackModels,
  resolveGeminiModel,
} from '../functions/api/ai';

describe('resolveGeminiModel', () => {
  it('keeps server-supported Gemini models', () => {
    expect(resolveGeminiModel('gemini-2.5-flash')).toBe('gemini-2.5-flash');
    expect(resolveGeminiModel('gemini-2.5-pro')).toBe('gemini-2.5-pro');
    expect(resolveGeminiModel('gpt-5.6-luna')).toBe('gpt-5.6-luna');
  });

  it('falls back to Luna for unknown or blank input', () => {
    expect(resolveGeminiModel('gemini-expensive-preview')).toBe('gpt-5.6-luna');
    expect(resolveGeminiModel('   ')).toBe('gpt-5.6-luna');
    expect(resolveGeminiModel(undefined)).toBe('gpt-5.6-luna');
  });

  it('provides a different stable model for each supported model failure', () => {
    expect(resolveGeminiFallbackModels('gemini-2.5-pro')).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ]);
    expect(resolveGeminiFallbackModels('gemini-2.5-flash')).toEqual(['gemini-2.5-flash-lite']);
    expect(resolveGeminiFallbackModels('gemini-2.5-flash-lite')).toEqual(['gemini-2.5-flash']);
  });
});

describe('isGeminiModelAvailabilityError', () => {
  it('recognizes an unavailable model without treating every 400 as a model error', () => {
    expect(isGeminiModelAvailabilityError(404, {})).toBe(true);
    expect(isGeminiModelAvailabilityError(400, { error: { message: 'model not found' } })).toBe(true);
    expect(isGeminiModelAvailabilityError(400, { error: { message: 'invalid input' } })).toBe(false);
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
