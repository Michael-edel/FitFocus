import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StateDatabase } from '../storage/stateDatabase';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { FamilyMenuRepository } from '../storage/familyMenuRepository';
import { StateSync } from '../storage/stateSync';
import { generateOwnedFamilyMenu } from '../features/family/familyMenuGeneration';
import { familyProfiles } from '../features/family/familyProfiles';
import { familyShoppingProjection } from '../features/family/shoppingProjection';
import { prepareAiSession } from '../services/aiSession';
import { familyTestMenu, familyTestProfile, familyWeek } from './_helpers/familyMenu';

const account = 'family-account', target = { familyId: 'family-a', weekStart: familyWeek }, sid = 'a'.repeat(64);
let db: StateDatabase, outbox: DurableOutbox, guard: OutboxReadGuard, repository: FamilyMenuRepository;
const clients: StateSync[] = [];
beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(db);
  guard = (await outbox.acceptReadSession(account, sid, 0))!;
  repository = new FamilyMenuRepository(account, target, { outbox, writerId: 'family-editor' }); await repository.observe();
});
afterEach(() => { clients.splice(0).forEach(client => client.stop()); db.close(); vi.restoreAllMocks(); });
const commit = (grams = 400) => repository.commit(familyTestMenu(account, grams), repository.capture(), { readGuard: guard, canCommit: () => true });
const me = () => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, familyMenuSync: { protocol: 1, guard: 1, cas: 1 },
});
const headers = { 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid,
  'X-FitFocus-Family-Menu-Protocol': '1', 'X-FitFocus-Family-Menu-Guard': '1' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const sync = (mutation: typeof fetch) => {
  const fetchImpl = vi.fn<typeof fetch>((url, init) => String(url) === '/api/me' ? Promise.resolve(json(me())) : mutation(url, init));
  const client = new StateSync({ outbox, fetchImpl, legacyPending: () => false }); clients.push(client); return { client, fetchImpl };
};

it('persists the same family intent and menu across a new repository without creating another queue', async () => {
  const operation = await commit();
  const restored = new FamilyMenuRepository(account, target, { outbox });
  expect((await restored.observe()).menu).toEqual(familyTestMenu(account));
  expect(await outbox.list(account)).toMatchObject([{ opId: operation.opId, resource: 'familyMenu', status: 'pending' }]);
  expect(Array.from((await db.open()).objectStoreNames)).toHaveLength(5);
});
it('retains a stale independent edit as a conflict and preserves the accepted local working value', async () => {
  const stale = new FamilyMenuRepository(account, target, { outbox }); await stale.observe(); const before = stale.capture();
  await commit(400);
  const conflict = await stale.commit(familyTestMenu(account, 999), before, { readGuard: guard, canCommit: () => true });
  expect(conflict.status).toBe('conflicted'); expect(JSON.parse(conflict.type === 'put' ? conflict.value : '{}').menu.shoppingListItems[0].grams).toBe(999);
  expect((await repository.observe()).menu?.shoppingListItems?.[0].grams).toBe(400);
});
it('does not let a server refresh replace a pending family intent', async () => {
  const before = repository.capture(); await commit(400);
  const refreshed = await repository.refresh({ ...target, version: 2, menu: familyTestMenu(account, 999) }, guard, before);
  expect(refreshed.menu?.shoppingListItems?.[0].grams).toBe(400);
});
it('delivers causal family edits through the existing claim/finish sender with their own confirmed bases', async () => {
  await commit(400); await commit(500);
  const bases: number[] = [];
  const { client, fetchImpl } = sync(async (url, init) => {
    expect(String(url)).toBe('/api/family/menu/state'); expect(init?.method).toBe('PUT');
    const body = JSON.parse(String(init?.body)); bases.push(body.baseVersion);
    return json({ ok: true, snapshot: { ...target, version: body.baseVersion + 1, menu: body.menu } });
  });
  await client.connect(account); await client.flush();
  expect(bases).toEqual([0, 1]); expect(await outbox.list(account)).toEqual([]);
  expect((await outbox.snapshot(account, repository.key)).confirmedVersion).toBe(2);
  expect(fetchImpl.mock.calls.some(([url]) => String(url) === '/api/state')).toBe(false);
});
it('retains a server conflict and its snapshot after a new repository is opened', async () => {
  await commit(400);
  const { client } = sync(async () => json({ error: 'VERSION_CONFLICT', snapshot: { ...target, version: 7, menu: familyTestMenu(account, 999) } }, 409));
  await client.connect(account); await client.flush();
  expect((await outbox.list(account))[0]).toMatchObject({ status: 'conflicted', serverSnapshot: { version: 7 } });
  const restored = new FamilyMenuRepository(account, target, { outbox });
  expect((await restored.observe()).menu?.shoppingListItems?.[0].grams).toBe(400);
});
it('rejects an acknowledgement for another family without deleting the pending operation', async () => {
  await commit();
  const { client } = sync(async () => json({ snapshot: { ...target, familyId: 'wrong-family', version: 1, menu: familyTestMenu(account) } }));
  await client.connect(account); await client.flush();
  expect((await outbox.list(account))[0].status).toBe('pending');
  expect((await outbox.sessionState()).active?.pause).toBe('protocol');
});
it('rejects a family commit after another login of the same account', async () => {
  await outbox.invalidateSessions(); await outbox.acceptReadSession(account, 'b'.repeat(64), (await outbox.sessionState()).fence);
  await expect(commit()).rejects.toMatchObject({ kind: 'transaction', cause: { message: 'OUTBOX_WRITE_SESSION_CHANGED' } });
  expect(await outbox.list(account)).toEqual([]);
});
it('does not adopt the new IDB session when the AI action supplied its original login guard', async () => {
  await outbox.invalidateSessions(); await outbox.acceptReadSession(account, 'b'.repeat(64), (await outbox.sessionState()).fence);
  const fetchImpl = vi.fn<typeof fetch>();
  await expect(prepareAiSession(account, new AbortController(), () => true, { outbox, previous: guard, fetchImpl })).rejects.toThrow('LOGIN_SESSION_CHANGED');
  expect(fetchImpl).not.toHaveBeenCalled();
});

function generation() {
  let current = true, inputsCurrent = true;
  const owner = { ...familyTestProfile(account), aiPlan: { title: 'Plan' } } as ReturnType<typeof familyTestProfile>;
  const controller = new AbortController();
  const input = { owner, profiles: [owner], prefs: familyTestMenu(account).prefs, week: familyWeek, repository, loginGuard: guard,
    controller, isCurrent: () => current, inputsCurrent: () => inputsCurrent,
    prepareSession: vi.fn().mockResolvedValue({ guard, controller, outbox, isCurrentSession: () => current }),
    persistPreferences: vi.fn().mockResolvedValue({ status: 'pending' }), persistUser: vi.fn(), requestMenu: vi.fn().mockResolvedValue(familyTestMenu(account)),
  };
  return { input, close: () => { current = false; controller.abort(); }, change: () => { inputsCurrent = false; } };
}
it('commits an AI family menu once and keeps the original login guard for proof', async () => {
  const { input } = generation(); expect(await generateOwnedFamilyMenu(input)).toEqual(familyTestMenu(account));
  expect(input.prepareSession).toHaveBeenCalledWith(account, input.controller, expect.any(Function), expect.objectContaining({ previous: guard, requireFamilyMenu: true }));
  expect(input.persistUser).not.toHaveBeenCalled(); expect(await outbox.list(account)).toHaveLength(1);
});
it.each(['success', 'failure'])('ignores delayed AI %s after the action ends', async outcome => {
  const { input, close } = generation(); let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  input.requestMenu.mockReturnValue(new Promise((yes, no) => { resolve = yes; reject = no; }));
  const pending = generateOwnedFamilyMenu(input); await vi.waitFor(() => expect(input.requestMenu).toHaveBeenCalled()); close();
  if (outcome === 'success') resolve(familyTestMenu(account)); else reject(new Error('late failure'));
  if (outcome === 'success') expect(await pending).toBeNull(); else await expect(pending).rejects.toThrow('late failure');
  expect(await outbox.list(account)).toEqual([]);
});
it('refuses a generated candidate after family inputs change during AI', async () => {
  const { input, change } = generation(); input.requestMenu.mockImplementation(async () => { change(); return familyTestMenu(account); });
  await expect(generateOwnedFamilyMenu(input)).rejects.toThrow('Данные семьи изменились'); expect(await outbox.list(account)).toEqual([]);
});
it('refuses invalid structured purchases instead of reporting success', async () => {
  const { input } = generation(); input.requestMenu.mockResolvedValue({ ...familyTestMenu(account), shoppingListItems: undefined });
  await expect(generateOwnedFamilyMenu(input)).rejects.toThrow('неполное'); expect(await outbox.list(account)).toEqual([]);
});
it('uses the guarded profile outbox for a family menu without a shared cloud family', async () => {
  const { input } = generation(); input.persistUser.mockResolvedValue({ status: 'pending' });
  await generateOwnedFamilyMenu({ ...input, repository: null });
  expect(input.persistUser).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ readGuard: guard, canCommit: expect.any(Function) }));
  expect(await outbox.list(account)).toEqual([]);
});
it('projects canonical purchases and retains checked state only in the same week', () => {
  const menu = { ...familyTestMenu(account), shoppingListItems: [{ name: 'рис белый', grams: 200 }, { name: 'Рис', grams: 300 }] };
  expect(familyShoppingProjection(familyWeek, menu, { week_start: familyWeek, items: [{ name: 'Рис', grams: 99, checked: true }] }).items)
    .toEqual([{ name: 'Рис', grams: 500, checked: true }]);
  expect(familyShoppingProjection(familyWeek, menu, { week_start: '2026-10-05', items: [{ name: 'Рис', grams: 99, checked: true }] }).items[0].checked).toBe(false);
});
it('constructs shared member profiles solely from the explicit API and shared restrictions', () => {
  const owner = familyTestProfile(account); const member = familyProfiles(owner, [{ user_id: 'member-b', sex: 'MALE', age: 32, weight_kg: 80,
    height_cm: 180, activity: 1.55, goal: 'MAINTAIN', restrictions_json: '{"allergens":["молоко"],"notes":"рыбу нельзя"}' }])[1];
  expect(member.exclusions).toContain('молоко'); expect(member.exclusions).toContain('рыбу нельзя');
  expect(member.weightHistory).toEqual([]); expect(member.medicalRestrictions).toBeUndefined(); expect(member.aiPlan).toBeUndefined();
});
