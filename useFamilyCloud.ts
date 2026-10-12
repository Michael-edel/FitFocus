import { useCallback, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { FamilyWeeklyMenu, UserProfile } from './types';
import { errorMessage } from './safeJson';
import type { OutboxReadGuard } from './storage/durableOutbox';
import { familyErrorMessage, type FamilySession } from './services/familySession';
import { SessionReadError } from './storage/sessionRead';
import { FamilyActionScope } from './features/family/actionScope';
import {
  createFamily, createFamilyInvite, generateFamilyMenu, joinFamily, loadFamilyContext,
  loadFamilyShopping as loadFamilyShoppingFromApi, setFamilyShoppingItem, updateFamilyGoal,
  type CloudFamily, type CloudFamilyMember, type FamilyShoppingState,
} from './features/family/familyApi';
export type { CloudFamily, CloudFamilyMember } from './features/family/familyApi';

const EMPTY_MEMBERS: CloudFamilyMember[] = [];
/** Returned setters retain their login and target, even when an old callback finishes after a render. */
function useFamilyState<T>(scope: FamilyActionScope, initial: T, key = ''): [T, Dispatch<SetStateAction<T>>] {
  const owner = useRef({ scope, key }); owner.current = { scope, key };
  const [state, setState] = useState({ scope, key, value: initial });
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(update => {
    const current = () => scope.isCurrent() && owner.current.scope === scope && owner.current.key === key;
    if (!current()) return;
    setState(previous => {
      if (!current()) return previous;
      const value = previous.scope === scope && previous.key === key ? previous.value : initial;
      return { scope, key, value: typeof update === 'function' ? (update as (value: T) => T)(value) : update };
    });
  }, [initial, key, scope]);
  return [state.scope === scope && state.key === key ? state.value : initial, setValue];
}

type UseFamilyCloudParams = {
  currentUser: UserProfile | null;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  planScope: 'personal' | 'family';
  setPlanScope: Dispatch<SetStateAction<'personal' | 'family'>>;
  weekStartISO: () => string;
  loadCloudFamilyOnDemand?: boolean;
};

export function useFamilyCloud({ currentUser, loginGuard, isCurrentSession, planScope, setPlanScope, weekStartISO }: UseFamilyCloudParams) {
  const scope = useMemo(() => new FamilyActionScope(() => Boolean(loginGuard && loginGuard.accountId === currentUser?.id && isCurrentSession())),
    [currentUser?.id, isCurrentSession, loginGuard]);
  const onShowRef = useRef(() => {});
  useLayoutEffect(() => {
    scope.activate();
    const hide = () => scope.invalidate();
    const show = (event: PageTransitionEvent) => { if (event.persisted) { scope.activate(); onShowRef.current(); } };
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => { scope.invalidate(); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); };
  }, [scope]);

  const [cloudFamily, setCloudFamily] = useFamilyState<CloudFamily | null>(scope, null);
  const [cloudFamilyMembers, setCloudFamilyMembers] = useFamilyState(scope, EMPTY_MEMBERS);
  const [cloudFamilyMenu, setCloudFamilyMenu] = useFamilyState<FamilyWeeklyMenu | null>(scope, null);
  const [cloudFamilyLoading, setCloudFamilyLoading] = useFamilyState(scope, false);
  const [cloudFamilyError, setCloudFamilyError] = useFamilyState<string | null>(scope, null);
  const [familyInviteCode, setFamilyInviteCode] = useFamilyState(scope, '');
  const [familyJoinCode, setFamilyJoinCode] = useFamilyState(scope, '');
  const [familyNameDraft, setFamilyNameDraft] = useFamilyState(scope, 'Моя семья');
  const [familyShopping, setFamilyShopping] = useFamilyState<FamilyShoppingState>(scope, null, cloudFamily?.id);
  const [familyShoppingLoading, setFamilyShoppingLoading] = useFamilyState(scope, false, cloudFamily?.id);
  onShowRef.current = () => { setCloudFamilyLoading(false); setFamilyShoppingLoading(false); };
  const familyIdRef = useRef(cloudFamily?.id); familyIdRef.current = cloudFamily?.id;
  const session = useCallback((attempt: NonNullable<ReturnType<FamilyActionScope['begin']>>, current = attempt.isCurrent): FamilySession => {
    if (!loginGuard) throw new SessionReadError('session');
    return { guard: Object.freeze({ ...loginGuard }), controller: attempt.controller, isCurrentSession: current };
  }, [loginGuard]);

  const loadCloudFamily = useCallback(async () => {
    const attempt = scope.begin('context'); if (!attempt) return;
    setCloudFamilyLoading(true); setCloudFamilyError(null);
    try {
      const context = await loadFamilyContext(weekStartISO(), session(attempt));
      if (!attempt.isCurrent()) return;
      setCloudFamily(context.family); setCloudFamilyMembers(context.members); setCloudFamilyMenu(context.menu);
      if (context.family && planScope !== 'family') setPlanScope('family');
    } catch (error) {
      if (attempt.isCurrent()) setCloudFamilyError(errorMessage(error, 'Не удалось загрузить семью.'));
    } finally { if (attempt.isCurrent()) setCloudFamilyLoading(false); attempt.finish(); }
  }, [planScope, scope, session, setCloudFamily, setCloudFamilyError, setCloudFamilyLoading, setCloudFamilyMembers, setCloudFamilyMenu, setPlanScope, weekStartISO]);

  const loadFamilyShopping = useCallback(async () => {
    const familyId = cloudFamily?.id; if (!familyId) return;
    const attempt = scope.begin('shopping'); if (!attempt) return;
    const current = () => attempt.isCurrent() && familyIdRef.current === familyId;
    setFamilyShoppingLoading(true);
    try {
      const result = await loadFamilyShoppingFromApi(weekStartISO(), familyId, session(attempt, current));
      if (current()) setFamilyShopping(result);
    } catch (error) { if (current()) setCloudFamilyError(errorMessage(error, 'Не удалось загрузить список покупок.')); }
    finally { if (current()) setFamilyShoppingLoading(false); attempt.finish(); }
  }, [cloudFamily?.id, scope, session, setCloudFamilyError, setFamilyShopping, setFamilyShoppingLoading, weekStartISO]);

  const toggleFamilyShoppingItem = useCallback(async (ingredientName: string, checked: boolean) => {
    const familyId = cloudFamily?.id; if (!familyId) return;
    const attempt = scope.begin(`check:${ingredientName}`); if (!attempt) throw new SessionReadError('session');
    const current = () => attempt.isCurrent() && familyIdRef.current === familyId;
    const previous = familyShopping?.items.find(item => item.name === ingredientName)?.checked ?? false;
    setFamilyShopping(value => value ? { ...value, items: value.items.map(item => item.name === ingredientName ? { ...item, checked } : item) } : value);
    try { await setFamilyShoppingItem(weekStartISO(), familyId, ingredientName, checked, session(attempt, current)); }
    catch (error) {
      if (current()) setFamilyShopping(value => value ? { ...value, items: value.items.map(item => item.name === ingredientName ? { ...item, checked: previous } : item) } : value);
      throw new Error(familyErrorMessage(error));
    } finally { attempt.finish(); }
  }, [cloudFamily?.id, familyShopping, scope, session, setFamilyShopping, weekStartISO]);

  const runMutation = useCallback(async <T,>(action: (binding: FamilySession, current: () => boolean) => Promise<T>) => {
    const attempt = scope.begin('mutation'); if (!attempt) throw new Error(familyErrorMessage(new SessionReadError('session')));
    try {
      const result = await action(session(attempt), attempt.isCurrent);
      if (!attempt.isCurrent()) throw new SessionReadError('session');
      return result;
    } catch (error) { throw new Error(familyErrorMessage(error)); } finally { attempt.finish(); }
  }, [scope, session]);
  const createFamilyCloud = useCallback(() => runMutation(async (binding, current) => {
    await createFamily((familyNameDraft || 'Моя семья').trim().slice(0, 60), binding);
    if (current()) await loadCloudFamily();
  }), [familyNameDraft, loadCloudFamily, runMutation]);
  const makeInviteCode = useCallback(() => runMutation(async (binding, current) => {
    const code = await createFamilyInvite(binding); if (current()) setFamilyInviteCode(code); return code;
  }), [runMutation, setFamilyInviteCode]);
  const joinFamilyCloud = useCallback(async () => {
    const code = familyJoinCode.trim(); if (!code) return;
    await runMutation(async (binding, current) => {
      await joinFamily(code, binding); if (!current()) return;
      setFamilyJoinCode(''); await loadCloudFamily();
    });
  }, [familyJoinCode, loadCloudFamily, runMutation, setFamilyJoinCode]);
  const updateMyFamilyGoal = useCallback((goal: 'LOSS' | 'MAINTAIN') => runMutation(async (binding, current) => {
    await updateFamilyGoal(goal, binding); if (current()) await loadCloudFamily();
  }), [loadCloudFamily, runMutation]);
  const generateFamilyMenuNow = useCallback(async () => {
    const familyId = cloudFamily?.id; if (!familyId) return;
    await runMutation(async (binding, current) => {
      binding.isCurrentSession = () => current() && familyIdRef.current === familyId;
      await generateFamilyMenu(weekStartISO(), binding);
      if (!binding.isCurrentSession()) throw new SessionReadError('session');
      await loadFamilyShopping(); if (binding.isCurrentSession()) await loadCloudFamily();
    });
  }, [cloudFamily?.id, loadCloudFamily, loadFamilyShopping, runMutation, weekStartISO]);

  return { cloudFamily, cloudFamilyMembers, cloudFamilyLoading, cloudFamilyMenu, cloudFamilyError,
    familyInviteCode, familyJoinCode, familyNameDraft, familyShopping, familyShoppingLoading,
    loadCloudFamily, loadFamilyShopping, makeInviteCode, createFamilyCloud, joinFamilyCloud, setCloudFamily,
    setCloudFamilyError, setCloudFamilyMembers, setCloudFamilyMenu, setFamilyInviteCode, setFamilyJoinCode,
    setFamilyNameDraft, setFamilyShopping, setFamilyShoppingLoading, toggleFamilyShoppingItem,
    updateMyFamilyGoal, generateFamilyMenuNow };
}
