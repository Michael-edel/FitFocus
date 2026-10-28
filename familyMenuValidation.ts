import { isRecord } from './safeJson';
import type { FamilyWeeklyMenu } from './types';
import { isFamilyPlanningMenu, type FamilyPlanningMutationKind } from './domain/familyPlanning';

export type FamilyMenuTarget = { familyId: string; weekStart: string };
export type FamilyMenuSnapshot = FamilyMenuTarget & { version: number; menu: FamilyWeeklyMenu | null };
export type FamilyMenuIntent = FamilyMenuTarget & { menu: FamilyWeeklyMenu; mutationKind?: FamilyPlanningMutationKind };
export const familyMenuStorageKey = (accountId: string, target: FamilyMenuTarget) =>
  `fitfocus_data_${accountId}_family_menu:${JSON.stringify([target.familyId, target.weekStart])}`;

export function isFamilyWeek(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const text = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;

/** Explicit empty generations are valid; a missing/corrupt structured list is never empty. */
export function isFamilyMenuPayload(value: unknown, week: string): value is FamilyWeeklyMenu {
  if (isRecord(value) && 'planningV1' in value) return isFamilyPlanningMenu(value, week);
  if (!isRecord(value) || value.weekStart !== week || !isRecord(value.prefs)
    || !Array.isArray(value.days) || ![0, 7].includes(value.days.length)
    || !Array.isArray(value.shoppingList) || !value.shoppingList.every(item => typeof item === 'string')
    || !Array.isArray(value.shoppingListItems) || value.shoppingListItems.length > 500) return false;
  const prefs = value.prefs, ids = prefs.includeIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(id => text(id, 256))
    || new Set(ids).size !== ids.length || !['all_meals', 'once_per_day'].includes(String(prefs.cookingMode))
    || !text(prefs.currency, 20) || prefs.budgetPerWeek !== undefined
      && (typeof prefs.budgetPerWeek !== 'number' || !Number.isFinite(prefs.budgetPerWeek) || prefs.budgetPerWeek < 0)) return false;
  if (!value.days.length && (value.shoppingListItems.length || value.shoppingList.length)) return false;
  for (const day of value.days) {
    if (!isRecord(day) || !text(day.day, 100)) return false;
    for (const key of ['breakfast', 'lunch', 'dinner', 'snack']) {
      const meal = day[key];
      if (!isRecord(meal) || !text(meal.base, 2000) || !isRecord(meal.portions)) return false;
      const portions = meal.portions;
      if (Object.keys(portions).length !== ids.length
        || !ids.every(id => typeof portions[id] === 'string' && text(portions[id], 4000))) return false;
    }
  }
  return value.shoppingListItems.every(item => isRecord(item) && text(item.name, 256)
    && typeof item.grams === 'number' && Number.isFinite(item.grams) && item.grams > 0 && item.grams <= 1_000_000_000);
}

export function isFamilyMenuIntent(value: unknown): value is FamilyMenuIntent {
  return isRecord(value) && text(value.familyId, 256) && isFamilyWeek(value.weekStart)
    && (value.mutationKind === undefined || value.mutationKind === 'planning' || value.mutationKind === 'purchases')
    && isFamilyMenuPayload(value.menu, value.weekStart);
}

/** Stored server snapshots have no command. A new structured write must retain its command through retry. */
export function isFamilyMenuWriteIntent(value: unknown): value is FamilyMenuIntent {
  return isFamilyMenuIntent(value) && (value.menu.planningV1
    ? value.mutationKind === 'planning' || value.mutationKind === 'purchases'
    : value.mutationKind !== 'purchases');
}

export function isFamilyMenuSnapshot(value: unknown): value is FamilyMenuSnapshot {
  return isRecord(value) && text(value.familyId, 256) && isFamilyWeek(value.weekStart)
    && typeof value.version === 'number' && Number.isSafeInteger(value.version) && value.version >= 0
    && (value.version === 0 ? value.menu === null : isFamilyMenuPayload(value.menu, value.weekStart));
}
