import { describe, expect, it } from 'vitest';
import {
  calculateDashboardWeightTrend,
  calculateDailyNutrition,
} from '../features/dashboard/dashboardMetrics';

describe('dashboard metrics use case', () => {
  it('includes only diary entries from the selected local day', () => {
    const diary = [
      { id: '1', name: 'Breakfast', calories: 400, protein: 20, fat: 10, carbs: 50, timestamp: '2026-10-08T08:00:00' },
      { id: '2', name: 'Dinner', calories: 600, protein: 30, fat: 20, carbs: 70, timestamp: '2026-10-08T19:00:00' },
      { id: '3', name: 'Yesterday', calories: 900, protein: 40, fat: 30, carbs: 100, timestamp: '2026-10-07T19:00:00' },
    ];
    expect(calculateDailyNutrition(diary, new Date(2026, 9, 8))).toEqual({ calories: 1000, protein: 50, fat: 30, carbs: 120 });
  });

  it('sorts weight history before deriving current, adjacent, and period changes', () => {
    const trend = calculateDashboardWeightTrend([
      { date: '2026-10-08', weight: 78 },
      { date: '2026-09-01', weight: 82 },
      { date: '2026-10-01', weight: 79 },
    ]);
    expect(trend).toEqual({ current: 78, diff: -1, diffPct: (-1 / 79) * 100, delta7: -1, delta30: -4 });
  });

  it('does not produce an infinite percentage for legacy zero-weight records', () => {
    expect(calculateDashboardWeightTrend([
      { date: '2026-10-01', weight: 0 },
      { date: '2026-10-08', weight: 70 },
    ])?.diffPct).toBe(0);
  });
});