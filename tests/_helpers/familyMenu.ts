import { Gender, Goal, ActivityLevel, type FamilyWeeklyMenu, type UserProfile } from '../../types';
export const familyWeek = '2026-10-12';
export const familyTestProfile = (id: string): UserProfile => ({ id, name: 'Synthetic person', gender: Gender.FEMALE,
  age: 30, weight: 65, height: 165, activityLevel: ActivityLevel.LIGHTLY_ACTIVE, goal: Goal.MAINTAIN,
  weightHistory: [], targetWeight: 65, adaptationMultiplier: 1, familyMembers: [], exclusions: '',
});
export const familyTestMenu = (owner: string, grams = 400, weekStart = familyWeek): FamilyWeeklyMenu => ({ weekStart,
  prefs: { includeIds: [owner], cookingMode: 'all_meals', currency: 'KZT' },
  days: Array.from({ length: 7 }, (_, index) => ({ day: String(index), breakfast: { base: 'Рис', portions: { [owner]: `${grams} г, 560 ккал` } },
    lunch: { base: 'Рис', portions: { [owner]: `${grams} г, 560 ккал` } }, dinner: { base: 'Рис', portions: { [owner]: `${grams} г, 560 ккал` } },
    snack: { base: 'Рис', portions: { [owner]: `${grams} г, 560 ккал` } },
  })), shoppingList: ['Рис'], shoppingListItems: [{ name: 'Рис', grams }],
});
