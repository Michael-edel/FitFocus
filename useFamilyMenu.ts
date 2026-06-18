import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { FamilyWeeklyMenu, UserProfile } from './types';
import { persistAllUsersSnapshot, safeSetItem } from './storage/hybrid';

type FamilyMenuPrefs = {
  includeIds: string[];
  cookingMode: 'all_meals' | 'once_per_day';
  budgetPerWeek: string;
  currency: string;
};

type UseFamilyMenuParams = {
  allUsers: UserProfile[];
  cloudFamily: { id?: string | null } | null;
  cloudFamilyMenu: FamilyWeeklyMenu | null;
  currentUser: UserProfile | null;
  generateFamilyWeeklyMenu: (user: UserProfile, users: UserProfile[], prefs: { includeIds: string[]; cookingMode: 'all_meals' | 'once_per_day'; budgetPerWeek?: number; currency: string }) => Promise<FamilyWeeklyMenu>;
  loadCloudFamily: () => Promise<void>;
  loadFamilyShopping: () => Promise<void>;
  setAllUsers: Dispatch<SetStateAction<UserProfile[]>>;
  setCloudFamilyMenu: Dispatch<SetStateAction<FamilyWeeklyMenu | null>>;
  setCurrentUser: Dispatch<SetStateAction<UserProfile | null>>;
  weekStartISO: () => string;
};

export function useFamilyMenu({
  allUsers,
  cloudFamily,
  cloudFamilyMenu,
  currentUser,
  generateFamilyWeeklyMenu,
  loadCloudFamily,
  loadFamilyShopping,
  setAllUsers,
  setCloudFamilyMenu,
  setCurrentUser,
  weekStartISO,
}: UseFamilyMenuParams) {
  const [familyMenuLoading, setFamilyMenuLoading] = useState(false);
  const [familyMenuError, setFamilyMenuError] = useState<string | null>(null);
  const [familyMenuPrefsOpen, setFamilyMenuPrefsOpen] = useState(false);
  const [familyMenuPrefs, setFamilyMenuPrefs] = useState<FamilyMenuPrefs>({
    includeIds: [],
    cookingMode: 'all_meals',
    budgetPerWeek: '',
    currency: 'KZT',
  });

  useEffect(() => {
    if (!currentUser?.id) return;
    const newPrefsKey = `fitfocus_data_${currentUser.id}_family_menu_prefs`;
    try {
      const raw = localStorage.getItem(newPrefsKey);
      const saved = raw ? JSON.parse(raw) : null;
      if (raw) safeSetItem(newPrefsKey, raw);
      const fromStore = saved && typeof saved === 'object' ? saved : null;
      const baseInclude = (saved?.includeIds?.length ? saved.includeIds : (fromStore?.includeIds?.length ? fromStore.includeIds : []));
      const includeIds = baseInclude.length ? baseInclude : allUsers.map(u => u.id);
      setFamilyMenuPrefs(prev => ({
        ...prev,
        includeIds,
        cookingMode: (saved?.cookingMode || fromStore?.cookingMode || prev.cookingMode) as any,
        budgetPerWeek: String(saved?.budgetPerWeek ?? fromStore?.budgetPerWeek ?? prev.budgetPerWeek ?? ''),
        currency: String(saved?.currency ?? fromStore?.currency ?? prev.currency ?? 'KZT'),
      }));
    } catch {}
  }, [allUsers, currentUser?.id]);

  const familyMenu = useMemo(() => cloudFamilyMenu ?? currentUser?.aiPlan?.familyWeeklyMenu ?? null, [cloudFamilyMenu, currentUser?.aiPlan?.familyWeeklyMenu]);

  const handleGenerateFamilyWeeklyMenu = useCallback(async () => {
    if (!currentUser?.aiPlan) return;
    setFamilyMenuError(null);
    const includeIds = (familyMenuPrefs.includeIds?.length ? familyMenuPrefs.includeIds : allUsers.map(u => u.id));
    if (!includeIds.length || !familyMenuPrefs.cookingMode) {
      setFamilyMenuPrefsOpen(true);
      return;
    }

    setFamilyMenuLoading(true);
    try {
      const prefs = {
        includeIds,
        cookingMode: familyMenuPrefs.cookingMode,
        budgetPerWeek: familyMenuPrefs.budgetPerWeek ? Number(familyMenuPrefs.budgetPerWeek) : undefined,
        currency: familyMenuPrefs.currency || 'KZT',
      };

      try {
        safeSetItem(`fitfocus_data_${currentUser.id}_family_menu_prefs`, JSON.stringify(prefs));
      } catch {}

      const familyWeeklyMenu = await generateFamilyWeeklyMenu(currentUser, allUsers, prefs);
      const updatedUser: UserProfile = { ...currentUser, aiPlan: { ...currentUser.aiPlan, familyWeeklyMenu } };
      setCurrentUser(updatedUser);
      setAllUsers(prev => {
        const next = prev.map(u => (u.id === updatedUser.id ? updatedUser : u));
        persistAllUsersSnapshot(updatedUser.id, next);
        return next;
      });

      if (cloudFamily?.id) {
        const week = weekStartISO();
        const menuRes = await fetch('/api/family/menu', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekStart: week,
            menu: familyWeeklyMenu,
          }),
        });
        const menuData = await menuRes.json().catch(() => ({}));
        if (!menuRes.ok) throw new Error(menuData?.error?.message || menuData?.error || 'Не удалось сохранить семейное меню на сервере');
        setCloudFamilyMenu(familyWeeklyMenu);
      }

      if (cloudFamily?.id && Array.isArray(familyWeeklyMenu.shoppingListItems) && familyWeeklyMenu.shoppingListItems.length) {
        const week = weekStartISO();
        const res = await fetch('/api/weekly_menu/items', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            week_start: week,
            family_id: cloudFamily.id,
            items: familyWeeklyMenu.shoppingListItems,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось синхронизировать семейный список покупок');
        await loadFamilyShopping();
      }
      await loadCloudFamily();
    } catch (e: any) {
      setFamilyMenuError(e?.message || 'Не удалось сгенерировать семейное меню на неделю.');
    } finally {
      setFamilyMenuLoading(false);
    }
  }, [
    allUsers,
    cloudFamily?.id,
    currentUser,
    familyMenuPrefs,
    generateFamilyWeeklyMenu,
    loadCloudFamily,
    loadFamilyShopping,
    setAllUsers,
    setCloudFamilyMenu,
    setCurrentUser,
    weekStartISO,
  ]);

  return {
    familyMenu,
    familyMenuError,
    familyMenuLoading,
    familyMenuPrefs,
    familyMenuPrefsOpen,
    handleGenerateFamilyWeeklyMenu,
    setFamilyMenuError,
    setFamilyMenuPrefs,
    setFamilyMenuPrefsOpen,
  };
}
