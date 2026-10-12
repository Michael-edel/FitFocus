import { afterEach, expect, it, vi } from 'vitest';
import {
  checkLegacyWriterFence,
  doesLegacyWriterFenceCoverCurrentClients,
  isCurrentLegacyWriterFenceProof,
  LEGACY_WRITER_FENCE_PROBE,
  LEGACY_WRITER_FENCE_REPLY,
  respondToLegacyWriterFence,
} from '../storage/legacyWriterFence';

function controller(reply: (message: { challengeId: string; buildId: string }) => unknown) {
  const serviceWorker = {
    postMessage(message: { challengeId: string; buildId: string }, ports: Transferable[]) {
      const port = ports[0] as MessagePort;
      port.postMessage(reply(message));
    },
  } as unknown as ServiceWorker;
  return { controller: serviceWorker } as Pick<ServiceWorkerContainer, 'controller'>;
}

afterEach(() => { vi.useRealTimers(); });

it('requires a matching worker, the requesting page and every listed current-build client', () => {
  const clients = [{ id: 'tab-a', buildId: 'build-123' }, { id: 'tab-b', buildId: 'build-123' }];
  expect(doesLegacyWriterFenceCoverCurrentClients('build-123', 'build-123', 'tab-a', clients)).toBe(true);
  expect(doesLegacyWriterFenceCoverCurrentClients('build-123', 'older-build', 'tab-a', clients)).toBe(false);
  expect(doesLegacyWriterFenceCoverCurrentClients('build-123', 'build-123', 'missing-tab', clients)).toBe(false);
  expect(doesLegacyWriterFenceCoverCurrentClients('build-123', 'build-123', 'tab-a', [...clients, { id: 'stale-tab', buildId: null }])).toBe(false);
});

it('accepts only a fresh worker proof that lists every current-build client', async () => {
  const proof = await checkLegacyWriterFence(controller(({ challengeId, buildId }) => ({
    type: LEGACY_WRITER_FENCE_REPLY,
    challengeId,
    workerBuildId: buildId,
    complete: true,
    clients: [{ id: 'tab-a', buildId }, { id: 'tab-b', buildId }],
  })), 'build-123', 500, () => 1_000);
  expect(proof).toEqual({ buildId: 'build-123', checkedAtMs: 1_000, challengeId: expect.any(String), clientIds: ['tab-a', 'tab-b'] });
  expect(isCurrentLegacyWriterFenceProof(proof, 1_500)).toBe(true);
  expect(isCurrentLegacyWriterFenceProof(proof, 7_000)).toBe(false);
});

it.each([
  ['an old open tab', ({ challengeId, buildId }: { challengeId: string; buildId: string }) => ({
    type: LEGACY_WRITER_FENCE_REPLY, challengeId, workerBuildId: buildId, complete: false,
    clients: [{ id: 'new-tab', buildId }, { id: 'old-tab', buildId: 'older-build' }],
  })],
  ['a stale service worker', ({ challengeId }: { challengeId: string }) => ({
    type: LEGACY_WRITER_FENCE_REPLY, challengeId, workerBuildId: 'older-build', complete: true,
    clients: [{ id: 'tab', buildId: 'build-123' }],
  })],
  ['an empty client inventory', ({ challengeId, buildId }: { challengeId: string; buildId: string }) => ({
    type: LEGACY_WRITER_FENCE_REPLY, challengeId, workerBuildId: buildId, complete: true, clients: [],
  })],
  ['duplicate clients', ({ challengeId, buildId }: { challengeId: string; buildId: string }) => ({
    type: LEGACY_WRITER_FENCE_REPLY, challengeId, workerBuildId: buildId, complete: true,
    clients: [{ id: 'tab', buildId }, { id: 'tab', buildId }],
  })],
])('rejects the writer fence when it detects %s', async (_label, reply) => {
  await expect(checkLegacyWriterFence(controller(reply), 'build-123', 500)).resolves.toBeNull();
});

it('does not claim a fence when the active worker or its reply is missing', async () => {
  await expect(checkLegacyWriterFence({ controller: null }, 'build-123')).resolves.toBeNull();
  vi.useFakeTimers();
  const pending = checkLegacyWriterFence({ controller: { postMessage: vi.fn() } as unknown as ServiceWorker }, 'build-123', 100);
  await vi.advanceTimersByTimeAsync(101);
  await expect(pending).resolves.toBeNull();
});

it('answers a worker probe with this page’s compiled build id', async () => {
  const channel = new MessageChannel();
  const reply = new Promise<unknown>((resolve) => { channel.port2.onmessage = (event) => resolve(event.data); });
  const event = new MessageEvent('message', {
    data: { type: LEGACY_WRITER_FENCE_PROBE, challengeId: 'nonce' },
    ports: [channel.port1],
  });
  expect(respondToLegacyWriterFence(event, 'build-123')).toBe(true);
  await expect(reply).resolves.toEqual({ type: LEGACY_WRITER_FENCE_REPLY, challengeId: 'nonce', buildId: 'build-123' });
  channel.port2.close();
});
