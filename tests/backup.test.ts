import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBackupPayload, createBackupPayload } from '../backup';
import { readIndexedUserStateRaw, writeIndexedUserStateRaw } from '../storage/indexedUserState';
import { UserStateRepository } from '../storage/userStateRepository';
import { DurableOutbox } from '../storage/durableOutbox';
import { userStateDatabase } from '../storage/stateDatabase';

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
  beforeEach(() => {
    userStateDatabase.close();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('localStorage', createLocalStorage());
  });
  afterEach(() => {
    userStateDatabase.close();
    vi.unstubAllGlobals();
  });

  it('reports a rejected restore without overwriting durable values or their pending intent', async () => {
    const repository = new UserStateRepository('backup-owned-user');
    await repository.writeJson('weekly_reports', []);
    const before = await new DurableOutbox().list('backup-owned-user');
    const result = await applyBackupPayload({ version: 2, createdAt: '2026-10-09T00:00:00Z', localStorage: {},
      indexedDb: { 'fitfocus_data_backup-owned-user_weekly_reports': '[{"replaced":true}]' } });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(await readIndexedUserStateRaw('fitfocus_data_backup-owned-user_weekly_reports')).toBe('[]');
    expect(await new DurableOutbox().list('backup-owned-user')).toEqual(before);
  });
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
