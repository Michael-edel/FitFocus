import { describe, expect, it } from 'vitest';
import {
  buildFoodInsight,
  getRemainingFoodPhotoScans,
  processFoodPhotoFiles,
} from '../features/ai/useFoodPhotoAnalysis';
import type { FoodPhotoAnalysisResult } from '../geminiService';
import type { FoodItem } from '../types';

const analysis: FoodPhotoAnalysisResult = {
  name: 'Омлет',
  nonFood: false,
  calories: 320,
  protein: 23,
  fat: 21,
  carbs: 4,
  ingredients: [{ name: 'Яйца', percent: 70 }],
  notes: ['Оценка по фото'],
};

describe('food photo feature', () => {
  it('keeps non-food scans out of nutrition totals', () => {
    expect(buildFoodInsight({
      ...analysis,
      nonFood: true,
      calories: 320,
      ingredients: [{ name: 'Телефон', percent: 100 }],
    })).toEqual({
      calories: 0,
      macros: { protein: 0, fat: 0, carbs: 0 },
      ingredients: [],
      notes: ['Оценка по фото'],
    });
  });

  it('processes only the remaining photo allowance from a batch', async () => {
    const calls: string[] = [];
    const files = [{ name: 'one.jpg' }, { name: 'two.jpg' }] as File[];
    const processed = await processFoodPhotoFiles({
      userId: 'user-1',
      files,
      remainingScans: 1,
      openPaywall: () => calls.push('paywall'),
      setScanning: (value) => calls.push(`scanning:${value}`),
      compressPhoto: async (file) => {
        calls.push(`compress:${file.name}`);
        return { dataUrl: 'data:image/jpeg;base64,full', thumbUrl: 'data:image/jpeg;base64,thumb', base64: 'encoded' };
      },
      analyzePhoto: async () => {
        calls.push('analyze');
        return analysis;
      },
      addFoodToDiary: () => {
        calls.push('diary');
        return { id: 'entry-1', ...analysis, timestamp: '2026-10-07T10:00:00.000Z' } as FoodItem;
      },
      incrementUsage: () => calls.push('usage'),
      showInsight: (insight) => calls.push(`insight:${insight.id}:${insight.insight.calories}`),
    });

    expect(processed).toBe(1);
    expect(calls).toEqual([
      'scanning:true',
      'compress:one.jpg',
      'analyze',
      'diary',
      'insight:entry-1:320',
      'usage',
      'scanning:false',
    ]);
  });

  it('opens the paywall before reading a file when no photo scans remain', async () => {
    const calls: string[] = [];
    await expect(processFoodPhotoFiles({
      userId: 'user-1',
      files: [{ name: 'one.jpg' }] as File[],
      remainingScans: 0,
      openPaywall: () => calls.push('paywall'),
      setScanning: () => calls.push('scanning'),
      compressPhoto: async () => {
        calls.push('compress');
        return { dataUrl: '', thumbUrl: '', base64: '' };
      },
      analyzePhoto: async () => analysis,
      addFoodToDiary: () => undefined,
      incrementUsage: () => calls.push('usage'),
      showInsight: () => calls.push('insight'),
    })).resolves.toBe(0);

    expect(calls).toEqual(['paywall']);
  });

  it('fails closed for unknown or malformed quota values', async () => {
    expect(getRemainingFoodPhotoScans(undefined, 0)).toBe(0);
    expect(getRemainingFoodPhotoScans(Number.NaN, 0)).toBe(0);
    expect(getRemainingFoodPhotoScans(3, Infinity)).toBe(0);
    expect(getRemainingFoodPhotoScans(Infinity, 99)).toBe(Infinity);

    const calls: string[] = [];
    await expect(processFoodPhotoFiles({
      userId: 'user-1',
      files: [{ name: 'one.jpg' }] as File[],
      remainingScans: Number.NaN,
      openPaywall: () => calls.push('paywall'),
      setScanning: () => calls.push('scanning'),
      compressPhoto: async () => {
        calls.push('compress');
        return { dataUrl: '', thumbUrl: '', base64: '' };
      },
      analyzePhoto: async () => analysis,
      addFoodToDiary: () => undefined,
      incrementUsage: () => calls.push('usage'),
      showInsight: () => calls.push('insight'),
    })).resolves.toBe(0);

    expect(calls).toEqual(['paywall']);
  });

  it('continues a batch after one file fails', async () => {
    const calls: string[] = [];
    const processed = await processFoodPhotoFiles({
      userId: 'user-1',
      files: [{ name: 'broken.jpg' }, { name: 'valid.jpg' }] as File[],
      remainingScans: 2,
      openPaywall: () => calls.push('paywall'),
      setScanning: (value) => calls.push(`scanning:${value}`),
      compressPhoto: async (file) => {
        calls.push(`compress:${file.name}`);
        if (file.name === 'broken.jpg') throw new Error('invalid image');
        return { dataUrl: 'data:image/jpeg;base64,full', thumbUrl: 'data:image/jpeg;base64,thumb', base64: 'encoded' };
      },
      analyzePhoto: async () => {
        calls.push('analyze');
        return analysis;
      },
      addFoodToDiary: () => {
        calls.push('diary');
        return { id: 'entry-2', ...analysis, timestamp: '2026-10-07T10:00:00.000Z' } as FoodItem;
      },
      incrementUsage: () => calls.push('usage'),
      showInsight: () => calls.push('insight'),
      logError: (error) => calls.push(`error:${(error as Error).message}`),
    });

    expect(processed).toBe(1);
    expect(calls).toEqual([
      'scanning:true',
      'compress:broken.jpg',
      'error:invalid image',
      'compress:valid.jpg',
      'analyze',
      'diary',
      'insight',
      'usage',
      'scanning:false',
    ]);
  });
});
