import { buildFamilyDayMenu, type DiningProfileInput, type FamilyMealSelection, type FamilyRoster, type PortionShare } from '../../domain/familyPlanning';

export const confirmedConfiguration: DiningProfileInput = { displayName: 'E2E User', ageGroup: 'adult', portionShare: 1,
  allergies: { state: 'none', allergenIds: [] }, hardExcludedIngredientIds: [], dislikedIngredientIds: [] };
export function planningRoster(familyId: string, account: string, extra: Array<{ user_id: string; name?: string | null }> = []): FamilyRoster {
  return { familyId, rosterVersion: 1, limit: 5, planningConstraints: { blockedIngredientIds: [], incomplete: false },
    profiles: [{ id: account, familyId, kind: 'account', displayName: 'E2E User', active: true, version: 1, canEdit: true },
      ...extra.map(member => ({ id: member.user_id, familyId, kind: 'account' as const, displayName: member.name ?? member.user_id,
        active: true, version: 1, canEdit: false }))] };
}
export function planningDay(account: string, date: string, share: PortionShare = 1, selections?: FamilyMealSelection[], extra: Array<{ user_id: string; name?: string | null }> = []) {
  const profiles = [account, ...extra.map(member => member.user_id)].map(id => ({ id, version: 1, configuration: { ...confirmedConfiguration } }));
  return buildFamilyDayMenu({ date, rosterVersion: 1, profiles, selections: selections ?? [{ slot: 'breakfast',
    recipeId: 'oats-milk-apple-v1', participantShares: Object.fromEntries(profiles.map(profile => [profile.id, share])) }] });
}
