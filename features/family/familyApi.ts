import { isRecord, responseErrorMessage } from '../../safeJson';
import { fetchWithResilience } from '../../services/httpClient';
import type { FamilyWeeklyMenu } from '../../types';
import { familyErrorMessage, requestFamilyJson, type FamilySession } from '../../services/familySession';
import { SessionReadError } from '../../storage/sessionRead';

export type CloudFamily = {
  id: string;
  name: string;
  owner_user_id: string;
  created_at?: number;
};

export type CloudFamilyMember = {
  user_id: string;
  role?: string | null;
  status?: string | null;
  sex?: string | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  activity?: number | null;
  goal?: string | null;
  created_at?: number;
  updated_at?: number;
  restrictions_json?: string | null;
  name?: string | null;
  email?: string | null;
  dietary?: {
    allergens?: unknown[];
    intolerances?: unknown[];
    excludedFoods?: unknown[];
  } | null;
  exclusions?: string | null;
};

export type FamilyShoppingItem = { name: string; grams: number; checked?: boolean };
export type FamilyShoppingState = { week_start: string; items: FamilyShoppingItem[] } | null;

type FamilyContext = {
  family: CloudFamily | null;
  members: CloudFamilyMember[];
  menu: FamilyWeeklyMenu | null;
};

function isCloudFamily(value: unknown): value is CloudFamily {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.owner_user_id === 'string';
}

function isCloudFamilyMember(value: unknown): value is CloudFamilyMember {
  return isRecord(value) && typeof value.user_id === 'string';
}

function isFamilyMenuMeal(value: unknown): value is FamilyWeeklyMenu['days'][number]['breakfast'] {
  if (!isRecord(value) || typeof value.base !== 'string' || !isRecord(value.portions)) return false;
  return Object.values(value.portions).every((portion) => typeof portion === 'string');
}

function isFamilyWeeklyMenu(value: unknown): value is FamilyWeeklyMenu {
  if (!isRecord(value) || !isRecord(value.prefs) || !Array.isArray(value.days) || !Array.isArray(value.shoppingList)) return false;
  return value.days.every((day) => {
    if (!isRecord(day) || typeof day.day !== 'string') return false;
    return ['breakfast', 'lunch', 'dinner', 'snack'].every((key) => isFamilyMenuMeal(day[key]));
  });
}

function isFamilyShoppingItem(value: unknown): value is FamilyShoppingItem {
  return isRecord(value) && typeof value.name === 'string' && Number.isFinite(Number(value.grams)) && (value.checked === undefined || typeof value.checked === 'boolean');
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function requestOptions(method = 'GET', body?: unknown): RequestInit {
  return {
    method,
    credentials: 'include',
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  };
}

async function apiFetch(input: string, init: RequestInit, session: FamilySession) {
  if (!session) throw new Error(familyErrorMessage(new SessionReadError('session')));
  return requestFamilyJson(session, input, init).catch(error => { throw new Error(familyErrorMessage(error)); });
}

// Remaining AI-family writer: replaced with durable delivery in the next component.
async function legacyApiFetch(input: string, init: RequestInit) {
  const method = (init.method ?? 'GET').toUpperCase();
  const response = await fetchWithResilience(input, init, { retries: method === 'GET' ? 1 : 0 });
  return { response, body: await responseJson(response) };
}

export async function loadFamilyContext(week: string, session: FamilySession): Promise<FamilyContext> {
  const [familyResult, menuResult] = await Promise.all([
    apiFetch('/api/family', requestOptions(), session),
    apiFetch(`/api/family/menu?week=${encodeURIComponent(week)}`, requestOptions(), session),
  ]);
  const { response: familyResponse, body: rawFamily } = familyResult;
  const familyData = isRecord(rawFamily) ? rawFamily : {};
  if (!familyResponse.ok) throw new Error(responseErrorMessage(familyData, 'Не удалось загрузить семью'));
  if (familyData.family !== null && !isCloudFamily(familyData.family) || !Array.isArray(familyData.members)
    || !familyData.members.every(isCloudFamilyMember)) throw new Error('Не удалось проверить данные семьи. Повторите загрузку.');

  const { response: menuResponse, body: rawMenu } = menuResult;
  const menuData = isRecord(rawMenu) ? rawMenu : {};
  if (!menuResponse.ok) throw new Error(responseErrorMessage(menuData, 'Не удалось загрузить семейное меню'));
  const shared = isRecord(menuData.shared) ? menuData.shared : null;
  if (menuData.weekStart !== week || menuData.shared !== null && (!shared || !isFamilyWeeklyMenu(shared.menu)
    || !isCloudFamily(familyData.family) || shared.familyId !== familyData.family.id)) {
    throw new Error('Не удалось проверить семейное меню. Повторите загрузку.');
  }

  return {
    family: isCloudFamily(familyData.family) ? familyData.family : null,
    members: Array.isArray(familyData.members) ? familyData.members.filter(isCloudFamilyMember) : [],
    menu: isFamilyWeeklyMenu(shared?.menu) ? shared.menu : null,
  };
}

export async function loadFamilyShopping(week: string, familyId: string, session: FamilySession): Promise<FamilyShoppingState> {
  const { response, body: rawData } = await apiFetch(
    `/api/shopping/list?week=${encodeURIComponent(week)}&family_id=${encodeURIComponent(familyId)}`,
    requestOptions(), session,
  );
  const data = isRecord(rawData) ? rawData : {};
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось загрузить список покупок'));
  if (data.family_id !== familyId || data.week_start !== week || !Array.isArray(data.items) || !data.items.every(isFamilyShoppingItem)) {
    throw new Error('Не удалось проверить список покупок. Повторите загрузку.');
  }
  const items = Array.isArray(data.items)
    ? data.items.filter(isFamilyShoppingItem).map((item) => ({ ...item, grams: Number(item.grams) }))
    : [];
  return { week_start: typeof data.week_start === 'string' ? data.week_start : week, items };
}

export async function setFamilyShoppingItem(
  week: string,
  familyId: string,
  ingredientName: string,
  checked: boolean,
  session: FamilySession,
): Promise<void> {
  const { response, body: data } = await apiFetch('/api/shopping/check', requestOptions('PATCH', {
    week_start: week,
    ingredient_name: ingredientName,
    checked,
    family_id: familyId,
  }), session);
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось обновить список покупок'));
}

export async function createFamily(name: string, session: FamilySession): Promise<void> {
  const { response, body: data } = await apiFetch('/api/family', requestOptions('POST', { name }), session);
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось создать семью'));
}

export async function createFamilyInvite(session: FamilySession): Promise<string> {
  const { response, body: rawData } = await apiFetch('/api/family/invite', requestOptions('POST'), session);
  const data = isRecord(rawData) ? rawData : {};
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось создать приглашение'));
  return typeof data.code === 'string' ? data.code : '';
}

export async function joinFamily(code: string, session: FamilySession): Promise<void> {
  const { response, body: data } = await apiFetch('/api/family/join', requestOptions('POST', { code }), session);
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось присоединиться'));
}

export async function updateFamilyGoal(goal: 'LOSS' | 'MAINTAIN', session: FamilySession): Promise<void> {
  const { response, body: data } = await apiFetch('/api/family/member', requestOptions('PATCH', { goal }), session);
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось обновить цель'));
}

export async function generateFamilyMenu(week: string, session: FamilySession): Promise<void> {
  const { response, body: data } = await apiFetch(`/api/family/menu/generate?week=${encodeURIComponent(week)}`, requestOptions('POST'), session);
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось сгенерировать семейное меню'));
}

export async function saveFamilyMenu(week: string, menu: FamilyWeeklyMenu): Promise<void> {
  const { response, body: data } = await legacyApiFetch('/api/family/menu', requestOptions('POST', { weekStart: week, menu }));
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось сохранить семейное меню на сервере'));
}

export async function saveFamilyShoppingItems(
  week: string,
  familyId: string,
  items: NonNullable<FamilyWeeklyMenu['shoppingListItems']>,
): Promise<void> {
  const { response, body: data } = await legacyApiFetch('/api/weekly_menu/items', requestOptions('POST', {
    week_start: week,
    family_id: familyId,
    items,
  }));
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось синхронизировать семейный список покупок'));
}
