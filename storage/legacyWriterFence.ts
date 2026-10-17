export const LEGACY_WRITER_FENCE_PROBE = 'FITFOCUS_LEGACY_WRITER_FENCE_PROBE';
export const LEGACY_WRITER_FENCE_REPLY = 'FITFOCUS_LEGACY_WRITER_FENCE_REPLY';
export const LEGACY_WRITER_FENCE_CHECK = 'FITFOCUS_LEGACY_WRITER_FENCE_CHECK';

type FenceClient = { id: string; buildId: string | null };

export type LegacyWriterFenceProof = Readonly<{
  buildId: string;
  checkedAtMs: number;
  challengeId: string;
  clientIds: readonly string[];
}>;

export function isCurrentLegacyWriterFenceProof(
  value: unknown,
  nowMs = Date.now(),
  maxAgeMs = 5_000,
): value is LegacyWriterFenceProof {
  if (!value || typeof value !== 'object') return false;
  const proof = value as Partial<LegacyWriterFenceProof>;
  return typeof proof.buildId === 'string' && proof.buildId.length > 0
    && typeof proof.challengeId === 'string' && proof.challengeId.length > 0
    && typeof proof.checkedAtMs === 'number' && Number.isFinite(proof.checkedAtMs)
    && proof.checkedAtMs <= nowMs && nowMs - proof.checkedAtMs <= maxAgeMs
    && Array.isArray(proof.clientIds) && proof.clientIds.length > 0
    && proof.clientIds.every((id) => typeof id === 'string' && id.length > 0)
    && new Set(proof.clientIds).size === proof.clientIds.length;
}

type FenceReply = {
  type: typeof LEGACY_WRITER_FENCE_REPLY;
  challengeId: string;
  workerBuildId: string;
  complete: boolean;
  clients: FenceClient[];
};

export function doesLegacyWriterFenceCoverCurrentClients(
  requestedBuildId: string,
  workerBuildId: string,
  sourceClientId: string | undefined,
  clients: readonly FenceClient[],
): boolean {
  const ids = clients.map((client) => client.id);
  return requestedBuildId.length > 0 && workerBuildId === requestedBuildId && clients.length > 0
    && !!sourceClientId && ids.includes(sourceClientId) && new Set(ids).size === ids.length
    && clients.every((client) => client.id.length > 0 && client.buildId === requestedBuildId);
}

function isFenceReply(value: unknown): value is FenceReply {
  if (!value || typeof value !== 'object') return false;
  const reply = value as Partial<FenceReply>;
  return reply.type === LEGACY_WRITER_FENCE_REPLY
    && typeof reply.challengeId === 'string'
    && typeof reply.workerBuildId === 'string'
    && typeof reply.complete === 'boolean'
    && Array.isArray(reply.clients)
    && reply.clients.every((client) => !!client && typeof client.id === 'string'
      && (typeof client.buildId === 'string' || client.buildId === null));
}

/** Ask the active worker to verify that every same-origin window runs this exact build. */
export async function checkLegacyWriterFence(
  container: Pick<ServiceWorkerContainer, 'controller'>,
  buildId: string,
  timeoutMs = 2_500,
  now: () => number = Date.now,
): Promise<LegacyWriterFenceProof | null> {
  const controller = container.controller;
  if (!controller || !buildId || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;
  let challengeId: string;
  try {
    if (typeof MessageChannel === 'undefined' || typeof crypto.randomUUID !== 'function') return null;
    challengeId = crypto.randomUUID();
  } catch { return null; }
  return new Promise((resolve) => {
    let settled = false;
    let channel: MessageChannel | undefined;
    const finish = (proof: LegacyWriterFenceProof | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.removeEventListener('statechange', onStateChange);
      channel?.port1.close();
      channel?.port2.close();
      resolve(proof);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const onStateChange = () => {
      if (controller.state === 'redundant') return finish(null);
      if (controller.state === 'activated') postCheck();
    };
    const postCheck = () => {
      if (settled || controller.state !== 'activated') return;
      try {
        channel = new MessageChannel();
      } catch { return finish(null); }
      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        if (!isFenceReply(event.data)) return finish(null);
        const reply = event.data;
        const ids = reply.clients.map((client) => client.id);
        // The worker must identify its own build and return a nonempty, duplicate-free client inventory.
        if (reply.challengeId !== challengeId || !reply.complete || !ids.length || new Set(ids).size !== ids.length
          || reply.workerBuildId !== buildId || reply.clients.some((client) => client.buildId !== buildId)) return finish(null);
        finish(Object.freeze({ buildId, checkedAtMs: now(), challengeId, clientIds: Object.freeze(ids) }));
      };
      try {
        controller.postMessage({ type: LEGACY_WRITER_FENCE_CHECK, challengeId, buildId }, [channel.port2]);
      } catch {
        finish(null);
      }
    };
    controller.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}

/** Reply only from a page whose code was built with the supplied build id. */
export function respondToLegacyWriterFence(
  event: MessageEvent<unknown>,
  buildId: string,
): boolean {
  const value = event.data;
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; challengeId?: unknown };
  const port = event.ports?.[0];
  if (message.type !== LEGACY_WRITER_FENCE_PROBE || typeof message.challengeId !== 'string' || !port) return false;
  port.postMessage({ type: LEGACY_WRITER_FENCE_REPLY, challengeId: message.challengeId, buildId });
  port.close();
  return true;
}
