import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FamilyShoppingPanel } from '../features/familyPlanning/FamilyShoppingPanel';
import { FamilyProfileEditor } from '../features/familyPlanning/FamilyProfileEditor';
import type { FamilyPlanningController } from '../features/familyPlanning/useFamilyPlanning';
import type { FamilyDayProjection } from '../domain/familyPlanning';
import { emptyDrafts, profileDraft } from '../features/familyPlanning/planningUiState';

const renderShopping = (projection: FamilyDayProjection) => renderToStaticMarkup(<FamilyShoppingPanel controller={{
  projection, drafts: emptyDrafts('2026-10-23'), owner: true, commitBlocked: false, candidate: null,
} as FamilyPlanningController} />);
const item = (name: string, quantity: number, purchasedQuantity: number) => ({
  ingredientId: name, name, unit: 'g' as const, quantity, purchasedQuantity, toBuy: Math.max(quantity - purchasedQuantity, 0),
});

describe('family shopping visible quantities', () => {
  it('omits inactive historical zero rows without mutating the source projection', () => {
    const projection = { items: [item('Историческая позиция', 0, 0), item('Текущая позиция', 120, 0)], manualItems: [] };
    const before = JSON.stringify(projection);
    const markup = renderShopping(projection);
    expect(markup).not.toContain('Историческая позиция');
    expect(markup).toContain('Текущая позиция');
    expect(markup).not.toContain('checked=""');
    expect(JSON.stringify(projection)).toBe(before);
  });
  it('keeps actual purchases when recalculated need is zero, including their units', () => {
    const markup = renderShopping({ items: [item('Уже куплено', 0, 75.5)], manualItems: [] });
    expect(markup).toContain('Уже куплено');
    expect(markup).toContain('checked=""');
    expect(markup).toContain('Куплено 75,5 г');
    expect(markup).toContain('в текущем меню не требуется');
  });
  it('preserves exact partial purchases and recomputed remainder', () => {
    const markup = renderShopping({ items: [item('Частично', 200.5, 75.25)], manualItems: [] });
    expect(markup).toContain('Нужно 200,5 г');
    expect(markup).toContain('Куплено 75,25 г');
    expect(markup).toContain('Осталось купить 125,25 г');
    expect(markup).not.toContain('checked=""');
    expect(markup).toContain('value="75.25"');
  });
  it('retains editable manual zero rows without falsely marking them bought', () => {
    const markup = renderShopping({ items: [], manualItems: [{ id: 'manual', name: 'Ручная позиция', unit: 'piece', quantity: 0, purchasedQuantity: 0, toBuy: 0 }] });
    expect(markup).toContain('Ручная позиция');
    expect(markup).toContain('Удалить ручную позицию');
    expect(markup).toContain('Куплено, шт');
    expect(markup).not.toContain('checked=""');
    expect(markup).not.toContain('fp-shopping-row fp-bought');
  });
});

describe('compact profile keeps required decisions explicit', () => {
  it('keeps age, portion, and unknown allergy above optional disclosure and excludes adult goal for children', () => {
    const profile = { ...profileDraft({ id: 'child', familyId: 'family', kind: 'managed', displayName: 'Ребёнок', active: true, version: 1, canEdit: true, configuration: null }, 1), ageGroup: 'child' as const };
    const markup = renderToStaticMarkup(<FamilyProfileEditor controller={{ drafts: { ...emptyDrafts(), profile, profileOpen: true }, fieldErrors: {} } as FamilyPlanningController} />);
    const optional = markup.indexOf('class="fp-profile-extra"');
    expect(markup.indexOf('Взрослый или ребёнок')).toBeLessThan(optional);
    expect(markup.indexOf('Ручная доля базовой порции')).toBeLessThan(optional);
    expect(markup.indexOf('Пока не знаю')).toBeLessThan(optional);
    expect(markup).not.toContain('id="fp-goal-context"');
    expect(markup).toContain('Закрыть, сохранив черновик');
    expect(markup).toContain('Отменить изменения');
    expect(markup).toContain('Профиль можно сохранить');
  });
});
