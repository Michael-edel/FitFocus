export type StateSaveIssue = { accountId: string; key: string; kind: 'error' | 'conflicted'; reason: string };
const issues = new Map<string, StateSaveIssue>();
const listeners = new Set<() => void>();
let snapshot: readonly StateSaveIssue[] = [];
type QueueOperation = { opId: string; status: 'pending' | 'sending' | 'conflicted' | 'failed' };
export type StateQueueSummary = { accountId: string; pending: number; sending: number; conflicted: number; failed: number };
const operations = new Map<string, QueueOperation & { accountId: string }>();
let queueSnapshot: readonly StateQueueSummary[] = [];

export function reportStateOperation(accountId: string, operation: QueueOperation): void {
  operations.set(operation.opId, { accountId, opId: operation.opId, status: operation.status });
  publish();
}

export function reportStateQueue(accountId: string, current: readonly QueueOperation[]): void {
  for (const [id, operation] of operations) if (operation.accountId === accountId) operations.delete(id);
  for (const operation of current) operations.set(operation.opId, { accountId, opId: operation.opId, status: operation.status });
  publish();
}

export function reportStateSaveIssue(issue: StateSaveIssue): void {
  issues.set(JSON.stringify([issue.accountId, issue.key, issue.kind]), issue);
  publish();
}

/** A later successful local commit clears only the storage error for that same key. */
export function reportStateSaveSuccess(accountId: string, key: string): void {
  const id = JSON.stringify([accountId, key, 'error']);
  if (issues.get(id)?.kind !== 'error') return;
  issues.delete(id);
  publish();
}

function publish(): void {
  snapshot = [...issues.values()];
  const summaries = new Map<string, StateQueueSummary>();
  for (const operation of operations.values()) {
    const summary = summaries.get(operation.accountId) ?? { accountId: operation.accountId, pending: 0, sending: 0, conflicted: 0, failed: 0 };
    summary[operation.status] += 1;
    summaries.set(operation.accountId, summary);
  }
  queueSnapshot = [...summaries.values()];
  for (const listener of listeners) { try { listener(); } catch {} }
}
export const getStateSaveIssues = (): readonly StateSaveIssue[] => snapshot;
export const getStateQueueSummaries = (): readonly StateQueueSummary[] => queueSnapshot;
export function subscribeStateSaveIssues(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
