import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { StateDatabase } from '../storage/stateDatabase';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { FamilyMenuRepository } from '../storage/familyMenuRepository';
import { familyMenuStorageKey, isFamilyMenuIntent, isFamilyMenuWriteIntent } from '../familyMenuValidation';
import { buildFamilyDayMenu } from '../domain/familyPlanning';
import { familyTestMenu, familyWeek } from './_helpers/familyMenu';

const account = 'delivery-account', target = { familyId: 'delivery-family', weekStart: familyWeek };
let database: StateDatabase, outbox: DurableOutbox, guard: OutboxReadGuard, repository: FamilyMenuRepository;
beforeEach(async () => {
  database = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(database);
  guard = (await outbox.acceptReadSession(account, 'a'.repeat(64), 0))!;
  repository = new FamilyMenuRepository(account, target, { outbox, writerId: 'displayed-editor' });
  await repository.observe();
});
afterEach(() => database.close());
const commit = () => repository.commit(familyTestMenu(account), repository.capture(), { readGuard: guard, canCommit: () => true });

it('distinguishes a durable local intent from the exact operation acknowledged at a returned version', async () => {
  const operation = await commit();
  const pending = await outbox.deliverySnapshot(account, repository.key, guard);
  expect(pending.acknowledged).toBeUndefined(); expect(pending.confirmedVersion).toBe(0);
  expect(pending.operations.map(item => item.opId)).toEqual([operation.opId]);
  const claimed = await outbox.claim({ accountId: account, sessionEpoch: guard.sessionEpoch, owner: 'sender', nowMs: Date.now(), leaseMs: 30_000 });
  expect(claimed).not.toBeNull();
  await outbox.finish(claimed!, { kind: 'acknowledged', version: 7 });
  const accepted = await outbox.deliverySnapshot(account, repository.key, guard);
  expect(accepted.operations).toEqual([]); expect(accepted.confirmedVersion).toBe(7);
  expect(accepted.acknowledged).toEqual({ opId: operation.opId, writerId: operation.writerId, revision: operation.revision });
});

it('does not attribute a previous acknowledgement to a newer displayed local change', async () => {
  const first = await commit();
  const claimed = await outbox.claim({ accountId: account, sessionEpoch: guard.sessionEpoch, owner: 'sender', nowMs: Date.now(), leaseMs: 30_000 });
  await outbox.finish(claimed!, { kind: 'acknowledged', version: 2 });
  await repository.observe();
  const next = await commit();
  const delivery = await outbox.deliverySnapshot(account, repository.key, guard);
  expect(delivery.revision).toBe(next.revision);
  expect(delivery.acknowledged?.opId).toBe(first.opId);
  expect(delivery.acknowledged?.revision).not.toBe(delivery.revision);
  expect(delivery.operations.map(item => item.opId)).toEqual([next.opId]);
});

it('never reports another login of the same account through an old delivery guard', async () => {
  await commit(); await outbox.invalidateSessions();
  await outbox.acceptReadSession(account, 'b'.repeat(64), (await outbox.sessionState()).fence);
  await expect(outbox.deliverySnapshot(account, repository.key, guard)).rejects.toMatchObject({ cause: { message: 'OUTBOX_READ_SESSION_CHANGED' } });
  expect(await outbox.list(account)).toHaveLength(1);
});

it('rejects cross-account delivery reads before returning locally retained data', async () => {
  await commit();
  await expect(outbox.deliverySnapshot('another-account', repository.key, guard)).rejects.toThrow();
});

it('keeps the purchase command through repository reload and rejects commandless structured writes', async () => {
  const day = '2026-10-23', dayTarget = { familyId: target.familyId, weekStart: day };
  const menu = buildFamilyDayMenu({ date: day, rosterVersion: 1,
    profiles: [{ id: account, version: 1, configuration: { displayName: 'Участник', ageGroup: 'adult', portionShare: 1,
      allergies: { state: 'none', allergenIds: [] }, hardExcludedIngredientIds: [], dislikedIngredientIds: [] } }],
    selections: [{ slot: 'lunch', participantShares: { [account]: 1 } }] });
  const readIntent = { ...dayTarget, menu };
  expect(isFamilyMenuIntent(readIntent)).toBe(true); expect(isFamilyMenuWriteIntent(readIntent)).toBe(false);
  const dayRepository = new FamilyMenuRepository(account, dayTarget, { outbox }); await dayRepository.observe();
  const operation = await dayRepository.commit(menu, dayRepository.capture(), { readGuard: guard, canCommit: () => true }, 'purchases');
  expect(operation.type === 'put' && JSON.parse(operation.value).mutationKind).toBe('purchases');
  const restored = new FamilyMenuRepository(account, dayTarget, { outbox });
  expect((await restored.observe()).menu).toEqual(menu);
  await expect(outbox.write({ accountId: account, writerId: 'bad-editor', resource: 'familyMenu',
    intent: { type: 'put', key: familyMenuStorageKey(account, dayTarget), value: JSON.stringify(readIntent) },
    expectedRevision: operation.revision, baseVersion: 0, readGuard: guard, canCommit: () => true })).rejects.toThrow();
});
