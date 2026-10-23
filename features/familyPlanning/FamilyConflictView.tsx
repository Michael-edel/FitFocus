import React from 'react';
import type { FamilyWeeklyMenu } from '../../types';
import { projectFamilyDay, type DiningCard } from '../../domain/familyPlanning';
import { FAMILY_INGREDIENTS } from '../../domain/familyPlanningCatalog';
import { MEAL_LABELS } from './planningUiState';

type Row = { label: string; value: string };
type Summary = { rows: Map<string, Row>; notice?: string; meals?: string };
const units = { g: 'г', ml: 'мл', piece: 'шт.' };
const amount = (value: number, unit: keyof typeof units) => `${Number(value.toFixed(6))} ${units[unit]}`;
const quantities = (need: number, bought: number, remaining: number, unit: keyof typeof units) =>
  `нужно ${amount(need, unit)} · куплено ${amount(bought, unit)} · докупить ${amount(remaining, unit)}`;

// Deliberately project only shared meal/purchase data. Never serialize profiles or arbitrary payload fields.
function summarize(menu: FamilyWeeklyMenu | null | undefined, members: readonly DiningCard[]): Summary {
  const rows = new Map<string, Row>();
  if (!menu) return { rows, notice: 'Версия пока недоступна.' };
  const person = (id: string) => members.find(member => member.id === id)?.displayName ?? 'Участник вне текущего состава';
  if (menu.planningV1) {
    const p = menu.planningV1;
    try {
      const projection = projectFamilyDay(p, FAMILY_INGREDIENTS);
      rows.set('date', { label: 'День', value: p.date });
      for (const meal of p.meals) {
        const key = `meal:${meal.slot}`;
        rows.set(key, { label: MEAL_LABELS[meal.slot], value: p.recipes.find(recipe => recipe.recipeId === meal.recipeId)!.title });
        for (const [id, share] of Object.entries(meal.participantShares).sort(([a], [b]) => a.localeCompare(b))) {
          rows.set(`${key}:person:${id}`, { label: `${MEAL_LABELS[meal.slot]} · ${person(id)}`, value: `участвует · доля ${share}` });
        }
      }
      for (const item of projection.items) rows.set(`ingredient:${item.ingredientId}:${item.unit}`, {
        label: item.name, value: quantities(item.quantity, item.purchasedQuantity, item.toBuy, item.unit),
      });
      for (const item of projection.manualItems) rows.set(`manual:${item.id}`, {
        label: 'Ручная позиция', value: `${item.name} · ${quantities(item.quantity, item.purchasedQuantity, item.toBuy, item.unit)}`,
      });
      return { rows, meals: p.meals.map(meal => `${MEAL_LABELS[meal.slot]}: ${p.recipes.find(recipe => recipe.recipeId === meal.recipeId)!.title}`).join(' · ') };
    } catch {
      return { rows, notice: 'Формат этой версии не поддерживается. Количества и участие нельзя надёжно сравнить; сохраните копию перед выбором.' };
    }
  }
  // Legacy text is useful context, but cannot establish raw quantities or confirmed participation.
  for (const [index, day] of (Array.isArray(menu.days) ? menu.days : []).entries()) {
    if (!day || typeof day.day !== 'string') continue;
    for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      const meal = day[slot];
      if (meal && typeof meal.base === 'string') rows.set(`legacy:${index}:${slot}`, { label: `${day.day} · ${MEAL_LABELS[slot]}`, value: meal.base });
      if (meal?.portions && typeof meal.portions === 'object') for (const [id, portion] of Object.entries(meal.portions)) {
        if (typeof portion === 'string') rows.set(`legacy:${index}:${slot}:person:${id}`, { label: `${day.day} · ${MEAL_LABELS[slot]} · ${person(id)}`, value: portion });
      }
    }
  }
  return { rows, notice: 'Прежний формат: точные количества и участие недоступны для сравнения.' };
}

export function FamilyConflictView({ local, remote, members = [] }: {
  local?: FamilyWeeklyMenu | null; remote?: FamilyWeeklyMenu | null; members?: readonly DiningCard[];
}) {
  const left = summarize(local, members), right = summarize(remote, members);
  const keys = [...new Set([...left.rows.keys(), ...right.rows.keys()])].filter(key => {
    const a = left.rows.get(key), b = right.rows.get(key);
    return a?.label !== b?.label || a?.value !== b?.value;
  });
  return <div>
    <p>День: {local?.planningV1?.date ?? remote?.planningV1?.date ?? local?.weekStart ?? remote?.weekStart ?? 'не указан'}</p>
    {left.meals && left.meals === right.meals && <p>{left.meals}</p>}
    {left.notice && <p>На устройстве: {left.notice}</p>}{right.notice && <p>На сервере: {right.notice}</p>}
    {keys.length ? <div className="fp-two">{[left, right].map((summary, index) => <div key={index}>
      <h3>{index === 0 ? 'На устройстве' : 'На сервере'}</h3>
      {keys.map(key => <p key={key}><strong>{summary.rows.get(key)?.label ?? (index === 0 ? right : left).rows.get(key)?.label}: </strong>
        {summary.rows.get(key)?.value ?? (summary.notice ? 'нет данных для сравнения' : key.includes(':person:') ? 'не участвует' : 'позиция отсутствует')}</p>)}
    </div>)}</div> : !left.notice && !right.notice && <p>В блюдах, участии, порциях и покупках различий нет. Конфликт может относиться к версии состава; автоматическая замена отключена.</p>}
  </div>;
}
