import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FamilyProfileEditor } from '../features/familyPlanning/FamilyProfileEditor';
import { FamilyRosterPanel } from '../features/familyPlanning/FamilyRosterPanel';
import type { FamilyPlanningController } from '../features/familyPlanning/useFamilyPlanning';
import { emptyDrafts, profileDraft, profileErrors, profileInput, readDraftCache, validDate } from '../features/familyPlanning/planningUiState';
import type { DiningPrivateProfile, FamilyRoster } from '../domain/familyPlanning';
import type { UserProfile } from '../types';

const unconfigured: DiningPrivateProfile = { id: 'self', familyId: 'family', kind: 'account', displayName: 'Ирина', version: 1,
  active: true, canEdit: true, configuration: null };
const privateDraft = () => ({ ...profileDraft(unconfigured, 1), displayName: 'Ирина' });
const controller = (overrides: Partial<FamilyPlanningController>): FamilyPlanningController => ({
  drafts: emptyDrafts('2026-10-23'), fieldErrors: {}, busy: null, closeProfile() {}, patchProfile() {}, saveProfile: async () => true,
  ...overrides,
} as FamilyPlanningController);

describe('family planning forms and draft boundaries', () => {
  it('does not invent adult age or no-allergy configuration for a new account', () => {
    const draft = privateDraft();
    expect(draft.ageGroup).toBe(''); expect(draft.allergyState).toBe('unknown');
    expect(profileInput(draft)).toBeNull(); expect(profileErrors(draft).ageGroup).toBeTruthy();
    expect(unconfigured.configuration).toBeNull();
  });
  it('known self values prefill only a draft and leave allergy unknown until explicit choice', () => {
    const draft = profileDraft(unconfigured, 4, { id: 'self', name: 'Ирина', age: 34, goal: 'MAINTAIN' } as UserProfile);
    expect(draft).toMatchObject({ ageGroup: 'adult', goalContext: 'MAINTAIN', allergyState: 'unknown', baseVersion: 1, baseRosterVersion: 4 });
    expect(unconfigured.configuration).toBeNull();
  });
  it('strips adult context from a child payload while preserving manual share and strict versus soft lists', () => {
    const draft = { ...privateDraft(), ageGroup: 'child' as const, goalContext: 'LOSS' as const, portionShare: 0.75 as const,
      allergyState: 'none' as const, hardExcludedIngredientIds: ['milk'], dislikedIngredientIds: ['carrot'] };
    const input = profileInput(draft);
    expect(input).toMatchObject({ ageGroup: 'child', portionShare: 0.75, hardExcludedIngredientIds: ['milk'], dislikedIngredientIds: ['carrot'] });
    expect(input).not.toHaveProperty('goalContext');
  });
  it('requires a nonempty allergen list and keeps the user draft after validation fails', () => {
    const draft = { ...privateDraft(), ageGroup: 'adult' as const, allergyState: 'list' as const, goalContext: 'GAIN' as const };
    expect(profileErrors(draft).allergies).toBeTruthy(); expect(profileInput(draft)).toBeNull();
    expect(draft.displayName).toBe('Ирина'); expect(draft.goalContext).toBe('GAIN');
  });
  it('restores an unfinished scoped draft on reload without converting unknown into none', () => {
    const drafts = { ...emptyDrafts('2026-10-23'), profile: privateDraft(), profileOpen: true, manualName: 'Бумажные полотенца', manualUnit: 'piece' as const, manualQuantity: '2' };
    const restored = readDraftCache(JSON.stringify({ version: 1, drafts }), emptyDrafts());
    expect(restored).toEqual(drafts); expect(restored.profile?.allergyState).toBe('unknown');
    expect(readDraftCache('{broken', drafts)).toBe(drafts);
  });
  it('preserves the exact selected day and rejects calendar rollover dates', () => {
    expect(validDate('2026-10-23')).toBe(true); expect(validDate('2026-02-30')).toBe(false);
    expect(readDraftCache(JSON.stringify({ version: 1, drafts: emptyDrafts('2026-10-23') }), emptyDrafts()).date).toBe('2026-10-23');
  });
  it('renders real adult goal selection without weight or calorie fields, and no goal control for child', () => {
    const adult = { ...privateDraft(), ageGroup: 'adult' as const, goalContext: 'GAIN' as const };
    const render = (profile: typeof adult | ReturnType<typeof privateDraft>) => renderToStaticMarkup(<FamilyProfileEditor controller={controller({ drafts: { ...emptyDrafts(), profile, profileOpen: true } })} />);
    const adultMarkup = render(adult);
    expect(adultMarkup).toContain('id="fp-goal-context"'); expect(adultMarkup).toContain('value="GAIN" selected');
    expect(adultMarkup).not.toMatch(/type="number"|name="weight"|name="height"/);
    const childMarkup = render({ ...adult, ageGroup: 'child' });
    expect(childMarkup).not.toContain('id="fp-goal-context"'); expect(childMarkup).toContain('Ручная доля');
  });
  it('does not expose another account private configuration through the shared roster', () => {
    const roster: FamilyRoster = { familyId: 'family', rosterVersion: 2, limit: 5,
      planningConstraints: { blockedIngredientIds: ['milk'], incomplete: false },
      profiles: [{ id: 'other', familyId: 'family', kind: 'account', displayName: 'Денис', active: true, version: 2, canEdit: false }] };
    const markup = renderToStaticMarkup(<FamilyRosterPanel controller={controller({ family: { id: 'family', name: 'Семья', owner_user_id: 'self' }, roster, owner: true,
      refresh: async () => true, editProfile: async () => true, invite: async () => true, profileNotice: '', inviteCode: '' })} />);
    expect(markup).toContain('Денис'); expect(markup).toContain('Настраивает сам участник');
    expect(markup).not.toContain('LOSS'); expect(markup).not.toContain('milk'); expect(markup).not.toContain('Настроить профиль');
  });
});
