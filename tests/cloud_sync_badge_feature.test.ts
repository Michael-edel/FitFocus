import { describe, expect, it } from 'vitest';
import { buildCloudSyncBadge } from '../features/profile/cloudSyncBadge';

const input = (overrides: Partial<Parameters<typeof buildCloudSyncBadge>[0]> = {}) => ({
  hasCloudSession: true,
  state: 'idle' as const,
  note: null,
  lastSyncAt: 100,
  formatTime: () => '12:34',
  ...overrides,
});

describe('cloud sync badge', () => {
  it('never reports a saved profile as full success while state intent or a storage error remains', () => {
    expect(buildCloudSyncBadge(input({ state: 'saved', stateQueue: { pending: 1, sending: 0, conflicted: 0, failed: 0 } })).label).toBe('Cloud: pending');
    expect(buildCloudSyncBadge(input({ state: 'saved', localSaveError: true })).label).toBe('Cloud: error');
    expect(buildCloudSyncBadge(input({ state: 'saved', stateQueue: { pending: 0, sending: 0, conflicted: 1, failed: 0 } })).label).toBe('Cloud: error');
  });
  it('explains local-only mode without a cloud session', () => {
    expect(buildCloudSyncBadge(input({ hasCloudSession: false, state: 'error', note: 'ignored' }))).toMatchObject({ label: 'Cloud: local' });
  });

  it('maps saving, saved, error and idle states with a stable last-sync label', () => {
    expect(buildCloudSyncBadge(input({ state: 'saving' }))).toMatchObject({ label: 'Cloud: saving', title: expect.stringContaining('12:34') });
    expect(buildCloudSyncBadge(input({ state: 'saved' }))).toMatchObject({ label: 'Cloud: saved' });
    expect(buildCloudSyncBadge(input({ state: 'error', note: 'Сеть недоступна' }))).toMatchObject({ label: 'Cloud: error', title: expect.stringContaining('Сеть недоступна') });
    expect(buildCloudSyncBadge(input({ note: 'Ожидание' }))).toMatchObject({ label: 'Cloud: idle', title: 'Ожидание' });
  });
});
