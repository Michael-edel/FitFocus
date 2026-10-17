import { describe, expect, it, vi } from 'vitest';
import type { AiSession } from '../services/aiSession';
import type { OutboxReadGuard } from '../storage/durableOutbox';
import type { FoodInsight, Recipe } from '../types';
import { runPhotoRecipeGeneration } from '../features/ai/usePhotoRecipeGeneration';

const guard: OutboxReadGuard = {
  accountId: 'recipe-owner',
  serverSessionId: 'a'.repeat(64),
  sessionEpoch: 'epoch-a',
  authFence: 4,
};
const recipe: Recipe = {
  title: 'Суп по фото',
  ingredients: [{ name: 'Овощи', amount: '200 г' }],
  steps: [{ n: 1, text: 'Сварить овощи' }],
};
const insight: FoodInsight = {
  calories: 200,
  macros: { protein: 5, fat: 4, carbs: 30 },
  ingredients: [{ name: 'Овощи', percent: 100 }],
  notes: [],
};

function createSession(): AiSession {
  return {
    guard,
    controller: new AbortController(),
    isCurrentSession: () => true,
    outbox: {} as AiSession['outbox'],
  };
}

function params(overrides: Partial<Parameters<typeof runPhotoRecipeGeneration>[0]> = {}) {
  const session = createSession();
  const commitInsight = vi.fn(async () => true);
  const requestRecipe = vi.fn(async () => recipe);
  const prepareSession = vi.fn(async () => session);
  const assertSession = vi.fn(async () => undefined);
  const incrementUsage = vi.fn(() => ({ weekStart: '2026-10-12', recipes: 1 }));
  return {
    session,
    commitInsight,
    requestRecipe,
    prepareSession,
    assertSession,
    incrementUsage,
    input: {
      userId: guard.accountId,
      loginGuard: guard,
      isCurrentSession: () => true,
      controller: new AbortController(),
      photo: 'data:image/jpeg;base64,AAAA',
      insight,
      commitInsight,
      requestRecipe,
      prepareSession,
      assertSession,
      incrementUsage,
      ...overrides,
    },
  };
}

describe('photo recipe generation', () => {
  it('uses the captured AI session and counts usage only after a guarded diary commit', async () => {
    const setup = params();

    await expect(runPhotoRecipeGeneration(setup.input)).resolves.toBe(true);

    expect(setup.prepareSession).toHaveBeenCalledWith(
      guard.accountId,
      setup.input.controller,
      expect.any(Function),
      { previous: guard },
    );
    expect(setup.requestRecipe).toHaveBeenCalledWith(setup.input.photo, setup.session);
    expect(setup.commitInsight).toHaveBeenCalledWith(
      { ...insight, recipe },
      { readGuard: guard, canCommit: expect.any(Function) },
      expect.any(Function),
    );
    expect(setup.incrementUsage).toHaveBeenCalledOnce();
  });

  it('drops a recipe response after its source session becomes stale', async () => {
    let current = true;
    let resolveRecipe!: (value: Recipe) => void;
    let markRequestStarted!: () => void;
    const requestStarted = new Promise<void>(resolve => { markRequestStarted = resolve; });
    const delayedRecipe = new Promise<Recipe>(resolve => { resolveRecipe = resolve; });
    const setup = params({
      isCurrentSession: () => current,
      requestRecipe: vi.fn(() => {
        markRequestStarted();
        return delayedRecipe;
      }),
    });
    const run = runPhotoRecipeGeneration(setup.input);
    await requestStarted;
    current = false;
    resolveRecipe(recipe);

    await expect(run).resolves.toBe(false);
    expect(setup.commitInsight).not.toHaveBeenCalled();
    expect(setup.incrementUsage).not.toHaveBeenCalled();
  });

  it('does not count usage when the diary commit is rejected', async () => {
    const setup = params({ commitInsight: vi.fn(async () => false) });

    await expect(runPhotoRecipeGeneration(setup.input)).resolves.toBe(false);

    expect(setup.incrementUsage).not.toHaveBeenCalled();
  });
});
