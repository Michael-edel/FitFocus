import { isRecord, responseErrorMessage } from '../../safeJson';
import { isFamilyMenuPayload, isFamilyMenuSnapshot, type FamilyMenuSnapshot } from '../../familyMenuValidation';
import type { FamilyWeeklyMenu } from '../../types';
import { familyErrorMessage, requestFamilyJson, type FamilySession } from '../../services/familySession';
import { runShoppingCheckInOrder } from '../../services/shoppingCheckOrder';
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
  snapshot?: FamilyMenuSnapshot;
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

  let snapshot: FamilyMenuSnapshot | undefined;
  // The durable read binds the explicit family/week and uses its own capability.
  // A server before the migration can still display its old snapshot.
  if (isCloudFamily(familyData.family) && (menuData.version === 0 || typeof shared?.version === 'number')) {
    const proof = await apiFetch(`/api/family/menu/state?familyId=${encodeURIComponent(familyData.family.id)}&week=${encodeURIComponent(week)}`, requestOptions(), session);
      if (!proof.response.ok || !isRecord(proof.body) || !isFamilyMenuSnapshot(proof.body.snapshot)
        || proof.body.snapshot.familyId !== familyData.family.id || proof.body.snapshot.weekStart !== week) {
        throw new Error(responseErrorMessage(proof.body, 'Не удалось проверить версию семейного меню.'));
      }
      snapshot = proof.body.snapshot;
  }
  return {
    family: isCloudFamily(familyData.family) ? familyData.family : null,
    members: Array.isArray(familyData.members) ? familyData.members.filter(isCloudFamilyMember) : [],
    menu: snapshot ? snapshot.menu : isFamilyWeeklyMenu(shared?.menu) ? shared.menu : null,
    ...(snapshot ? { snapshot } : {}),
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
  await runShoppingCheckInOrder({ accountId: session.guard.accountId, familyId, weekStart: week, ingredientName }, async () => {
    const { response, body: data } = await apiFetch('/api/shopping/check', requestOptions('PATCH', {
      week_start: week,
      ingredient_name: ingredientName,
      checked,
      family_id: familyId,
    }), session);
    if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось обновить список покупок'));
  });
}

export async function createFamily(name: string, session: FamilySession): Promise<void> {
  const { response, body: data } = await apiFetch('/api/family', requestOptions('POST', { name }), session);
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось создать семью'));
}

export async function createFamilyInvite(familyId: string, session: FamilySession): Promise<string> {
  const targetFamilyId = typeof familyId === 'string' ? familyId.trim() : '';
  if (!targetFamilyId) throw new Error('Не удалось определить семью для приглашения. Обновите список семей.');
  const { response, body: rawData } = await apiFetch('/api/family/invite', requestOptions('POST', { familyId: targetFamilyId }), session);
  const data = isRecord(rawData) ? rawData : {};
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось создать приглашение'));
  return typeof data.code === 'string' ? data.code : '';
}

export async function joinFamily(code: string, session: FamilySession): Promise<void> {
  const { response, body: data } = await apiFetch('/api/family/join', requestOptions('POST', { code }), session);
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось присоединиться'));
}

export async function updateFamilyGoal(familyId: string, goal: 'LOSS' | 'MAINTAIN', session: FamilySession): Promise<void> {
  const targetFamilyId = typeof familyId === 'string' ? familyId.trim() : '';
  if (!targetFamilyId) throw new Error('Не удалось определить семью участника. Обновите список семей.');
  const { response, body: data } = await apiFetch('/api/family/member', requestOptions('PATCH', { familyId: targetFamilyId, goal }), session);
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось обновить цель'));
}

export async function generateFamilyMenu(week: string, familyId: string, session: FamilySession): Promise<FamilyWeeklyMenu> {
  const { response, body: data } = await apiFetch(`/api/family/menu/generate?week=${encodeURIComponent(week)}`,
    requestOptions('POST', { preview: true, familyId }), session);
  if (!response.ok) throw new Error(responseErrorMessage(data, 'Не удалось сгенерировать семейное меню'));
  if (!isRecord(data) || data.preview !== true || !isRecord(data.shared) || data.shared.familyId !== familyId
    || data.shared.weekStart !== week || !isFamilyMenuPayload(data.shared.menu, week)) throw new Error('Не удалось проверить семейное меню.');
  return data.shared.menu;
}
