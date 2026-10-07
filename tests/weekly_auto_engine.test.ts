import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureWeeklyReportWithAI, loadWeeklyReports } from '../weeklyAutoEngine';
import type { WeeklyIntelligenceResult } from '../weeklyIntelligence';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

const weeklyData: WeeklyIntelligenceResult = {
  wis: 82,
  weightDelta7: -0.4,
  weightDelta30: -1.8,
  compliance: 90,
  adaptationIndex: 12,
  status: 'excellent',
};

describe('weekly AI reports', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', undefined);
    vi.setSystemTime(new Date('2026-10-06T09:00:00.000Z'));
    vi.stubGlobal('localStorage', createLocalStorage());
    vi.stubGlobal('window', {
      setTimeout: (handler: () => void, delay?: number) => setTimeout(handler, delay) as unknown as number,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('migrates reports saved under the existing user-scoped key', async () => {
    localStorage.setItem('fitfocus_data_user-1_weekly_reports', JSON.stringify([{
      weekKey: '2026-41',
      createdAt: '2026-10-06T09:00:00.000Z',
      data: weeklyData,
      aiText: 'Продолжайте текущий план.',
    }]));

    expect(await loadWeeklyReports('user-1')).toEqual([{
      weekKey: '2026-41',
      createdAt: '2026-10-06T09:00:00.000Z',
      data: weeklyData,
      aiText: 'Продолжайте текущий план.',
    }]);
  });

  it('saves a generated report through the cloud-mirrored repository', async () => {
    const result = await ensureWeeklyReportWithAI('user-1', weeklyData, vi.fn().mockResolvedValue('Хорошая динамика.'));

    expect(result.isNew).toBe(true);
    expect(await loadWeeklyReports('user-1')).toMatchObject([{ aiText: 'Хорошая динамика.' }]);

    await vi.advanceTimersByTimeAsync(400);
    expect(fetch).toHaveBeenCalledWith('/api/state', expect.objectContaining({ method: 'PUT' }));
  });
});
