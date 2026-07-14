import { describe, expect, it } from 'vitest';
import {
  extractTextFromGemini,
  normalizeCoachAdvice,
  normalizeEnhancedFoodPhotoAnalysis,
  normalizeFoodPhotoAnalysis,
  normalizeRecipe,
  normalizeShoppingListItems,
} from '../geminiService';

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

describe('food photo response normalization', () => {
  it('forces non-food payloads to zero nutrition', () => {
    expect(normalizeFoodPhotoAnalysis({
      name: 'Золотистый ретривер',
      nonFood: true,
      calories: 400,
      protein: 200,
      fat: 13,
      carbs: 15,
      ingredients: [{ name: 'шерсть', percent: 100 }],
    })).toEqual({
      name: 'Золотистый ретривер',
      nonFood: true,
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      ingredients: [],
      notes: ['Это не еда и не пищевой продукт. Запись не учитывается в КБЖУ.'],
    });
  });

  it('clamps food ingredient percentages and model confidence', () => {
    expect(normalizeFoodPhotoAnalysis({
      name: 'Манты',
      calories: '610',
      protein: 45.4,
      fat: 39.6,
      carbs: 125.2,
      ingredients: [
        { name: 'Тесто', percent: 120 },
        { name: 'Фарш', percent: -5 },
        { name: '' },
      ],
      modelConfidence: 2,
      portionGrams: 480.8,
    })).toMatchObject({
      name: 'Манты',
      calories: 610,
      protein: 45,
      fat: 40,
      carbs: 125,
      modelConfidence: 1,
      portionGrams: 481,
      ingredients: [
        { name: 'Тесто', percent: 100 },
        { name: 'Фарш', percent: 0 },
      ],
    });
  });

  it('preserves enhanced recipe fields without accepting malformed rows', () => {
    expect(normalizeEnhancedFoodPhotoAnalysis({
      name: 'Сырники',
      ingredients: [{ name: 'Творог', amount: '200 г' }],
      steps: ['Смешать', { text: 'Обжарить', time_minutes: 8 }, { broken: true }],
      tips: ['Подать с ягодами'],
      allergens: ['молоко'],
      intolerances: ['лактоза'],
      servings: 2,
      timeMinutes: 20,
    })).toMatchObject({
      name: 'Сырники',
      ingredients: [{ name: 'Творог', percent: 0, amount: '200 г' }],
      steps: ['Смешать', { n: 2, text: 'Обжарить', step: 'Обжарить', time_minutes: 8 }],
      tips: ['Подать с ягодами'],
      allergens: ['молоко'],
      intolerances: ['лактоза'],
      servings: 2,
      timeMinutes: 20,
    });
  });
});

describe('coach and recipe response normalization', () => {
  it('uses public fallback text for malformed coach advice', () => {
    expect(normalizeCoachAdvice({ bullets: ['  Пейте воду  ', null] })).toEqual({
      title: 'Совет на сегодня',
      advice: 'Не удалось сформировать персональный совет. Попробуйте позже.',
      bullets: ['Пейте воду'],
    });
  });

  it('normalizes recipes and drops empty ingredients or steps', () => {
    expect(normalizeRecipe({
      title: 'Омлет',
      servings: '2',
      timeMinutes: 12.4,
      ingredients: [{ name: 'Яйца', amount: '2 шт.' }, { amount: '100 г' }],
      steps: [{ text: 'Взбить яйца', timeMin: 2 }, { text: '' }],
      tips: ['Не перегревать'],
    })).toEqual({
      title: 'Омлет',
      servings: 2,
      timeMinutes: 12,
      ingredients: [{ name: 'Яйца', amount: '2 шт.' }],
      steps: [{ n: 1, text: 'Взбить яйца', timeMin: 2 }],
      tips: ['Не перегревать'],
    });
  });
});
