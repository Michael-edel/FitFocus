import { describe, expect, it } from 'vitest';
import { calculateDiaryDayStats, getDiaryDayKeys, resolveDiaryDayKey } from '../features/diary/useDiaryDaySelection';
import type { FoodItem } from '../types';

const entry = (id: string, timestamp: string, calories: number): FoodItem => ({
  id,
  name: 'Тестовый приём пищи',
  timestamp,
  calories,
  protein: 10,
  fat: 5,
  carbs: 20,
});

describe('diary day selection', () => {
  const diary = [
    entry('1', '2026-10-05T08:00:00.000Z', 250),
    entry('2', '2026-10-05T12:00:00.000Z', 450),
    entry('3', '2026-10-04T08:00:00.000Z', 300),
  ];

  it('orders available days from newest to oldest', () => {
    expect(getDiaryDayKeys(diary)).toEqual(['2026-10-05', '2026-10-04']);
  });

  it('keeps an existing selected day and falls back to today or the newest entry', () => {
    expect(resolveDiaryDayKey(['2026-10-05', '2026-10-04'], '2026-10-04', new Date('2026-10-06T09:00:00.000Z'))).toBe('2026-10-04');
    expect(resolveDiaryDayKey(['2026-10-05', '2026-10-04'], '', new Date('2026-10-06T09:00:00.000Z'))).toBe('2026-10-05');
  });

  it('calculates nutrition totals only for the active day', () => {
    expect(calculateDiaryDayStats(diary, '2026-10-05')).toEqual({
      calories: 700,
      protein: 20,
      fat: 10,
      carbs: 40,
    });
  });
});
