import { describe, expect, it } from 'vitest';
import { buildFamilyDayMenu, type FamilyRoster, type FamilyMealSelection } from '../domain/familyPlanning';
import { restoredDaySelections, previewDelivery, profileAckDraft, profileReadCanApply, profileSelectionsCanApply,
  legacySelectionRecovery, type DeliveryState } from '../features/familyPlanning/useFamilyPlanning';
import { defaultSelections, emptyDrafts, profileDraft } from '../features/familyPlanning/planningUiState';

const date = '2026-10-23';
const roster: FamilyRoster = { familyId: 'family', rosterVersion: 7, limit: 5,
  planningConstraints: { blockedIngredientIds: [], incomplete: false },
  profiles: ['alex', 'irina', 'denis'].map(id => ({ id, familyId: 'family', kind: 'managed',
    displayName: id, version: 2, active: true, canEdit: true })) };
const selected: FamilyMealSelection[] = [{ slot: 'lunch', recipeId: 'chicken-rice-v1',
  participantShares: { alex: 0.75, irina: 1, denis: 1.25 } }];
const menu = () => buildFamilyDayMenu({ date, rosterVersion: 7, selections: selected,
  profiles: roster.profiles.map(profile => ({ id: profile.id, version: profile.version,
    configuration: { displayName: profile.displayName, ageGroup: 'adult', portionShare: 1,
      allergies: { state: 'none', allergenIds: [] }, hardExcludedIngredientIds: [], dislikedIngredientIds: [] } })) });

describe('family day editor restoration and preview delivery', () => {
  it('rejects a delayed profile GET after typing, closing or changing family', async () => {
    const editor = profileDraft(null, 7);
    const sent = { familyId: 'family', revision: 1, editor };
    let current = sent;
    let finish!: () => void;
    const response = new Promise<void>(resolve => { finish = resolve; });
    const apply = response.then(() => profileReadCanApply(sent, current));
    current = { ...sent, revision: 2, editor: { ...editor, displayName: 'Новый ввод' } };
    finish(); expect(await apply).toBe(false);
    expect(profileReadCanApply(sent, { ...sent, revision: 2 })).toBe(false);
    expect(profileReadCanApply(sent, { ...sent, familyId: 'other' })).toBe(false);
    expect(profileReadCanApply(sent, sent)).toBe(true);
  });
  it('merges a delayed profile ACK version into newer typing without reopening a closed editor', () => {
    const sent = profileDraft(null, 7);
    const previous = { ...emptyDrafts(date), profile: { ...sent, displayName: 'Ещё правка' }, profileDirty: true, profileOpen: false };
    const accepted = { ...sent, id: 'managed:new', baseVersion: 3, baseRosterVersion: 8 };
    expect(profileAckDraft(previous, sent, accepted)).toMatchObject({ profile: { displayName: 'Ещё правка', id: 'managed:new', baseVersion: 3, baseRosterVersion: 8 }, profileDirty: true, profileOpen: false });
    const cancelled = { ...previous, profile: null };
    expect(profileAckDraft(cancelled, sent, accepted)).toBe(cancelled);
  });
  it('does not apply delayed profile portion defaults after explicit selection changes or date changes', async () => {
    let revision = 4;
    const sentRevision = revision;
    const ack = Promise.resolve().then(() => profileSelectionsCanApply(sentRevision, revision, date, date));
    revision += 1;
    expect(await ack).toBe(false);
    expect(profileSelectionsCanApply(4, 4, date, '2026-10-24')).toBe(false);
    expect(profileSelectionsCanApply(4, 4, date, date)).toBe(true);
  });
  it('keeps ambiguous legacy defaults separately while restoring the accepted day, including after reload', () => {
    const drafts = { ...emptyDrafts(date), selections: defaultSelections(roster) };
    const recovery = legacySelectionRecovery({ version: 1, familyId: 'family', drafts }, drafts);
    expect(recovery).toEqual({ familyId: 'family', date, selections: drafts.selections });
    expect(restoredDaySelections(menu(), date, roster)).toEqual(selected);
    expect(legacySelectionRecovery({ version: 1, familyId: 'family', selectionDraft: false, selectionRecovery: recovery }, drafts)).toEqual(recovery);
    expect(legacySelectionRecovery({ version: 1, familyId: 'family', selectionDraft: true }, drafts)).toBeNull();
    expect(legacySelectionRecovery({ version: 1, familyId: 'other', selectionDraft: false, selectionRecovery: recovery }, drafts)).toBeNull();
  });
  it('restores the accepted lunch, recipe and individual shares instead of three default meals', () => {
    const accepted = menu();
    expect(restoredDaySelections(accepted, date, roster)).toEqual(selected);
    const restored = restoredDaySelections(accepted, date, roster);
    restored[0].participantShares.alex = 1;
    expect(accepted.planningV1.meals[0].participantShares.alex).toBe(0.75);
  });
  it('does not use another date and initializes a genuinely empty day with defaults', () => {
    for (const value of [null, menu()]) {
      const restored = restoredDaySelections(value, '2026-10-24', roster);
      expect(restored.map(meal => meal.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
      expect(restored[0].participantShares).toEqual({ alex: 1, irina: 1, denis: 1 });
    }
  });
  it('preserves explicit unsaved selections including an empty selection against a late accepted read', () => {
    for (const userDraft of [[], [{ slot: 'dinner', participantShares: { alex: 1.25 } }]] as FamilyMealSelection[][]) {
      expect(restoredDaySelections(menu(), date, roster, userDraft)).toBe(userDraft);
    }
  });
  it('does not attribute an accepted version to a newer unsaved preview', () => {
    const accepted: DeliveryState = { kind: 'server', message: 'Ваши изменения сохранены на сервере.' };
    expect(previewDelivery(accepted, true)).toEqual({ kind: 'server',
      message: 'Предыдущая версия сохранена на сервере. Показанный предпросмотр ещё не сохранён — подтвердите его.' });
    expect(previewDelivery(accepted, false)).toBe(accepted);
    expect(previewDelivery({ kind: 'empty', message: '' }, true).message).toContain('ещё не сохранён');
  });
  it('keeps pending, conflict and failure evidence visible while a preview exists', () => {
    for (const kind of ['loading', 'local', 'sending', 'conflict', 'error'] as const) {
      const delivery: DeliveryState = { kind, message: 'Состояние сохранённого намерения' };
      expect(previewDelivery(delivery, true)).toBe(delivery);
    }
  });
});
