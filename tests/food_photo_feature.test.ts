import { describe, expect, it, vi } from 'vitest';
import {
  buildFoodInsight,
  getRemainingFoodPhotoScans,
  processFoodPhotoFiles,
  type FoodPhotoAnalysisRunParams,
} from '../features/ai/useFoodPhotoAnalysis';
import type { FoodPhotoAnalysisResult } from '../geminiService';
import { SessionReadError } from '../storage/sessionRead';
import { DurableOutbox, type OutboxOperation } from '../storage/durableOutbox';
import type { AiSession } from '../services/aiSession';
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
const entry = { id: 'entry-1', ...analysis, timestamp: '2026-10-07T10:00:00.000Z' } as FoodItem;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  let current = true;
  let externalSessionChanged = false;
  const session: AiSession = {
    guard: { accountId: 'user-1', sessionEpoch: 'epoch', serverSessionId: 'a'.repeat(64), authFence: 1 },
    controller: new AbortController(),
    isCurrentSession: () => current,
    outbox: new DurableOutbox(),
  };
  const calls: string[] = [];
  const input: FoodPhotoAnalysisRunParams = {
    userId: 'user-1',
    loginGuard: session.guard,
    isCurrentSession: () => current,
    controller: session.controller,
    files: [{ name: 'one.jpg' }] as File[],
    remainingScans: 1,
    openPaywall: vi.fn(() => calls.push('paywall')),
    setScanning: vi.fn(value => calls.push(`scanning:${value}`)),
    compressPhoto: vi.fn(async file => {
      calls.push(`compress:${file.name}`);
      if (file.name === 'broken.jpg') throw new Error('invalid image');
      return { dataUrl: 'data:image/jpeg;base64,full', thumbUrl: 'data:image/jpeg;base64,thumb', base64: 'encoded' };
    }),
    prepareSession: vi.fn(async () => { calls.push('prepare'); return session; }),
    assertSession: vi.fn(async () => {
      calls.push('assert');
      if (externalSessionChanged) throw new SessionReadError('session');
    }),
    analyzePhoto: vi.fn(async (_base64, captured) => {
      calls.push('analyze');
      expect(captured).toBe(session);
      return analysis;
    }),
    addFoodToDiary: vi.fn(async (_item, guard, isCurrent) => {
      calls.push('diary');
      expect(guard.readGuard).toBe(session.guard);
      expect(guard.canCommit()).toBe(isCurrent());
      return entry;
    }),
    incrementUsage: vi.fn(async () => {
      calls.push('usage');
      return { status: 'pending' } as OutboxOperation;
    }),
    showInsight: vi.fn(insight => calls.push(`insight:${insight.id}:${insight.insight.calories}`)),
    logError: vi.fn(error => calls.push(`error:${(error as Error).message}`)),
  };
  return {
    input,
    calls,
    session,
    close: () => { current = false; session.controller.abort(); },
    changeExternalSession: () => { externalSessionChanged = true; },
  };
}

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

  it('scopes each AI attempt and commits diary, usage and insight only for its current session', async () => {
    const { input, calls } = setup();

    await expect(processFoodPhotoFiles(input)).resolves.toBe(1);
    expect(calls).toEqual([
      'scanning:true',
      'prepare',
      'compress:one.jpg',
      'assert',
      'analyze',
      'assert',
      'diary',
      'assert',
      'usage',
      'assert',
      'insight:entry-1:320',
      'scanning:false',
    ]);
    expect(input.prepareSession).toHaveBeenCalledWith(
      'user-1', input.controller, expect.any(Function), { previous: input.loginGuard },
    );
    expect(input.incrementUsage).toHaveBeenCalledOnce();
  });

  it('does not prepare a session or start work for an already stale attempt', async () => {
    const { input, close, calls } = setup();
    close();

    await expect(processFoodPhotoFiles(input)).resolves.toBe(0);
    expect(calls).toEqual([]);
    expect(input.prepareSession).not.toHaveBeenCalled();
    expect(input.addFoodToDiary).not.toHaveBeenCalled();
    expect(input.incrementUsage).not.toHaveBeenCalled();
    expect(input.showInsight).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])('ignores delayed AI %s after the original login closes', async outcome => {
    const { input, close } = setup();
    const request = deferred<FoodPhotoAnalysisResult | null>();
    vi.mocked(input.analyzePhoto).mockReturnValue(request.promise);

    const pending = processFoodPhotoFiles(input);
    await vi.waitFor(() => expect(input.analyzePhoto).toHaveBeenCalledOnce());
    close();
    if (outcome === 'success') request.resolve(analysis);
    else request.reject(new Error('late AI failure'));

    await expect(pending).resolves.toBe(0);
    expect(input.addFoodToDiary).not.toHaveBeenCalled();
    expect(input.incrementUsage).not.toHaveBeenCalled();
    expect(input.showInsight).not.toHaveBeenCalled();
    expect(input.logError).not.toHaveBeenCalled();
    expect(input.setScanning).toHaveBeenCalledTimes(1);
  });

  it('rejects a response when another tab has replaced the active IDB session', async () => {
    const { input, changeExternalSession } = setup();
    const request = deferred<FoodPhotoAnalysisResult | null>();
    vi.mocked(input.analyzePhoto).mockReturnValue(request.promise);

    const pending = processFoodPhotoFiles(input);
    await vi.waitFor(() => expect(input.analyzePhoto).toHaveBeenCalledOnce());
    changeExternalSession();
    request.resolve(analysis);

    await expect(pending).resolves.toBe(0);
    expect(input.addFoodToDiary).not.toHaveBeenCalled();
    expect(input.incrementUsage).not.toHaveBeenCalled();
    expect(input.showInsight).not.toHaveBeenCalled();
    expect(input.logError).not.toHaveBeenCalled();
  });

  it('opens the paywall before reading a file when no scans remain', async () => {
    const { input, calls } = setup();
    input.remainingScans = 0;

    await expect(processFoodPhotoFiles(input)).resolves.toBe(0);
    expect(calls).toEqual(['paywall']);
    expect(input.compressPhoto).not.toHaveBeenCalled();
    expect(input.prepareSession).not.toHaveBeenCalled();
  });

  it('fails closed for unknown or malformed quota values', () => {
    expect(getRemainingFoodPhotoScans(undefined, 0)).toBe(0);
    expect(getRemainingFoodPhotoScans(Number.NaN, 0)).toBe(0);
    expect(getRemainingFoodPhotoScans(3, Infinity)).toBe(0);
    expect(getRemainingFoodPhotoScans(Infinity, 99)).toBe(Infinity);
  });

  it('continues a batch after one file fails while the login remains current', async () => {
    const { input, calls } = setup();
    input.files = [{ name: 'broken.jpg' }, { name: 'valid.jpg' }] as File[];
    input.remainingScans = 2;

    await expect(processFoodPhotoFiles(input)).resolves.toBe(1);
    expect(calls).toContain('error:invalid image');
    expect(input.analyzePhoto).toHaveBeenCalledOnce();
    expect(input.addFoodToDiary).toHaveBeenCalledOnce();
    expect(input.incrementUsage).toHaveBeenCalledOnce();
    expect(input.setScanning).toHaveBeenLastCalledWith(false);
  });
});
