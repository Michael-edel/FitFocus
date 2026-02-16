import { safeGetItem, safeSetItem } from "./utils";

export type OutboxOp = {
  opId: string;
  deviceId: string;
  userUid: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  patch: any;        // JSON Patch-like object
  updatedAt: number; // ms epoch
};

const OUTBOX_KEY = "fitfocus_outbox_ops";

export function loadOutbox(): OutboxOp[] {
  return safeGetItem<OutboxOp[]>(OUTBOX_KEY, []);
}

export function enqueueOp(op: OutboxOp): void {
  const ops = loadOutbox();
  ops.push(op);
  safeSetItem(OUTBOX_KEY, ops);
}

export function dropOps(opIds: string[]): void {
  const set = new Set(opIds);
  const ops = loadOutbox().filter(o => !set.has(o.opId));
  safeSetItem(OUTBOX_KEY, ops);
}
