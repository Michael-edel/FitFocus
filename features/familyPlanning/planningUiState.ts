import type { UserProfile } from '../../types';
import { isRecord } from '../../safeJson';
import { isDiningProfileInput, type DiningPrivateProfile, type DiningProfileInput, type FamilyMealSelection,
  type FamilyRoster, type PortionShare } from '../../domain/familyPlanning';

export type PlanningView = 'today' | 'menu' | 'shopping';
export type ProfileDraft = {
  id: string | null; baseVersion: number; baseRosterVersion: number;
  displayName: string; ageGroup: '' | 'adult' | 'child'; portionShare: PortionShare;
  goalContext: '' | 'LOSS' | 'MAINTAIN' | 'GAIN';
  allergyState: 'unknown' | 'none' | 'list'; allergenIds: string[];
  hardExcludedIngredientIds: string[]; dislikedIngredientIds: string[];
};
export type PlanningDrafts = {
  familyName: string; joinCode: string; date: string;
  profile: ProfileDraft | null; profileOpen: boolean; profileDirty: boolean;
  selections: FamilyMealSelection[]; selectionDate: string;
  manualName: string; manualUnit: 'g' | 'ml' | 'piece'; manualQuantity: string;
};

export function localDateISO(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function emptyDrafts(date = localDateISO()): PlanningDrafts {
  return { familyName: 'Моя семья', joinCode: '', date, profile: null, profileOpen: false, profileDirty: false,
    selections: [], selectionDate: date, manualName: '', manualUnit: 'g', manualQuantity: '' };
}
export function profileDraft(profile: DiningPrivateProfile | null, rosterVersion: number, self?: UserProfile): ProfileDraft {
  const configuration = profile?.configuration;
  const knownAge = self && Number.isFinite(self.age) && self.age > 0 ? (self.age < 18 ? 'child' : 'adult') : '';
  const ageGroup = configuration?.ageGroup ?? knownAge;
  return {
    id: profile?.id ?? null, baseVersion: profile?.version ?? 0, baseRosterVersion: rosterVersion,
    displayName: configuration?.displayName ?? self?.name ?? profile?.displayName ?? '',
    ageGroup, portionShare: configuration?.portionShare ?? 1,
    goalContext: ageGroup === 'adult' ? (configuration?.ageGroup === 'adult' ? configuration.goalContext ?? ''
      : self && ['LOSS', 'MAINTAIN', 'GAIN'].includes(self.goal) ? self.goal : '') : '',
    allergyState: configuration?.allergies.state ?? 'unknown', allergenIds: configuration?.allergies.allergenIds ?? [],
    hardExcludedIngredientIds: configuration?.hardExcludedIngredientIds ?? [],
    dislikedIngredientIds: configuration?.dislikedIngredientIds ?? [],
  };
}
export function profileInput(draft: ProfileDraft): DiningProfileInput | null {
  if (!draft.ageGroup) return null;
  const input = { displayName: draft.displayName.trim(), ageGroup: draft.ageGroup, portionShare: draft.portionShare,
    allergies: { state: draft.allergyState, allergenIds: draft.allergyState === 'list' ? draft.allergenIds : [] },
    hardExcludedIngredientIds: draft.hardExcludedIngredientIds, dislikedIngredientIds: draft.dislikedIngredientIds,
    ...(draft.ageGroup === 'adult' && draft.goalContext ? { goalContext: draft.goalContext } : {}) };
  return isDiningProfileInput(input) ? input : null;
}
export function profileErrors(draft: ProfileDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.displayName.trim() || draft.displayName.trim().length > 80) errors.displayName = 'Укажите имя от 1 до 80 символов.';
  if (!draft.ageGroup) errors.ageGroup = 'Выберите: взрослый или ребёнок.';
  if (draft.allergyState === 'list' && !draft.allergenIds.length) errors.allergies = 'Выберите хотя бы один аллерген.';
  if (!Object.keys(errors).length && !profileInput(draft)) errors.form = 'Проверьте имя и выбранные ограничения.';
  return errors;
}
export function defaultSelections(roster: FamilyRoster): FamilyMealSelection[] {
  const participantShares = Object.fromEntries(roster.profiles.filter(profile => profile.active).map(profile => [profile.id, 1 as PortionShare]));
  return (['breakfast', 'lunch', 'dinner'] as const).map(slot => ({ slot, participantShares: { ...participantShares } }));
}
export function readDraftCache(raw: string | null, fallback: PlanningDrafts): PlanningDrafts {
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.drafts)) return fallback;
    const draft = parsed.drafts;
    if (typeof draft.date !== 'string' || !validDate(draft.date)) return fallback;
    // Private fields are read only from the account/session scoped cache after the IDB guard.
    const p = draft.profile;
    const profile = isRecord(p) && (p.id === null || typeof p.id === 'string')
      && Number.isSafeInteger(p.baseVersion) && Number.isSafeInteger(p.baseRosterVersion)
      && typeof p.displayName === 'string' && ['', 'adult', 'child'].includes(String(p.ageGroup))
      && [0.75, 1, 1.25].includes(Number(p.portionShare))
      && ['', 'LOSS', 'MAINTAIN', 'GAIN'].includes(String(p.goalContext))
      && ['unknown', 'none', 'list'].includes(String(p.allergyState))
      && ['allergenIds', 'hardExcludedIngredientIds', 'dislikedIngredientIds'].every(key => Array.isArray(p[key]) && (p[key] as unknown[]).every(id => typeof id === 'string'))
      ? p as unknown as ProfileDraft : null;
    if (profile?.ageGroup === 'child') profile.goalContext = '';
    const selections = Array.isArray(draft.selections) ? draft.selections.filter(value => isRecord(value)
      && ['breakfast', 'lunch', 'dinner', 'snack'].includes(String(value.slot))
      && (value.recipeId === undefined || typeof value.recipeId === 'string') && isRecord(value.participantShares)
      && Object.values(value.participantShares).every(share => [0.75, 1, 1.25].includes(Number(share)))) as FamilyMealSelection[] : [];
    return { ...fallback, date: draft.date, familyName: typeof draft.familyName === 'string' ? draft.familyName.slice(0, 60) : fallback.familyName,
      joinCode: typeof draft.joinCode === 'string' ? draft.joinCode.slice(0, 100) : '', profile, profileOpen: !!profile && draft.profileOpen === true,
      profileDirty: !!profile && draft.profileDirty === true,
      selections, selectionDate: typeof draft.selectionDate === 'string' ? draft.selectionDate : draft.date,
      manualName: typeof draft.manualName === 'string' ? draft.manualName.slice(0, 120) : '',
      manualUnit: ['g', 'ml', 'piece'].includes(String(draft.manualUnit)) ? draft.manualUnit as PlanningDrafts['manualUnit'] : 'g',
      manualQuantity: typeof draft.manualQuantity === 'string' ? draft.manualQuantity : '' };
  } catch { return fallback; }
}

export const MEAL_LABELS = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' } as const;
export const UNIT_LABELS = { g: 'г', ml: 'мл', piece: 'шт.' } as const;
export const prettyQuantity = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

export const PUBLIC_ERRORS: Record<string, string> = {
  PROFILE_INCOMPLETE: 'Уточните и сохраните профили участников. Новый профиль ещё не заполнен.',
  ALLERGIES_UNKNOWN: 'У выбранных участников ещё не уточнены аллергии. Откройте доступные вам профили.',
  NO_SAFE_RECIPE: 'В каталоге нет блюда с учётом этих строгих ограничений. Меню не изменено.',
  UNKNOWN_CATALOG_ID: 'Не удалось проверить продукт или аллерген. Обновите данные.',
  BAD_SELECTION: 'Выберите хотя бы один приём пищи и участника для каждого приёма.',
  FAMILY_LIMIT_REACHED: 'В семье уже 5 человек, включая организатора. Черновик сохранён.',
  FAMILY_FULL: 'В семье уже 5 человек, включая организатора. Черновик сохранён.',
  CONFLICT: 'Данные изменились в другом сеансе. Ваш черновик сохранён; обновите данные и сравните версии.',
  FAMILY_PLANNING_STATE_REQUIRED: 'Этот список относится к новому меню. Обновите приложение.',
};
