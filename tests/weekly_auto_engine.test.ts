import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { userStateDatabase } from '../storage/stateDatabase';
import { DurableOutbox } from '../storage/durableOutbox';
import { UserStateRepository } from '../storage/userStateRepository';
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
    userStateDatabase.close();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('localStorage', createLocalStorage());
    vi.stubGlobal('window', {
      setTimeout: (handler: () => void, delay?: number) => setTimeout(handler, delay) as unknown as number,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
  });

  afterEach(() => {
    userStateDatabase.close();
    vi.unstubAllGlobals();
  });

  it('reads legacy reports without rewriting the source before an atomic edit', async () => {
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

  it('awaits the atomic report and outgoing intent before reporting success', async () => {
    const result = await ensureWeeklyReportWithAI('user-1', weeklyData, vi.fn().mockResolvedValue('Хорошая динамика.'));

    expect(result.isNew).toBe(true);
    expect(await loadWeeklyReports('user-1')).toMatchObject([{ aiText: 'Хорошая динамика.' }]);

    expect((await new DurableOutbox().list('user-1'))[0]).toMatchObject({ type: 'put', key: 'fitfocus_data_user-1_weekly_reports', status: 'pending' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serializes concurrent report generation and commits only one current-week report', async () => {
    let resolveAI!: (text: string) => void;
    const aiText = new Promise<string>((resolve) => { resolveAI = resolve; });
    const firstGenerate = vi.fn(() => aiText);
    const secondGenerate = vi.fn().mockResolvedValue('Дублирующий отчёт');

    const first = ensureWeeklyReportWithAI('user-1', weeklyData, firstGenerate);
    await vi.waitFor(() => expect(localStorage.getItem('ff_weekly_ai_inflight_user-1')).not.toBeNull());
    const second = ensureWeeklyReportWithAI('user-1', weeklyData, secondGenerate);
    resolveAI('Хорошая динамика.');

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toMatchObject({ isNew: true, report: { aiText: 'Хорошая динамика.' } });
    expect(secondResult).toEqual({ isNew: false, report: firstResult.report });
    expect(firstGenerate).toHaveBeenCalledTimes(1);
    expect(secondGenerate).not.toHaveBeenCalled();
    expect(await loadWeeklyReports('user-1')).toEqual([firstResult.report]);
    expect((await new DurableOutbox().list('user-1'))).toHaveLength(1);
  });

  it('continues its own pending report write after a new repository instance is created', async () => {
    await ensureWeeklyReportWithAI('user-1', weeklyData, vi.fn().mockResolvedValue('Хорошая динамика.'));
    const outbox = new DurableOutbox();
    const original = (await outbox.list('user-1'))[0];
    const updatedData = { ...weeklyData, wis: 91 };

    const result = await ensureWeeklyReportWithAI('user-1', updatedData, vi.fn());
    const operations = await outbox.list('user-1');
    const update = operations.find((operation) => operation.type === 'put' && operation.value.includes('"wis":91'));

    expect(result.report.data.wis).toBe(91);
    expect(result.isNew).toBe(false);
    expect(operations).toHaveLength(2);
    expect(update).toMatchObject({
      status: 'pending',
      writerId: original?.writerId,
      parentOpId: original?.opId,
    });
  });

  it('does not commit a report or apply cooldown after its captured login expires', async () => {
    const outbox = new DurableOutbox();
    const readGuard = (await outbox.acceptReadSession('user-1', 'a'.repeat(64), 0))!;
    let current = true;
    let resolveAI!: (text: string) => void;
    const aiText = new Promise<string>((resolve) => { resolveAI = resolve; });
    const pending = ensureWeeklyReportWithAI('user-1', weeklyData, () => aiText, {
      readGuard,
      canCommit: () => current,
    });

    await vi.waitFor(() => expect(localStorage.getItem('ff_weekly_ai_inflight_user-1')).not.toBeNull());
    current = false;
    resolveAI('Устаревшая интерпретация');
    await expect(pending).rejects.toThrow('WEEKLY_REPORT_SESSION_CHANGED');

    expect(await outbox.list('user-1')).toEqual([]);
    expect(await outbox.snapshot('user-1', 'fitfocus_data_user-1_weekly_reports')).toMatchObject({ value: null });
    expect(localStorage.getItem('ff_weekly_ai_inflight_user-1')).toBeNull();
    expect(localStorage.getItem('ff_last_weekly_ai_attempt_user-1')).toBeNull();
  });

  it('does not return an existing report after its captured login expires during the read', async () => {
    const repository = new UserStateRepository('user-1');
    const now = new Date();
    const weekDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const weekday = weekDate.getUTCDay() || 7;
    weekDate.setUTCDate(weekDate.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
    const currentWeek = `${weekDate.getUTCFullYear()}-${String(Math.ceil((((weekDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)).padStart(2, '0')}`;
    await repository.writeJson('weekly_reports', [{
      weekKey: currentWeek,
      createdAt: now.toISOString(),
      data: weeklyData,
      aiText: 'Отчёт текущей недели.',
    }]);

    const outbox = new DurableOutbox();
    const readGuard = (await outbox.acceptReadSession('user-1', 'c'.repeat(64), 0))!;
    let guardChecks = 0;
    const generateAI = vi.fn().mockResolvedValue('Не должно быть вызвано');

    await expect(ensureWeeklyReportWithAI('user-1', weeklyData, generateAI, {
      readGuard,
      canCommit: () => ++guardChecks < 3,
    })).rejects.toThrow('WEEKLY_REPORT_SESSION_CHANGED');

    expect(generateAI).not.toHaveBeenCalled();
  });
});
