export type StateSaveIssue = { accountId: string; key: string; kind: 'error' | 'conflicted'; reason: string };
import type { StateSyncPause } from './durableOutbox';
import type { OutboxOperation } from './durableOutbox';
let pauseSnapshot: readonly { accountId: string; reason: StateSyncPause }[] = [];
export const getStateSyncPauses = () => pauseSnapshot;
export function reportStateSyncPause(accountId: string, reason: StateSyncPause | null): void {
  if (pauseSnapshot.find((entry) => entry.accountId === accountId)?.reason === (reason ?? undefined)) return;
  pauseSnapshot = [...pauseSnapshot.filter((entry) => entry.accountId !== accountId), ...(reason ? [{ accountId, reason }] : [])];
  publish();
}
export type StateLegacyMigrationNotice = { accountId: string; quarantinedRecords: number };
let legacyMigrationSnapshot: readonly StateLegacyMigrationNotice[] = [];
export const getStateLegacyMigrationNotices = () => legacyMigrationSnapshot;
export function reportStateLegacyMigrationNotice(accountId: string, quarantinedRecords: number | null): void {
  const current = legacyMigrationSnapshot.find((entry) => entry.accountId === accountId);
  if (quarantinedRecords === null || quarantinedRecords <= 0) {
    if (!current) return;
    legacyMigrationSnapshot = legacyMigrationSnapshot.filter((entry) => entry.accountId !== accountId);
    publish();
    return;
  }
  if (current?.quarantinedRecords === quarantinedRecords) return;
  legacyMigrationSnapshot = [
    ...legacyMigrationSnapshot.filter((entry) => entry.accountId !== accountId),
    { accountId, quarantinedRecords },
  ];
  publish();
}
const issues = new Map<string, StateSaveIssue>();
const listeners = new Set<() => void>();
let snapshot: readonly StateSaveIssue[] = [];
type QueueOperation = Pick<OutboxOperation, 'opId' | 'key' | 'type' | 'status' | 'revision' | 'retryCount'>
  & Pick<OutboxOperation, 'resource' | 'reason' | 'serverSnapshot' | 'migrationSourceKey' | 'migrationFingerprint' | 'migrationCanonical'>;
export type StateQueueOperation = {
  accountId: string; opId: string; key: string; type: OutboxOperation['type'];
  status: OutboxOperation['status']; revision: number; retryCount: number;
  resource?: OutboxOperation['resource']; reason?: string; legacy: boolean;
  serverVersion?: number; serverExists?: boolean;
};
export type StateQueueSummary = { accountId: string; pending: number; sending: number; conflicted: number; failed: number };
const operations = new Map<string, StateQueueOperation>();
let queueSnapshot: readonly StateQueueSummary[] = [];
let operationSnapshot: readonly StateQueueOperation[] = [];

function queueOperation(accountId: string, operation: QueueOperation): StateQueueOperation {
  return {
    accountId, opId: operation.opId, key: operation.key, type: operation.type, status: operation.status,
    revision: operation.revision, retryCount: operation.retryCount,
    ...(operation.resource ? { resource: operation.resource } : {}),
    ...(operation.reason ? { reason: operation.reason } : {}),
    legacy: !!(operation.migrationSourceKey || operation.migrationFingerprint || operation.migrationCanonical),
    ...(operation.serverSnapshot && Number.isSafeInteger(operation.serverSnapshot.version)
      ? { serverVersion: operation.serverSnapshot.version }
      : {}),
    ...(typeof operation.serverSnapshot?.exists === 'boolean' ? { serverExists: operation.serverSnapshot.exists } : {}),
  };
}

function sameQueueOperation(left: StateQueueOperation | undefined, right: StateQueueOperation): boolean {
  return !!left && left.accountId === right.accountId && left.opId === right.opId && left.key === right.key
    && left.type === right.type && left.status === right.status && left.revision === right.revision
    && left.retryCount === right.retryCount && left.resource === right.resource && left.reason === right.reason
    && left.legacy === right.legacy && left.serverVersion === right.serverVersion && left.serverExists === right.serverExists;
}

export function reportStateOperation(accountId: string, operation: QueueOperation): void {
  const item = queueOperation(accountId, operation);
  operations.set(operation.opId, item);
  if (item.status !== 'conflicted' && ![...operations.values()].some((entry) => entry.accountId === accountId && entry.key === item.key && entry.status === 'conflicted')) {
    issues.delete(JSON.stringify([accountId, item.key, 'conflicted']));
  }
  publish();
}

export function reportStateQueue(accountId: string, current: readonly QueueOperation[]): void {
  const known = [...operations.values()].filter((operation) => operation.accountId === accountId);
  const next = current.map((operation) => queueOperation(accountId, operation));
  let clearedIssue = false;
  for (const issue of issues.values()) {
    if (issue.accountId === accountId && issue.kind === 'conflicted'
      && !next.some((operation) => operation.key === issue.key && operation.status === 'conflicted')) {
      issues.delete(JSON.stringify([accountId, issue.key, 'conflicted']));
      clearedIssue = true;
    }
  }
  if (known.length === next.length && next.every((operation) => sameQueueOperation(operations.get(operation.opId), operation))) {
    if (clearedIssue) publish();
    return;
  }
  for (const [id, operation] of operations) if (operation.accountId === accountId) operations.delete(id);
  for (const operation of next) operations.set(operation.opId, operation);
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
  operationSnapshot = [...operations.values()];
  for (const listener of listeners) { try { listener(); } catch {} }
}
export const getStateSaveIssues = (): readonly StateSaveIssue[] => snapshot;
export const getStateQueueSummaries = (): readonly StateQueueSummary[] => queueSnapshot;
export const getStateQueueOperations = (): readonly StateQueueOperation[] => operationSnapshot;
export function subscribeStateSaveIssues(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
