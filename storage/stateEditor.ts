import { UserStateRepository, type UserStateKey } from './userStateRepository';
import { reportStateSaveIssue } from './stateSaveStatus';
import type { OutboxWriteGuard } from './durableOutbox';

export type StateCodec<T> = { decode: (raw: string | null, fallback: T) => T; encode: (value: T) => string };
type Snapshot<T> = { value: T; phase: 'local' | 'loading' | 'ready' | 'error' };

/** A feature editor owns the revision it loaded. Reading never creates an outgoing operation. */
export class StateEditor<T> {
  private snapshot: Snapshot<T>;
  private readonly listeners = new Set<() => void>();
  private loading?: Promise<void>;
  private unobservedEdit = false;
  private editRevision = 0;
  constructor(private readonly repository: UserStateRepository | null, private readonly key: UserStateKey,
    private readonly initial: T, private readonly codec: StateCodec<T>) {
    this.snapshot = { value: initial, phase: repository ? 'loading' : 'local' };
  }
  readonly getSnapshot = (): Snapshot<T> => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  };
  private publish(snapshot: Snapshot<T>): void { this.snapshot = snapshot; for (const listener of this.listeners) { try { listener(); } catch {} } }
  load(): Promise<void> {
    if (!this.repository) return Promise.resolve();
    return this.loading ??= this.repository.readRawAsync(this.key).then((raw) => {
      const value = this.unobservedEdit ? this.snapshot.value : this.codec.decode(raw, this.initial);
      this.publish({ value, phase: 'ready' });
    }).catch((error: unknown) => {
      this.publish({ ...this.snapshot, phase: 'error' });
      this.issue(error);
    });
  }
  private issue(error: unknown): void {
    if (this.repository) reportStateSaveIssue({ accountId: this.repository.accountId, key: this.repository.key(this.key),
      kind: 'error', reason: error instanceof Error ? error.name : 'state-editor' });
  }
  set(action: T | ((value: T) => T)) {
    const value = typeof action === 'function' ? (action as (value: T) => T)(this.snapshot.value) : action;
    let raw: string;
    try { raw = this.codec.encode(value); } catch (error) { this.issue(error); return Promise.reject(error); }
    if (this.repository && this.snapshot.phase !== 'ready') this.unobservedEdit = true;
    this.editRevision += 1;
    this.publish({ ...this.snapshot, value });
    return this.repository ? this.repository.writeRaw(this.key, raw, this.unobservedEdit) : Promise.resolve(null);
  }
  /** Guarded commits become visible only after their scoped commit and never replace a newer edit. */
  async commitGenerated(action: T | ((value: T) => T), guard?: OutboxWriteGuard) {
    const captured: OutboxWriteGuard | undefined = guard
      ? 'readGuard' in guard
        ? { readGuard: { ...guard.readGuard }, canCommit: guard.canCommit }
        : { localCommitGuard: { ...guard.localCommitGuard }, canCommit: guard.canCommit }
      : undefined;
    await this.load();
    if (!this.repository || this.snapshot.phase !== 'ready' || (captured && !captured.canCommit())) throw new Error('OUTBOX_WRITE_SESSION_CHANGED');
    const editRevision = this.editRevision;
    const canCommit = () => (!captured || captured.canCommit()) && editRevision === this.editRevision;
    const value = typeof action === 'function' ? (action as (value: T) => T)(this.snapshot.value) : action;
    const encoded = this.codec.encode(value);
    const operation = !captured
      ? await this.repository.writeRaw(this.key, encoded, this.unobservedEdit)
      : 'readGuard' in captured
        ? await this.repository.writeRaw(this.key, encoded, this.unobservedEdit, { readGuard: captured.readGuard, canCommit })
        : await this.repository.writeLocalRaw(this.key, encoded, this.unobservedEdit,
          { localCommitGuard: captured.localCommitGuard, canCommit });
    if (!canCommit()) return null;
    if (operation.status === 'pending') { this.editRevision += 1; this.publish({ value, phase: 'ready' }); }
    return operation;
  }
  async remove(guard?: OutboxWriteGuard) {
    const editRevision = ++this.editRevision;
    if (this.repository && this.snapshot.phase !== 'ready') this.unobservedEdit = true;
    const operation = !this.repository ? null
      : !guard ? await this.repository.remove(this.key, this.unobservedEdit)
        : 'readGuard' in guard
          ? await this.repository.remove(this.key, this.unobservedEdit, guard)
          : await this.repository.removeLocal(this.key, this.unobservedEdit, guard);
    if (editRevision === this.editRevision && (!operation || operation.status === 'pending')) {
      this.publish({ ...this.snapshot, value: this.initial });
    }
    return operation;
  }
}
