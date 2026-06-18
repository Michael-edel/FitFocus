import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { FamilyWeeklyMenu, UserProfile } from './types';

type FamilyShoppingState = { week_start: string; items: { name: string; grams: number; checked?: boolean }[] } | null;

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
  const [cloudFamily, setCloudFamily] = useState<any | null>(null);
  const [cloudFamilyMembers, setCloudFamilyMembers] = useState<any[]>([]);
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
      const data = await familyRes.json().catch(() => ({}));
      if (!familyRes.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось загрузить семью');
      setCloudFamily(data.family || null);
      setCloudFamilyMembers(Array.isArray(data.members) ? data.members : []);
      const menuData = await menuRes.json().catch(() => ({}));
      const serverMenu = menuData?.shared?.menu && typeof menuData.shared.menu === 'object' ? menuData.shared.menu : null;
      const looksLikeFamilyWeeklyMenu =
        !!serverMenu &&
        typeof serverMenu === 'object' &&
        Array.isArray((serverMenu as any).days) &&
        typeof (serverMenu as any).prefs === 'object' &&
        Array.isArray((serverMenu as any).shoppingList) &&
        (serverMenu as any).days.every((day: any) =>
          day &&
          typeof day === 'object' &&
          ['breakfast', 'lunch', 'dinner', 'snack'].every((mealKey) => {
            const meal = day[mealKey];
            return meal && typeof meal === 'object' && typeof meal.base === 'string' && typeof meal.portions === 'object';
          })
        );
      setCloudFamilyMenu(looksLikeFamilyWeeklyMenu ? (serverMenu as FamilyWeeklyMenu) : null);
      if (data.family && planScope !== 'family') {
        setPlanScope('family');
      }
    } catch (e: any) {
      setCloudFamilyError(e?.message || 'Ошибка');
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить список покупок семьи');
      setFamilyShopping({ week_start: data.week_start, items: data.items || [] });
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось обновить список покупок');
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось создать семью');
    await loadCloudFamily();
  }, [familyNameDraft, loadCloudFamily]);

  const makeInviteCode = useCallback(async () => {
    const res = await fetch('/api/family/invite', { method: 'POST', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось создать приглашение');
    setFamilyInviteCode(String(data.code || ''));
    return String(data.code || '');
  }, []);

  const joinFamilyCloud = useCallback(async () => {
    const code = (familyJoinCode || '').trim();
    if (!code) return;
    const res = await fetch('/api/family/join', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось присоединиться');
    setFamilyJoinCode('');
    await loadCloudFamily();
  }, [familyJoinCode, loadCloudFamily]);

  const updateMyFamilyGoal = useCallback(async (goal: 'LOSS' | 'MAINTAIN') => {
    const res = await fetch('/api/family/member', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось обновить цель');
    await loadCloudFamily();
  }, [loadCloudFamily]);

  const generateFamilyMenuNow = useCallback(async () => {
    if (!cloudFamily?.id) return;
    const week = weekStartISO();
    const res = await fetch(`/api/family/menu/generate?week=${encodeURIComponent(week)}`, { method: 'POST', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось сгенерировать семейное меню');
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
