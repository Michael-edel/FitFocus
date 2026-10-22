import type { FamilyWeeklyMenu } from '../types';
import { familyMenuStorageKey, isFamilyMenuIntent, isFamilyMenuSnapshot, type FamilyMenuSnapshot, type FamilyMenuTarget } from '../familyMenuValidation';
import { DurableOutbox, type OutboxCommitGuard, type OutboxOperation, type OutboxReadGuard } from './durableOutbox';
import { reportStateOperation, reportStateQueue, reportStateSaveIssue } from './stateSaveStatus';

export type FamilyMenuObservation = Readonly<{ revision: number; confirmedVersion: number; parentOpId?: string; menu: FamilyWeeklyMenu | null }>;

/** Another resource in the same outbox. Each action retains the revision actually displayed. */
export class FamilyMenuRepository {
  private readonly outbox: DurableOutbox;
  private readonly writerId: string;
  private observation?: FamilyMenuObservation;
  readonly key: string;
  constructor(readonly accountId: string, readonly target: FamilyMenuTarget, options: { outbox?: DurableOutbox; writerId?: string } = {}) {
    this.outbox = options.outbox ?? new DurableOutbox();
    this.writerId = options.writerId ?? crypto.randomUUID();
    this.key = familyMenuStorageKey(accountId, target);
  }
  capture(): FamilyMenuObservation {
    if (!this.observation) throw new Error('Сначала обновите семейное меню.');
    return Object.freeze({ ...this.observation });
  }
  private decode(value: string | null): FamilyWeeklyMenu | null {
    if (value === null) return null;
    let intent: unknown;
    try { intent = JSON.parse(value); } catch {}
    if (!isFamilyMenuIntent(intent) || familyMenuStorageKey(this.accountId, intent) !== this.key) throw new Error('FAMILY_MENU_INVALID_LOCAL_SNAPSHOT');
    return intent.menu;
  }
  async observe(): Promise<FamilyMenuObservation> {
    const snapshot = await this.outbox.snapshot(this.accountId, this.key, true);
    const previous = this.observation;
    const observation = { revision: snapshot.revision, confirmedVersion: snapshot.confirmedVersion, menu: this.decode(snapshot.value),
      ...(previous?.revision === snapshot.revision && previous.parentOpId ? { parentOpId: previous.parentOpId } : {}),
    };
    const operations = await this.outbox.list(this.accountId);
    reportStateQueue(this.accountId, operations);
    for (const operation of operations) if (operation.key === this.key && operation.status === 'conflicted') {
      reportStateSaveIssue({ accountId: this.accountId, key: this.key, kind: 'conflicted', reason: operation.reason ?? 'family-menu-conflict' });
    }
    if (!this.observation || this.observation.revision <= observation.revision) this.observation = observation;
    return this.observation;
  }
  async refresh(snapshot: FamilyMenuSnapshot, guard: OutboxReadGuard, before?: FamilyMenuObservation): Promise<FamilyMenuObservation> {
    if (!isFamilyMenuSnapshot(snapshot) || familyMenuStorageKey(this.accountId, snapshot) !== this.key
      || guard.accountId !== this.accountId || !await this.outbox.isReadSessionCurrent(guard)) throw new Error('FAMILY_MENU_SESSION_CHANGED');
    const observed = before ?? this.observation ?? await this.observe();
    const value = snapshot.menu ? JSON.stringify({ ...this.target, menu: snapshot.menu }) : '';
    await this.outbox.hydrate(this.accountId, this.key, { value, exists: snapshot.menu !== null, version: snapshot.version },
      observed.revision, guard.sessionEpoch, guard.authFence);
    if (!await this.outbox.isReadSessionCurrent(guard)) throw new Error('FAMILY_MENU_SESSION_CHANGED');
    return this.observe();
  }
  async commit(menu: FamilyWeeklyMenu, observed: FamilyMenuObservation, guard: OutboxCommitGuard): Promise<OutboxOperation> {
    try {
      const operation = await this.outbox.write({ accountId: this.accountId, writerId: this.writerId, resource: 'familyMenu',
        intent: { type: 'put', key: this.key, value: JSON.stringify({ ...this.target, menu }) },
        expectedRevision: observed.revision, baseVersion: observed.confirmedVersion,
        ...(observed.parentOpId ? { parentOpId: observed.parentOpId } : {}),
        readGuard: { ...guard.readGuard }, canCommit: guard.canCommit,
      });
      reportStateOperation(this.accountId, operation);
      reportStateQueue(this.accountId, await this.outbox.list(this.accountId));
      if (operation.status === 'pending') this.observation = { revision: operation.revision,
        confirmedVersion: observed.confirmedVersion, parentOpId: operation.opId, menu };
      return operation;
    } catch (error) {
      reportStateSaveIssue({ accountId: this.accountId, key: this.key, kind: 'error', reason: error instanceof Error ? error.message : 'storage' });
      throw error;
    }
  }
}
