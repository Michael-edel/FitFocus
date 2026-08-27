import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchProfileInCloud, pushProfileToCloud } from '../profileSync';
import type { UserProfile } from '../types';

const profile = {
  id: 'user-1',
  name: 'Original',
  version: 1,
} as UserProfile;

function makeDeps(fetchImpl: typeof fetch) {
  return {
    currentUser: profile,
    setProfileSyncState: vi.fn(),
    setLastProfileSyncAt: vi.fn(),
    setAllUsers: vi.fn(),
    persistUser: vi.fn(),
    loginAsUser: vi.fn(async () => undefined),
    collectLocalStateItemsImpl: () => [],
    fetchImpl,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('profile sync serialization', () => {
  it('waits for an active profile sync before sending the next change', async () => {
    let releaseFirstRequest: (() => void) | undefined;
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      if (fetchImpl.mock.calls.length === 1) {
        await firstRequest;
      }
      return new Response(JSON.stringify({ profile }), { status: 200 });
    }) as unknown as typeof fetch;
    vi.stubGlobal('window', {
      setTimeout: (handler: () => void, delay?: number) => setTimeout(handler, delay) as unknown as number,
      clearTimeout,
    });
    const deps = makeDeps(fetchImpl);

    const saving = pushProfileToCloud(profile, deps);
    const patching = patchProfileInCloud({ name: 'New name' }, deps);

    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    releaseFirstRequest?.();
    await saving;
    await patching;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' });
  });
});
