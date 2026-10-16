import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadFamilyContext,
  saveFamilyShoppingItems,
  setFamilyShoppingItem,
} from '../features/family/familyApi';
import type { FamilyWeeklyMenu } from '../types';

const menu: FamilyWeeklyMenu = {
  prefs: { includeIds: ['user-1'], cookingMode: 'all_meals' },
  shoppingList: [],
  days: [{
    day: 'Понедельник',
    breakfast: { base: 'Каша', portions: { 'user-1': '250 г' } },
    lunch: { base: 'Суп', portions: { 'user-1': '350 г' } },
    dinner: { base: 'Рыба', portions: { 'user-1': '200 г' } },
    snack: { base: 'Йогурт', portions: { 'user-1': '150 г' } },
  }],
};

afterEach(() => vi.unstubAllGlobals());

describe('family API client', () => {
  it('loads validated family and shared menu data through the established endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        family: { id: 'family-1', name: 'Семья', owner_user_id: 'user-1' },
        members: [{ user_id: 'user-1', name: 'Ира' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ shared: { menu } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadFamilyContext('2026-10-05')).resolves.toEqual({
      family: { id: 'family-1', name: 'Семья', owner_user_id: 'user-1' },
      members: [{ user_id: 'user-1', name: 'Ира' }],
      menu,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/family', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/family/menu?week=2026-10-05', expect.objectContaining({ credentials: 'include' }));
  });

  it('uses the existing shopping check payload and surfaces an API error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Нет доступа' } }), { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(setFamilyShoppingItem('2026-10-05', 'family-1', 'Яблоки', true)).rejects.toThrow('Нет доступа');
    expect(fetchMock).toHaveBeenCalledWith('/api/shopping/check', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        week_start: '2026-10-05',
        ingredient_name: 'Яблоки',
        checked: true,
        family_id: 'family-1',
      }),
    }));
  });

  it('saves the structured shopping list with its family and week context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await saveFamilyShoppingItems('2026-10-05', 'family-1', [{ name: 'Овсянка', grams: 400 }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/weekly_menu/items', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        week_start: '2026-10-05',
        family_id: 'family-1',
        items: [{ name: 'Овсянка', grams: 400 }],
      }),
    }));
  });
});
