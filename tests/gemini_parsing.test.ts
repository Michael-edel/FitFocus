import { describe, expect, it } from 'vitest';
import { extractTextFromGemini, normalizeShoppingListItems } from '../geminiService';

describe('Gemini response parsing', () => {
  it('extracts direct text first', () => {
    expect(extractTextFromGemini({ text: 'Готовый ответ' })).toBe('Готовый ответ');
  });

  it('extracts text from candidates content parts', () => {
    const text = extractTextFromGemini({
      candidates: [
        { content: { parts: [{ text: 'Первая строка' }, { text: 'Вторая строка' }] } },
      ],
    });

    expect(text).toBe('Первая строка\nВторая строка');
  });

  it('ignores malformed candidate shapes without throwing', () => {
    expect(extractTextFromGemini({ candidates: [{ content: null }, { broken: true }] })).toBe('');
  });
});

describe('weekly shopping list normalization', () => {
  it('normalizes structured shopping items without unsafe casts', () => {
    expect(normalizeShoppingListItems([{ name: 'Творог 5% (500 г)', grams: 0 }], [])).toEqual([
      { name: 'Творог 5%', grams: 500 },
    ]);
  });

  it('falls back to plain shopping list grams when structured items are invalid', () => {
    expect(normalizeShoppingListItems([{ name: '', grams: 0 }], ['Куриное филе — 1.2 кг'])).toEqual([
      { name: 'Куриное филе', grams: 1200 },
    ]);
  });
});
