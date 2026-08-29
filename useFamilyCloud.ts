import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { FamilyWeeklyMenu, UserProfile } from './types';
import { errorMessage, isRecord, parseJson, responseErrorMessage } from './safeJson';

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

type FamilyShoppingItem = { name: string; grams: number; checked?: boolean };
type FamilyShoppingState = { week_start: string; items: FamilyShoppingItem[] } | null;

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

type UseFamilyCloudParams = {
  currentUser: UserProfile | null;
  planScope: 'personal' | 'family';
  setPlanScope: Dispatch<SetStateAction<'personal' | 'family'>>;
  weekStartISO: () => string;
  loadCloudFamilyOnDemand?: boolean;
};

export function useFamilyCloud({
  currentUser,
  planScope,
  setPlanScope,
  weekStartISO,
}: UseFamilyCloudParams) {
  const [cloudFamily, setCloudFamily] = useState<CloudFamily | null>(null);
  const [cloudFamilyMembers, setCloudFamilyMembers] = useState<CloudFamilyMember[]>([]);
  const [cloudFamilyLoading, setCloudFamilyLoading] = useState(false);
  const [cloudFamilyError, setCloudFamilyError] = useState<string | null>(null);

  const [familyInviteCode, setFamilyInviteCode] = useState<string>('');
  const [familyJoinCode, setFamilyJoinCode] = useState<string>('');
  const [familyNameDraft, setFamilyNameDraft] = useState<string>('Моя семья');

  const [familyShopping, setFamilyShopping] = useState<FamilyShoppingState>(null);
  const [familyShoppingLoading, setFamilyShoppingLoading] = useState(false);
  const [cloudFamilyMenu, setCloudFamilyMenu] = useState<FamilyWeeklyMenu | null>(null);

  useEffect(() => {
    if (!currentUser?.id) {
      setCloudFamily(null);
      setCloudFamilyMembers([]);
      setCloudFamilyMenu(null);
      setFamilyShopping(null);
    }
  }, [currentUser?.id]);

  const loadCloudFamily = useCallback(async () => {
    try {
      setCloudFamilyLoading(true);
      setCloudFamilyError(null);
      const week = weekStartISO();
      const [familyRes, menuRes] = await Promise.all([
        fetch('/api/family', { credentials: 'include' }),
        fetch(`/api/family/menu?week=${encodeURIComponent(week)}`, { credentials: 'include' }),
      ]);
      const rawData: unknown = await familyRes.json().catch(() => null);
      const data = isRecord(rawData) ? rawData : {};
      if (!familyRes.ok) throw new Error(responseErrorMessage(data, 'Не удалось загрузить семью'));
      const nextFamily = isCloudFamily(data.family) ? data.family : null;
      setCloudFamily(nextFamily);
      setCloudFamilyMembers(Array.isArray(data.members) ? data.members.filter(isCloudFamilyMember) : []);
      const rawMenuData: unknown = await menuRes.json().catch(() => null);
      const menuData = isRecord(rawMenuData) ? rawMenuData : {};
      const shared = isRecord(menuData.shared) ? menuData.shared : null;
      const serverMenu = shared?.menu;
      setCloudFamilyMenu(isFamilyWeeklyMenu(serverMenu) ? serverMenu : null);
      if (nextFamily && planScope !== 'family') {
        setPlanScope('family');
      }
    } catch (e: unknown) {
      setCloudFamilyError(errorMessage(e, 'Ошибка'));
      setCloudFamily(null);
      setCloudFamilyMembers([]);
      setCloudFamilyMenu(null);
    } finally {
      setCloudFamilyLoading(false);
    }
  }, [planScope, setPlanScope, weekStartISO]);

  const loadFamilyShopping = useCallback(async () => {
    if (!cloudFamily?.id) return;
    try {
      setFamilyShoppingLoading(true);
      const week = weekStartISO();
      const res = await fetch(`/api/shopping/list?week=${encodeURIComponent(week)}&family_id=${encodeURIComponent(cloudFamily.id)}`, { credentials: 'include' });
      const rawData: unknown = await res.json().catch(() => null);
      const data = isRecord(rawData) ? rawData : {};
      if (!res.ok) throw new Error(responseErrorMessage(data, 'Не удалось загрузить список покупок семьи'));
      const items = Array.isArray(data.items) ? data.items.filter(isFamilyShoppingItem).map((item) => ({ ...item, grams: Number(item.grams) })) : [];
      const weekStart = typeof data.week_start === 'string' ? data.week_start : week;
      setFamilyShopping({ week_start: weekStart, items });
    } catch {
      setFamilyShopping(null);
    } finally {
      setFamilyShoppingLoading(false);
    }
  }, [cloudFamily?.id, weekStartISO]);

  const toggleFamilyShoppingItem = useCallback(async (ingredientName: string, checked: boolean) => {
    if (!cloudFamily?.id) return;
    const week = weekStartISO();
    setFamilyShopping((prev) => prev ? ({
      ...prev,
      items: prev.items.map((it) => it.name === ingredientName ? { ...it, checked } : it),
    }) : prev);
    try {
      const res = await fetch('/api/shopping/check', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: week,
          ingredient_name: ingredientName,
          checked,
          family_id: cloudFamily.id,
        }),
      });
      const rawData: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(responseErrorMessage(rawData, 'Не удалось обновить список покупок'));
    } catch (e) {
      setFamilyShopping((prev) => prev ? ({
        ...prev,
        items: prev.items.map((it) => it.name === ingredientName ? { ...it, checked: !checked } : it),
      }) : prev);
      throw e;
    }
  }, [cloudFamily?.id, weekStartISO]);

  const createFamilyCloud = useCallback(async () => {
    const name = (familyNameDraft || 'Моя семья').trim().slice(0, 60);
    const res = await fetch('/api/family', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const rawData: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error(responseErrorMessage(rawData, 'Не удалось создать семью'));
    await loadCloudFamily();
  }, [familyNameDraft, loadCloudFamily]);

  const makeInviteCode = useCallback(async () => {
    const res = await fetch('/api/family/invite', { method: 'POST', credentials: 'include' });
    const rawData: unknown = await res.json().catch(() => null);
    const data = isRecord(rawData) ? rawData : {};
    if (!res.ok) throw new Error(responseErrorMessage(data, 'Не удалось создать приглашение'));
    const code = typeof data.code === 'string' ? data.code : '';
    setFamilyInviteCode(code);
    return code;
  }, []);

  const joinFamilyCloud = useCallback(async () => {
    const code = (familyJoinCode || '').trim();
    if (!code) return;
    const res = await fetch('/api/family/join', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const rawData: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error(responseErrorMessage(rawData, 'Не удалось присоединиться'));
    setFamilyJoinCode('');
    await loadCloudFamily();
  }, [familyJoinCode, loadCloudFamily]);

  const updateMyFamilyGoal = useCallback(async (goal: 'LOSS' | 'MAINTAIN') => {
    const res = await fetch('/api/family/member', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal }) });
    const rawData: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error(responseErrorMessage(rawData, 'Не удалось обновить цель'));
    await loadCloudFamily();
  }, [loadCloudFamily]);

  const generateFamilyMenuNow = useCallback(async () => {
    if (!cloudFamily?.id) return;
    const week = weekStartISO();
    const res = await fetch(`/api/family/menu/generate?week=${encodeURIComponent(week)}`, { method: 'POST', credentials: 'include' });
    const rawData: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error(responseErrorMessage(rawData, 'Не удалось сгенерировать семейное меню'));
    await loadFamilyShopping();
    await loadCloudFamily();
  }, [cloudFamily?.id, weekStartISO, loadFamilyShopping, loadCloudFamily]);

  return {
    cloudFamily,
    cloudFamilyMembers,
    cloudFamilyLoading,
    cloudFamilyMenu,
    cloudFamilyError,
    familyInviteCode,
    familyJoinCode,
    familyNameDraft,
    familyShopping,
    familyShoppingLoading,
    loadCloudFamily,
    loadFamilyShopping,
    makeInviteCode,
    createFamilyCloud,
    joinFamilyCloud,
    setCloudFamily,
    setCloudFamilyError,
    setCloudFamilyMembers,
    setCloudFamilyMenu,
    setFamilyInviteCode,
    setFamilyJoinCode,
    setFamilyNameDraft,
    setFamilyShopping,
    setFamilyShoppingLoading,
    toggleFamilyShoppingItem,
    updateMyFamilyGoal,
    generateFamilyMenuNow,
  };
}
