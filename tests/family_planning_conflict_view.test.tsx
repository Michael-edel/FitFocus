import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FamilyConflictView } from '../features/familyPlanning/FamilyConflictView';
import { FamilyRosterPanel } from '../features/familyPlanning/FamilyRosterPanel';
import { buildFamilyDayMenu, deriveLegacyFamilyMenu, type DiningCard } from '../domain/familyPlanning';
import type { FamilyPlanningController } from '../features/familyPlanning/useFamilyPlanning';
import type { FamilyWeeklyMenu } from '../types';

const menu = () => buildFamilyDayMenu({ date: '2026-10-23', rosterVersion: 1,
  profiles: [{ id: 'self', version: 1, configuration: { displayName: 'Ирина', ageGroup: 'adult', portionShare: 1,
    allergies: { state: 'none', allergenIds: [] }, hardExcludedIngredientIds: [], dislikedIngredientIds: [], goalContext: 'LOSS' } }],
  selections: [{ slot: 'lunch', recipeId: 'chicken-rice-v1', participantShares: { self: 1 } }],
});
const render = (local?: FamilyWeeklyMenu, remote?: FamilyWeeklyMenu) => renderToStaticMarkup(<FamilyConflictView local={local} remote={remote} />);

describe('family conflict comparison', () => {
  it('shows the actual lunch-only rice purchase difference and all three raw quantities', () => {
    const local = menu(), planning = structuredClone(local.planningV1);
    planning.purchasedQuantities.find(item => item.ingredientId === 'rice')!.quantity = 250;
    const markup = render(local, deriveLegacyFamilyMenu(planning));
    expect(markup).toContain('2026-10-23'); expect(markup).toContain('Рис');
    expect(markup).toContain('куплено 0 г'); expect(markup).toContain('куплено 250 г');
    expect(markup).toContain('нужно '); expect(markup).toContain('докупить 0 г');
    expect(markup).not.toContain('Не запланировано'); expect(markup).not.toContain('LOSS');
  });
  it('compares manual rows with their units and does not mutate either version', () => {
    const local = menu(), planning = structuredClone(local.planningV1);
    planning.manualItems.push({ id: 'manual:one', name: 'Салфетки', unit: 'piece', quantity: 3, purchasedQuantity: 1 });
    const remote = deriveLegacyFamilyMenu(planning), before = JSON.stringify([local, remote]);
    const markup = render(local, remote);
    expect(markup).toContain('Салфетки'); expect(markup).toContain('нужно 3 шт.');
    expect(markup).toContain('куплено 1 шт.'); expect(markup).toContain('докупить 2 шт.');
    expect(markup).toContain('позиция отсутствует'); expect(JSON.stringify([local, remote])).toBe(before);
  });
  it('shows changed explicit portions and skips unchanged dishes', () => {
    const local = menu(), planning = structuredClone(local.planningV1);
    planning.meals[0].participantShares.self = 1.25;
    const markup = render(local, deriveLegacyFamilyMenu(planning));
    expect(markup).toContain('Обед'); expect(markup).toContain('доля 1.25'); expect(markup).toContain('доля 1');
    expect(markup).not.toContain('LOSS');
  });
  it('does not claim missing or unknown versions have zero purchases or no participants', () => {
    const markup = render(menu());
    expect(markup).toContain('Версия пока недоступна'); expect(markup).toContain('нет данных для сравнения');
    expect(markup).not.toContain('не участвует');
    expect(render(menu(), { ...menu(), planningV1: { schemaVersion: 999 } } as unknown as FamilyWeeklyMenu)).toContain('Формат этой версии не поддерживается');
  });
  it('renders legacy lunch context with an explicit quantity limitation', () => {
    const local = { ...menu(), planningV1: undefined }, remote = structuredClone(local);
    remote.days[0].lunch.base = 'Другое блюдо';
    const markup = render(local, remote);
    expect(markup).toContain('Другое блюдо'); expect(markup).toContain('Обед'); expect(markup).toContain('точные количества и участие недоступны');
  });
  it('labels read-only managed profiles with the organizer and never renders private configuration', () => {
    const profiles = [{ id: 'managed', kind: 'managed', displayName: 'Ребёнок', active: true, canEdit: false,
      configuration: { goalContext: 'SECRET_GOAL', allergies: ['SECRET_ALLERGY'] } }] as unknown as DiningCard[];
    const c = { family: { name: 'Семья' }, roster: { profiles, planningConstraints: { incomplete: false } }, owner: false } as FamilyPlanningController;
    const markup = renderToStaticMarkup(<FamilyRosterPanel controller={c} />);
    expect(markup).toContain('Настраивает организатор'); expect(markup).not.toContain('Настраивает сам участник');
    expect(markup).not.toContain('SECRET'); expect(markup).not.toContain('Настроить профиль');
  });
});
