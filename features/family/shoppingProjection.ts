import type { FamilyWeeklyMenu } from '../../types';
import type { FamilyShoppingState } from './familyApi';
import { aggregateShoppingRows, ingredientKey } from '../../shoppingIngredients';

/** Pending and accepted menus use exactly the same ingredient normalization. */
export function familyShoppingProjection(week: string, menu: FamilyWeeklyMenu, previous: FamilyShoppingState): NonNullable<FamilyShoppingState> {
  const checked = new Set(previous?.week_start === week ? previous.items.filter(item => item.checked).map(item => ingredientKey(item.name)) : []);
  return { week_start: week, items: aggregateShoppingRows((menu.shoppingListItems ?? []).map(item => ({ ...item, checked: checked.has(ingredientKey(item.name)) }))) };
}
