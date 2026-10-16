import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBackupPayload, createBackupPayload } from '../backup';
import { readIndexedUserStateRaw, writeIndexedUserStateRaw } from '../storage/indexedUserState';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe('browser backup', () => {
  beforeEach(() => vi.stubGlobal('localStorage', createLocalStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips indexed volume state with the local snapshot', async () => {
    const indexedKey = 'fitfocus_data_backup-user_diary';
    localStorage.setItem('fitfocus_data_backup-user_settings', '{"theme":"dark"}');
    await writeIndexedUserStateRaw(indexedKey, '[{"id":"meal-1"}]');

    const payload = await createBackupPayload();
    expect(payload.version).toBe(2);
    expect(payload.indexedDb?.[indexedKey]).toContain('meal-1');

    localStorage.clear();
    await writeIndexedUserStateRaw(indexedKey, '[]');
    await expect(applyBackupPayload(payload)).resolves.toEqual({ ok: true });

    expect(localStorage.getItem('fitfocus_data_backup-user_settings')).toContain('dark');
    expect(await readIndexedUserStateRaw(indexedKey)).toContain('meal-1');
  });

  it('keeps version-one snapshots importable', async () => {
    await expect(applyBackupPayload({
      version: 1,
      createdAt: '2026-10-08T00:00:00.000Z',
      localStorage: { 'fitfocus_data_legacy_settings': '{"theme":"light"}' },
    })).resolves.toEqual({ ok: true });

    expect(localStorage.getItem('fitfocus_data_legacy_settings')).toContain('light');
  });
});
