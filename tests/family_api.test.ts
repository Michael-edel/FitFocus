import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { StateDatabase } from '../storage/stateDatabase';
import { DurableOutbox } from '../storage/durableOutbox';
import type { FamilySession } from '../services/familySession';
import {
  loadFamilyContext,
  loadFamilyShopping,
  generateFamilyMenu,
  createFamilyInvite,
  setFamilyShoppingItem,
  updateFamilyGoal,
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

let database: StateDatabase, session: FamilySession;
const sid = 'a'.repeat(64);
const headers = { 'Content-Type': 'application/json', 'X-FitFocus-Family-Protocol': '1', 'X-FitFocus-Family-Guard': '1',
  'X-FitFocus-State-Account': 'user-1', 'X-FitFocus-State-Session': sid };
const me = { user: { sub: 'user-1' }, hasAccess: true, stateSync: { protocol: 2, guard: 1, accountId: 'user-1', sessionId: sid },
  familySync: { protocol: 1, guard: 1, target: 1 } };
beforeEach(async () => {
  database = new StateDatabase({ factory: new IDBFactory() }); const outbox = new DurableOutbox(database);
  session = { guard: (await outbox.acceptReadSession('user-1', sid, 0))!, controller: new AbortController(), isCurrentSession: () => true, outbox };
});
afterEach(() => { database.close(); vi.unstubAllGlobals(); });

describe('family API client', () => {
  it('loads validated family and shared menu data through the established endpoints', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).startsWith('/api/me') ? me : url === '/api/family' ? {
        family: { id: 'family-1', name: 'Семья', owner_user_id: 'user-1' },
        members: [{ user_id: 'user-1', name: 'Ира' }],
      } : { weekStart: '2026-10-05', shared: { familyId: 'family-1', menu } }), { status: 200, headers }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadFamilyContext('2026-10-05', session)).resolves.toEqual({
      family: { id: 'family-1', name: 'Семья', owner_user_id: 'user-1' },
      members: [{ user_id: 'user-1', name: 'Ира' }],
      menu,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/family', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/family/menu?week=2026-10-05', expect.objectContaining({ credentials: 'include' }));
  });

  it('uses the existing shopping check payload and surfaces an API error', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url).startsWith('/api/me')
      ? new Response(JSON.stringify(me), { headers }) : new Response(JSON.stringify({ error: { message: 'Нет доступа' } }), { status: 403, headers }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(setFamilyShoppingItem('2026-10-05', 'family-1', 'Яблоки', true, session)).rejects.toThrow('Нет доступа');
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

  it('sends the explicit family target for invite and member mutations', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/me')) return new Response(JSON.stringify(me), { headers });
      return new Response(JSON.stringify(url === '/api/family/invite' ? { code: 'INVITE-2' } : { ok: true }), {
        status: url === '/api/family/invite' ? 201 : 200,
        headers,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createFamilyInvite('family-2', session)).resolves.toBe('INVITE-2');
    await updateFamilyGoal('family-2', 'LOSS', session);

    expect(fetchMock).toHaveBeenCalledWith('/api/family/invite', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ familyId: 'family-2' }),
    }));
    expect(fetchMock).toHaveBeenCalledWith('/api/family/member', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ familyId: 'family-2', goal: 'LOSS' }),
    }));
  });

  it.each(['invite', 'member'])('does not send a %s mutation before the server advertises explicit targets', async kind => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/me')) {
        return new Response(JSON.stringify({ ...me, familySync: { protocol: 1, guard: 1 } }), { headers });
      }
      return new Response(JSON.stringify(kind === 'invite' ? { code: 'unexpected' } : { ok: true }), { headers });
    });
    vi.stubGlobal('fetch', fetchMock);

    const mutation = kind === 'invite'
      ? createFamilyInvite('family-1', session)
      : updateFamilyGoal('family-1', 'LOSS', session);
    await expect(mutation).rejects.toThrow('Сервер пока не поддерживает');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/me');
  });

  it('requires the family CAS capability before requesting a generated preview', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(me), { headers }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateFamilyMenu('2026-10-05', 'family-1', session)).rejects.toThrow('Сервер пока не поддерживает');
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it.each(['week', 'family', 'items'])('refuses mismatched shopping %s instead of replacing the local list', async change => {
    const data = { family_id: 'family-1', week_start: '2026-10-05', items: [{ name: 'Рис', grams: 400 }] };
    if (change === 'week') data.week_start = '2026-10-12';
    if (change === 'family') data.family_id = 'family-2';
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).startsWith('/api/me') ? me
      : change === 'items' ? { ...data, items: null } : data), { headers })); vi.stubGlobal('fetch', fetchMock);
    await expect(loadFamilyShopping('2026-10-05', 'family-1', session)).rejects.toThrow('проверить список');
  });
});
