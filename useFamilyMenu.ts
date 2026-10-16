import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { FamilyWeeklyMenu, UserProfile } from './types';
import { persistAllUsersSnapshot, safeSetItem } from './storage/hybrid';
import { errorMessage, isRecord, parseJson } from './safeJson';
import { saveFamilyMenu, saveFamilyShoppingItems } from './features/family/familyApi';

export type FamilyMenuPrefs = {
  includeIds: string[];
  cookingMode: 'all_meals' | 'once_per_day';
  budgetPerWeek: string;
  currency: string;
};

export const DEFAULT_FAMILY_MENU_PREFS: FamilyMenuPrefs = {
  includeIds: [],
  cookingMode: 'all_meals',
  budgetPerWeek: '',
  currency: 'KZT',
};

function isCookingMode(value: unknown): value is FamilyMenuPrefs['cookingMode'] {
  return value === 'all_meals' || value === 'once_per_day';
}

/** Reads only valid values and never lets one profile's preferences seed another's. */
export function readFamilyMenuPrefs(raw: string | null, defaultIncludeIds: string[]): FamilyMenuPrefs {
  const saved = raw ? parseJson(raw) : null;
  const fromStore = isRecord(saved) ? saved : {};
  const storedIncludeIds = Array.isArray(fromStore.includeIds)
    ? fromStore.includeIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  const budgetPerWeek = fromStore.budgetPerWeek;
  const currency = fromStore.currency;

  return {
    includeIds: storedIncludeIds.length ? storedIncludeIds : defaultIncludeIds,
    cookingMode: isCookingMode(fromStore.cookingMode) ? fromStore.cookingMode : DEFAULT_FAMILY_MENU_PREFS.cookingMode,
    budgetPerWeek: typeof budgetPerWeek === 'string' || typeof budgetPerWeek === 'number'
      ? String(budgetPerWeek)
      : DEFAULT_FAMILY_MENU_PREFS.budgetPerWeek,
    currency: typeof currency === 'string' && currency.trim()
      ? currency
      : DEFAULT_FAMILY_MENU_PREFS.currency,
  };
}

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
  const [familyMenuPrefs, setFamilyMenuPrefs] = useState<FamilyMenuPrefs>(DEFAULT_FAMILY_MENU_PREFS);

  useEffect(() => {
    if (!currentUser?.id) {
      setFamilyMenuPrefs(DEFAULT_FAMILY_MENU_PREFS);
      return;
    }
    const prefsKey = `fitfocus_data_${currentUser.id}_family_menu_prefs`;
    try {
      const next = readFamilyMenuPrefs(localStorage.getItem(prefsKey), allUsers.map((user) => user.id));
      setFamilyMenuPrefs(next);
      safeSetItem(prefsKey, JSON.stringify(next));
    } catch {
      setFamilyMenuPrefs({
        ...DEFAULT_FAMILY_MENU_PREFS,
        includeIds: allUsers.map((user) => user.id),
      });
    }
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
        await saveFamilyMenu(week, familyWeeklyMenu);
        setCloudFamilyMenu(familyWeeklyMenu);
      }

      if (cloudFamily?.id && Array.isArray(familyWeeklyMenu.shoppingListItems) && familyWeeklyMenu.shoppingListItems.length) {
        const week = weekStartISO();
        await saveFamilyShoppingItems(week, cloudFamily.id, familyWeeklyMenu.shoppingListItems);
        await loadFamilyShopping();
      }
      await loadCloudFamily();
    } catch (e: unknown) {
      setFamilyMenuError(errorMessage(e, 'Не удалось сгенерировать семейное меню на неделю.'));
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
