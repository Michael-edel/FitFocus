import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { FamilyWeeklyMenu, UserProfile } from './types';
import { errorMessage } from './safeJson';
import {
  createFamily,
  createFamilyInvite,
  generateFamilyMenu,
  joinFamily,
  loadFamilyContext,
  loadFamilyShopping as loadFamilyShoppingFromApi,
  setFamilyShoppingItem,
  updateFamilyGoal,
  type CloudFamily,
  type CloudFamilyMember,
  type FamilyShoppingState,
} from './features/family/familyApi';

export type { CloudFamily, CloudFamilyMember } from './features/family/familyApi';

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
      const context = await loadFamilyContext(week);
      setCloudFamily(context.family);
      setCloudFamilyMembers(context.members);
      setCloudFamilyMenu(context.menu);
      if (context.family && planScope !== 'family') {
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
      setFamilyShopping(await loadFamilyShoppingFromApi(week, cloudFamily.id));
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
      await setFamilyShoppingItem(week, cloudFamily.id, ingredientName, checked);
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
    await createFamily(name);
    await loadCloudFamily();
  }, [familyNameDraft, loadCloudFamily]);

  const makeInviteCode = useCallback(async () => {
    const code = await createFamilyInvite();
    setFamilyInviteCode(code);
    return code;
  }, []);

  const joinFamilyCloud = useCallback(async () => {
    const code = (familyJoinCode || '').trim();
    if (!code) return;
    await joinFamily(code);
    setFamilyJoinCode('');
    await loadCloudFamily();
  }, [familyJoinCode, loadCloudFamily]);

  const updateMyFamilyGoal = useCallback(async (goal: 'LOSS' | 'MAINTAIN') => {
    await updateFamilyGoal(goal);
    await loadCloudFamily();
  }, [loadCloudFamily]);

  const generateFamilyMenuNow = useCallback(async () => {
    if (!cloudFamily?.id) return;
    const week = weekStartISO();
    await generateFamilyMenu(week);
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
