import { useCallback, useLayoutEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { FamilyWeeklyMenu, UserProfile } from './types';
import { useOwnedState } from './features/state/useOwnedState';
import type { StateCodec } from './storage/stateEditor';
import { errorMessage, isRecord, parseJson } from './safeJson';
import type { CloudFamily, CloudFamilyMember, FamilyShoppingState } from './features/family/familyApi';
import { FamilyActionScope } from './features/family/actionScope';
import { useFamilyState } from './features/family/useFamilyState';
import { familyProfiles } from './features/family/familyProfiles';
import { generateOwnedFamilyMenu } from './features/family/familyMenuGeneration';
import { familyShoppingProjection } from './features/family/shoppingProjection';
import type { FamilyMenuRepository } from './storage/familyMenuRepository';
import type { OutboxReadGuard } from './storage/durableOutbox';
import { SessionReadError } from './storage/sessionRead';
import type { useProfilePersistence } from './features/profile/useProfilePersistence';
import type { AiSession } from './services/aiSession';

import type { FamilyMenuPrefs } from './storage/stateTypes';
export type { FamilyMenuPrefs } from './storage/stateTypes';

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

const familyPrefsCodec: StateCodec<FamilyMenuPrefs> = {
  decode: (raw, fallback) => readFamilyMenuPrefs(raw, fallback.includeIds), encode: JSON.stringify,
};

function isStaleFamilyMenuSessionError(error: unknown): boolean {
  return error instanceof SessionReadError && (error.kind === 'session' || error.kind === 'auth')
    || error instanceof Error && error.message === 'LOGIN_SESSION_CHANGED';
}

type UseFamilyMenuParams = {
  cloudFamily: CloudFamily | null; cloudFamilyMembers: CloudFamilyMember[];
  cloudFamilyMenu: FamilyWeeklyMenu | null; currentUser: UserProfile | null;
  generateFamilyWeeklyMenu: (user: UserProfile, users: UserProfile[], prefs: import('./types').FamilyMenuPrefs, session: AiSession) => Promise<FamilyWeeklyMenu>;
  familyMenuRepository: FamilyMenuRepository | null;
  loginGuard: OutboxReadGuard | null; isCurrentSession: () => boolean;
  profileEditRevisionRef: MutableRefObject<number>;
  persistUser: ReturnType<typeof useProfilePersistence>;
  setCloudFamilyMenu: Dispatch<SetStateAction<FamilyWeeklyMenu | null>>;
  setFamilyShopping: Dispatch<SetStateAction<FamilyShoppingState>>;
  weekStartISO: () => string;
};

export function useFamilyMenu({ cloudFamily, cloudFamilyMembers, cloudFamilyMenu, currentUser,
  generateFamilyWeeklyMenu, familyMenuRepository, loginGuard, isCurrentSession, profileEditRevisionRef,
  persistUser, setCloudFamilyMenu, setFamilyShopping, weekStartISO }: UseFamilyMenuParams) {
  const scope = useMemo(() => new FamilyActionScope(() => Boolean(loginGuard && loginGuard.accountId === currentUser?.id && isCurrentSession())),
    [currentUser?.id, cloudFamily?.id, isCurrentSession, loginGuard]);
  const [familyMenuLoading, setFamilyMenuLoading] = useFamilyState(scope, false);
  const [familyMenuError, setFamilyMenuError] = useFamilyState<string | null>(scope, null);
  const [familyMenuPrefsOpen, setFamilyMenuPrefsOpen] = useFamilyState(scope, false);
  useLayoutEffect(() => {
    scope.activate();
    const hide = () => scope.invalidate();
    const show = (event: PageTransitionEvent) => { if (event.persisted) { scope.activate(); setFamilyMenuLoading(false); } };
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => { scope.invalidate(); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); };
  }, [scope, setFamilyMenuLoading]);
  const familyMenuProfiles = useMemo(() => currentUser ? familyProfiles(currentUser, cloudFamily ? cloudFamilyMembers : null) : [],
    [currentUser, cloudFamily, cloudFamilyMembers]);
  const preferences = useOwnedState(currentUser?.id, 'family_menu_prefs', {
    ...DEFAULT_FAMILY_MENU_PREFS, includeIds: familyMenuProfiles.map(profile => profile.id),
  }, familyPrefsCodec);
  const allowed = new Set(familyMenuProfiles.map(profile => profile.id));
  const selected = preferences.value.includeIds.filter(id => allowed.has(id));
  const familyMenuPrefs = { ...preferences.value, includeIds: selected.length ? selected : [...allowed] };
  const inputKey = JSON.stringify({ familyId: cloudFamily?.id, profiles: familyMenuProfiles, prefs: familyMenuPrefs });
  const inputsRef = useRef(inputKey); inputsRef.current = inputKey;
  const setFamilyMenuPrefs = useCallback<Dispatch<SetStateAction<FamilyMenuPrefs>>>(action => {
    if (!loginGuard || !scope.isCurrent()) return;
    void preferences.persistGenerated(action, { readGuard: loginGuard, canCommit: () => scope.isCurrent() }).catch(() => {});
  }, [loginGuard, preferences.persistGenerated, scope]);
  // An empty canonical family generation never resurrects an old personal profile snapshot.
  const familyMenu = cloudFamily ? cloudFamilyMenu : currentUser?.aiPlan?.familyWeeklyMenu ?? null;
  const handleGenerateFamilyWeeklyMenu = useCallback(async () => {
    if (!currentUser?.aiPlan || !loginGuard) return null;
    const attempt = scope.begin('generate'); if (!attempt) return null;
    setFamilyMenuError(null); setFamilyMenuLoading(true);
    const revision = profileEditRevisionRef.current, week = weekStartISO();
    try {
      if (cloudFamily && cloudFamily.owner_user_id !== currentUser.id) throw new Error('Только владелец семьи может менять общее меню.');
      if (cloudFamily && !familyMenuRepository) throw new Error('Сначала обновите семейное меню.');
      const menu = await generateOwnedFamilyMenu({ owner: currentUser, profiles: familyMenuProfiles,
        prefs: { includeIds: familyMenuPrefs.includeIds, cookingMode: familyMenuPrefs.cookingMode,
          ...(familyMenuPrefs.budgetPerWeek ? { budgetPerWeek: Number(familyMenuPrefs.budgetPerWeek) } : {}), currency: familyMenuPrefs.currency },
        week, loginGuard, controller: attempt.controller, isCurrent: attempt.isCurrent,
        inputsCurrent: () => inputsRef.current === inputKey && revision === profileEditRevisionRef.current && weekStartISO() === week,
        repository: cloudFamily ? familyMenuRepository : null, persistUser,
        persistPreferences: guard => preferences.persistGenerated(familyMenuPrefs, guard), requestMenu: generateFamilyWeeklyMenu,
      });
      if (!menu || !attempt.isCurrent()) return null;
      if (cloudFamily) {
        setCloudFamilyMenu(menu);
        setFamilyShopping(previous => familyShoppingProjection(week, menu, previous));
      }
      return menu;
    } catch (error) {
      if (attempt.isCurrent() && !isStaleFamilyMenuSessionError(error)) {
        setFamilyMenuError(errorMessage(error, 'Не удалось сгенерировать семейное меню на неделю.'));
      }
      return null;
    } finally { if (attempt.isCurrent()) setFamilyMenuLoading(false); attempt.finish(); }
  }, [cloudFamily, currentUser, loginGuard, scope, profileEditRevisionRef, weekStartISO, familyMenuRepository,
    familyMenuProfiles, familyMenuPrefs, inputKey, persistUser, preferences.persistGenerated, generateFamilyWeeklyMenu,
    setFamilyMenuError, setFamilyMenuLoading, setCloudFamilyMenu, setFamilyShopping]);

  return { familyMenu, familyMenuError, familyMenuLoading, familyMenuPrefs, familyMenuPrefsOpen, familyMenuProfiles,
    handleGenerateFamilyWeeklyMenu, setFamilyMenuError, setFamilyMenuPrefs, setFamilyMenuPrefsOpen };
}
