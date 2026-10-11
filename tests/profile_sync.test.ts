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
    syncStateImpl: vi.fn(async () => true),
    fetchImpl,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('profile sync serialization', () => {
  it('requests the owned sender instead of uploading localStorage state directly', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ profile }), { status: 200 }));
    const deps = makeDeps(fetchMock);
    await pushProfileToCloud(profile, deps);
    expect(deps.syncStateImpl).toHaveBeenCalledWith(profile.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/profile');
  });
  it('does not label pending or conflicted state as synchronized after a profile success', async () => {
    const deps = makeDeps(vi.fn(async () => new Response(JSON.stringify({ profile }), { status: 200 })) as typeof fetch);
    deps.syncStateImpl.mockResolvedValue(false);
    await pushProfileToCloud(profile, deps);
    expect(deps.setProfileSyncState).toHaveBeenLastCalledWith('error');
    expect(deps.setLastProfileSyncAt).not.toHaveBeenCalled();
  });
  it('waits for an active profile sync before sending the next change', async () => {
    let releaseFirstRequest: (() => void) | undefined;
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
      if (fetchMock.mock.calls.length === 1) {
        await firstRequest;
      }
      return new Response(JSON.stringify({ profile }), { status: 200 });
    });
    const fetchImpl = fetchMock as unknown as typeof fetch;
    vi.stubGlobal('window', {
      setTimeout: (handler: () => void, delay?: number) => setTimeout(handler, delay) as unknown as number,
      clearTimeout,
    });
    const deps = makeDeps(fetchImpl);

    const saving = pushProfileToCloud(profile, deps);
    const patching = patchProfileInCloud({ name: 'New name' }, deps);

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    releaseFirstRequest?.();
    await saving;
    await patching;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-Request-ID')).toMatch(/^web-/);
  });
});
