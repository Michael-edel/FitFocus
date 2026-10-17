import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserStateRepository } from '../../storage/userStateRepository';
import type { OutboxCommitGuard } from '../../storage/durableOutbox';
import type { FavoriteRecipe } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPresent = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

type Ingredient = { name: string; amount?: string };

function toIngredient(value: unknown): Ingredient | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    for (const separator of ['—', '–', '-', ':']) {
      const index = text.indexOf(separator);
      if (index > 0) {
        const name = text.slice(0, index).trim();
        const amount = text.slice(index + separator.length).trim();
        if (name && amount) return { name, amount };
      }
    }
    return { name: text };
  }
  if (!isRecord(value)) return null;
  const name = String(value.name || value.title || '').trim();
  if (!name) return null;
  const amount = value.amount ?? value.grams ?? value.value;
  return {
    name,
    amount: amount === undefined || amount === null || amount === '' ? undefined : String(amount),
  };
}

function pickIngredientSource(primary: unknown, fallback: unknown): unknown[] {
  const primaryItems = Array.isArray(primary) ? primary : [];
  const fallbackItems = Array.isArray(fallback) ? fallback : [];
  if (primaryItems.some((item) => Boolean(toIngredient(item)?.amount))) return primaryItems;
  if (fallbackItems.some((item) => Boolean(toIngredient(item)?.amount))) return fallbackItems;
  return primaryItems.length ? primaryItems : fallbackItems;
}

/** Migrates legacy recipe shapes before writing them through the typed repository. */
export function normalizeFavoriteRecipe(
  item: unknown,
  now: () => Date = () => new Date(),
): FavoriteRecipe | null {
  if (!isRecord(item)) return null;
  const rawRecipe = isRecord(item.recipe) ? item.recipe : null;
  const toIsoDate = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date.toISOString();
    }
    return now().toISOString();
  };

  const ingredients = pickIngredientSource(item.ingredients, rawRecipe?.ingredients)
    .map(toIngredient)
    .filter(isPresent);
  const stepsSource = Array.isArray(rawRecipe?.steps)
    ? rawRecipe.steps
    : Array.isArray(item.steps)
      ? item.steps
      : [];
  const steps = stepsSource
    .map((step: unknown, index: number) => {
      if (typeof step === 'string') {
        const text = step.trim();
        return text ? { n: index + 1, text } : null;
      }
      if (!isRecord(step)) return null;
      const text = String(step.text || step.step || '').trim();
      if (!text) return null;
      const number = Number(step.n || index + 1);
      const timeMin = step.timeMin ?? step.time_minutes;
      return {
        n: Number.isFinite(number) && number > 0 ? number : index + 1,
        text,
        ...(timeMin === undefined || timeMin === null || timeMin === ''
          ? {}
          : { timeMin: Number(timeMin) || undefined }),
      };
    })
    .filter(isPresent);
  const recipe = {
    title: String(rawRecipe?.title || item.title || 'Рецепт'),
    servings: Number(rawRecipe?.servings ?? item.servings ?? 0) || undefined,
    timeMinutes: Number(rawRecipe?.timeMinutes ?? item.timeMinutes ?? 0) || undefined,
    ingredients,
    steps,
    tips: Array.isArray(rawRecipe?.tips) ? rawRecipe.tips.map(String).filter(Boolean) : [],
  };

  return {
    id: String(item.id || globalThis.crypto?.randomUUID?.() || now().getTime().toString()),
    title: String(item.title || recipe.title),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : toIsoDate(item.createdAt),
    photo: typeof item.photo === 'string' ? item.photo : undefined,
    allergens: Array.isArray(item.allergens) ? item.allergens.map(String).filter(Boolean) : undefined,
    intolerances: Array.isArray(item.intolerances) ? item.intolerances.map(String).filter(Boolean) : undefined,
    sourceFoodName: typeof item.sourceFoodName === 'string' ? item.sourceFoodName : undefined,
    recipe,
  };
}

export function prependFavoriteRecipe(recipes: FavoriteRecipe[], recipe: FavoriteRecipe): FavoriteRecipe[] {
  return [recipe, ...recipes].slice(0, 100);
}

type FavoriteRecipeRepository = Pick<UserStateRepository, 'readJsonAsync' | 'updateJson' | 'isReadSessionCurrent'>;
type FavoriteRecipeUpdate = (recipes: FavoriteRecipe[]) => FavoriteRecipe[];

const isFavoriteRecipeList = (value: unknown): value is FavoriteRecipe[] => Array.isArray(value);

async function commitFavoriteRecipeUpdate(
  repository: FavoriteRecipeRepository,
  update: FavoriteRecipeUpdate,
  guard: OutboxCommitGuard,
): Promise<FavoriteRecipe[] | null> {
  const result = await repository.updateJson('favorite_recipes', [], isFavoriteRecipeList, (stored) => {
    const recipes = stored.map((item) => normalizeFavoriteRecipe(item)).filter(isPresent);
    return update(recipes);
  }, guard);
  if (result.operation?.status !== 'pending' || !guard.canCommit()
    || !await repository.isReadSessionCurrent(guard.readGuard)) return null;
  return result.value.map((item) => normalizeFavoriteRecipe(item)).filter(isPresent);
}

export function useFavoriteRecipes({
  userId,
  repository,
  loginGuard,
  isCurrentSession,
}: {
  userId: string | null | undefined;
  repository: FavoriteRecipeRepository | null;
  loginGuard: OutboxCommitGuard['readGuard'] | null;
  isCurrentSession: () => boolean;
}) {
  const [favoriteRecipes, setFavoriteRecipes] = useState<FavoriteRecipe[]>([]);
  const scopeRef = useRef({ userId, repository, generation: 0 });
  if (scopeRef.current.userId !== userId || scopeRef.current.repository !== repository) {
    scopeRef.current = { userId, repository, generation: scopeRef.current.generation + 1 };
  }

  useEffect(() => {
    if (!userId) {
      setFavoriteRecipes([]);
      return;
    }
    if (!repository) return;
    let active = true;
    void repository.readJsonAsync<unknown[]>('favorite_recipes', [], Array.isArray).then((stored) => {
      if (!active) return;
      const normalized = stored.map((item) => normalizeFavoriteRecipe(item)).filter(isPresent);
      setFavoriteRecipes(normalized);
    }).catch(() => { /* Keep the storage failure visible; never persist an empty fallback. */ });
    return () => { active = false; };
  }, [repository, userId]);

  const updateFavorites = useCallback(async (update: FavoriteRecipeUpdate): Promise<boolean> => {
    const generation = scopeRef.current.generation;
    const accountId = userId;
    const activeRepository = repository;
    const guard = loginGuard ? { readGuard: loginGuard, canCommit: isCurrentSession } : null;
    if (!accountId || !activeRepository || !guard || guard.readGuard.accountId !== accountId
      || !isCurrentSession() || !guard.canCommit()) return false;
    try {
      const next = await commitFavoriteRecipeUpdate(activeRepository, update, guard);
      if (!next || scopeRef.current.generation !== generation
        || scopeRef.current.userId !== accountId || scopeRef.current.repository !== activeRepository
        || !isCurrentSession() || !guard.canCommit()) return false;
      setFavoriteRecipes(next);
      return true;
    } catch {
      return false;
    }
  }, [isCurrentSession, loginGuard, repository, userId]);

  const addFavoriteRecipe = useCallback((recipe: FavoriteRecipe) =>
    updateFavorites((recipes) => prependFavoriteRecipe(recipes, normalizeFavoriteRecipe(recipe) ?? recipe)),
  [updateFavorites]);

  const updateFavoriteRecipe = useCallback((recipe: FavoriteRecipe) =>
    updateFavorites((recipes) => recipes.map((current) => current.id === recipe.id
      ? normalizeFavoriteRecipe(recipe) ?? recipe
      : current)),
  [updateFavorites]);

  const removeFavoriteRecipe = useCallback((id: string) =>
    updateFavorites((recipes) => recipes.filter((recipe) => recipe.id !== id)),
  [updateFavorites]);

  const clearFavoriteRecipes = useCallback(() => updateFavorites(() => []), [updateFavorites]);

  return {
    favoriteRecipes,
    addFavoriteRecipe,
    updateFavoriteRecipe,
    removeFavoriteRecipe,
    clearFavoriteRecipes,
  };
}
