import { expect, it, vi } from 'vitest';
import { generatePersonalWeeklyMenu } from '../features/ai/useWeeklyMenuGeneration';
import type { UserProfile, WeeklyMenu } from '../types';
import { DurableOutbox, type OutboxOperation } from '../storage/durableOutbox';
import type { AiSession } from '../services/aiSession';

const user = { id: 'menu-owner', name: 'Original', aiPlan: { title: 'Plan' } } as UserProfile;
const menu: WeeklyMenu = { days: [], shoppingList: [], shoppingListItems: [], weekStart: '2026-10-12' };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup() {
  let current = true, profileCurrent = true;
  const session: AiSession = { guard: { accountId: user.id, sessionEpoch: 'epoch', serverSessionId: 'a'.repeat(64), authFence: 1 },
    controller: new AbortController(), isCurrentSession: () => current, outbox: new DurableOutbox() };
  const input = {
    currentUser: user, isCurrentSession: () => current, canCommitProfile: () => profileCurrent, controller: session.controller,
    prepareSession: vi.fn().mockResolvedValue(session), requestMenu: vi.fn().mockResolvedValue(menu),
    persistUser: vi.fn().mockResolvedValue({ status: 'pending' } as OutboxOperation),
    storeItems: vi.fn().mockResolvedValue(undefined), checkAchievements: vi.fn(), setLoading: vi.fn(), setError: vi.fn(),
  };
  return { input, close: () => { current = false; session.controller.abort(); }, edit: () => { profileCurrent = false; } };
}

it('does not send AI, persist, or write items for a stale action', async () => {
  const { input, close } = setup(); close();
  expect(await generatePersonalWeeklyMenu(input)).toBeNull();
  for (const call of [input.prepareSession, input.requestMenu, input.persistUser, input.storeItems, input.checkAchievements, input.setLoading, input.setError]) {
    expect(call).not.toHaveBeenCalled();
  }
});

it.each(['success', 'failure'])('ignores delayed AI %s after the original login closes', async outcome => {
  const { input, close } = setup(); const request = deferred<WeeklyMenu>(); input.requestMenu.mockReturnValue(request.promise);
  const pending = generatePersonalWeeklyMenu(input); await vi.waitFor(() => expect(input.requestMenu).toHaveBeenCalledOnce());
  close(); if (outcome === 'success') request.resolve(menu); else request.reject(new Error('late failure'));
  expect(await pending).toBeNull();
  expect(input.persistUser).not.toHaveBeenCalled(); expect(input.storeItems).not.toHaveBeenCalled();
  expect(input.checkAchievements).not.toHaveBeenCalled();
  expect(input.setLoading.mock.calls).toEqual([[true]]); expect(input.setError.mock.calls).toEqual([[null]]);
});

it('does not replace a profile edited during generation', async () => {
  const { input, edit } = setup(); const request = deferred<WeeklyMenu>(); input.requestMenu.mockReturnValue(request.promise);
  const pending = generatePersonalWeeklyMenu(input); await vi.waitFor(() => expect(input.requestMenu).toHaveBeenCalledOnce());
  edit(); request.resolve(menu); expect(await pending).toBeNull();
  expect(input.persistUser).not.toHaveBeenCalled(); expect(input.storeItems).not.toHaveBeenCalled();
  expect(input.setError).toHaveBeenLastCalledWith(expect.stringContaining('Профиль изменился'));
});

it('waits for a durable commit before achievements and the secondary write', async () => {
  const { input } = setup(); const commit = deferred<OutboxOperation>(); input.persistUser.mockReturnValue(commit.promise);
  const pending = generatePersonalWeeklyMenu(input); await vi.waitFor(() => expect(input.persistUser).toHaveBeenCalledOnce());
  expect(input.checkAchievements).not.toHaveBeenCalled(); expect(input.storeItems).not.toHaveBeenCalled();
  commit.resolve({ status: 'pending' } as OutboxOperation);
  expect(await pending).toBe(menu); expect(input.storeItems).toHaveBeenCalledWith(menu, expect.anything());
  expect(input.checkAchievements).toHaveBeenCalledOnce();
});

it.each(['quota', 'conflicted', 'obsolete'])('sends no items or achievement after a %s commit', async kind => {
  const { input } = setup();
  if (kind === 'quota') input.persistUser.mockRejectedValue(new Error('quota'));
  else input.persistUser.mockResolvedValue(kind === 'obsolete' ? null : { status: 'conflicted' });
  expect(await generatePersonalWeeklyMenu(input)).toBeNull();
  expect(input.storeItems).not.toHaveBeenCalled(); expect(input.checkAchievements).not.toHaveBeenCalled();
});

it('keeps the committed menu and explains a secondary projection failure', async () => {
  const { input } = setup(); input.storeItems.mockRejectedValue(new Error('network'));
  expect(await generatePersonalWeeklyMenu(input)).toBe(menu);
  expect(input.setError).toHaveBeenLastCalledWith(expect.stringContaining('Меню сохранено'));
});
