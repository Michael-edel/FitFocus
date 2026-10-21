import type { FamilyWeeklyMenu, FamilyMenuPrefs, UserProfile } from '../../types';
import type { OutboxCommitGuard, OutboxOperation, OutboxReadGuard } from '../../storage/durableOutbox';
import type { FamilyMenuRepository } from '../../storage/familyMenuRepository';
import { prepareAiSession, type AiSession } from '../../services/aiSession';
import type { useProfilePersistence } from '../profile/useProfilePersistence';
import { isFamilyMenuPayload } from '../../familyMenuValidation';
import { usableFamilyProfile } from './familyProfiles';

export async function generateOwnedFamilyMenu(input: {
  owner: UserProfile; profiles: UserProfile[]; prefs: FamilyMenuPrefs; week: string;
  loginGuard: OutboxReadGuard; controller: AbortController; isCurrent: () => boolean; inputsCurrent: () => boolean;
  repository: FamilyMenuRepository | null; persistUser: ReturnType<typeof useProfilePersistence>;
  persistPreferences: (guard: OutboxCommitGuard) => Promise<OutboxOperation | null>;
  requestMenu: (owner: UserProfile, profiles: UserProfile[], prefs: FamilyMenuPrefs, session: AiSession) => Promise<FamilyWeeklyMenu>;
  prepareSession?: typeof prepareAiSession;
}): Promise<FamilyWeeklyMenu | null> {
  const current = () => !input.controller.signal.aborted && input.isCurrent();
  const unchanged = () => current() && input.inputsCurrent();
  if (!current()) return null;
  if (!input.prefs.includeIds.length || new Set(input.prefs.includeIds).size !== input.prefs.includeIds.length
    || input.prefs.includeIds.some(id => !input.profiles.some(profile => profile.id === id && usableFamilyProfile(profile)))) {
    throw new Error('Заполните данные выбранных участников семьи: пол, возраст, рост, вес и цель.');
  }
  // Capture the displayed revision before any remote work, without adopting a newer base later.
  const observed = input.repository?.capture();
  const session = await (input.prepareSession ?? prepareAiSession)(input.owner.id, input.controller, current,
    { previous: input.loginGuard, requireFamilyMenu: !!input.repository, requireMenuProjection: !input.repository });
  if (!current()) return null;
  if (!unchanged()) throw new Error('Данные семьи изменились. Повторите генерацию.');
  const guard = { readGuard: session.guard, canCommit: unchanged };
  const preferences = await input.persistPreferences(guard);
  if (!current()) return null;
  if (!preferences || preferences.status !== 'pending') throw new Error('Настройки семьи не сохранены. Проверьте сообщение о хранилище.');
  const candidate = await input.requestMenu(input.owner, input.profiles, input.prefs, session);
  if (!current()) return null;
  if (!unchanged()) throw new Error('Данные семьи изменились. Повторите генерацию.');
  const menu = { ...candidate, weekStart: input.week, prefs: input.prefs };
  if (!isFamilyMenuPayload(menu, input.week)) throw new Error('Получено неполное семейное меню. Повторите генерацию.');
  const operation = input.repository && observed ? await input.repository.commit(menu, observed, guard)
    : await input.persistUser(previous => {
      if (!previous.aiPlan) throw new Error('Профиль изменился. Повторите генерацию.');
      return { ...previous, aiPlan: { ...previous.aiPlan, familyWeeklyMenu: menu } };
    }, guard);
  if (!current()) return null;
  if (!operation || operation.status !== 'pending') throw new Error('Меню не сохранено. Проверьте конфликт или ошибку хранилища.');
  return menu;
}
