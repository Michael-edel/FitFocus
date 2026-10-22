import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearIndexedUserStateForUser,
  isIndexedUserStateStorageKey,
  readIndexedUserStateRaw,
  restoreIndexedUserStateBackup,
  writeIndexedUserStateRaw,
} from '../storage/indexedUserState';

const firstUserId = 'indexed-user-a';
const secondUserId = 'indexed-user-b';
const firstKey = `fitfocus_data_${firstUserId}_weekly_reports`;
const secondKey = `fitfocus_data_${secondUserId}_weekly_reports`;

afterEach(async () => {
  await clearIndexedUserStateForUser(firstUserId);
  await clearIndexedUserStateForUser(secondUserId);
});

describe('Indexed user state', () => {
  it('accepts an empty backup restore without waiting for nonexistent IDB requests', async () => {
    await expect(restoreIndexedUserStateBackup({})).resolves.toBe(true);
  });

  it('stores volume state under the exact account prefix without exposing it to another account', async () => {
    expect(isIndexedUserStateStorageKey(firstKey)).toBe(true);
    expect(isIndexedUserStateStorageKey(`fitfocus_data_${firstUserId}_settings`)).toBe(true);

    expect(await writeIndexedUserStateRaw(firstKey, '[{"weekKey":"2026-41"}]')).toBe(true);
    expect(await readIndexedUserStateRaw(firstKey)).toBe('[{"weekKey":"2026-41"}]');
    expect(await readIndexedUserStateRaw(secondKey)).toBeNull();
  });

  it('clears only the requested account data', async () => {
    await writeIndexedUserStateRaw(firstKey, '[]');
    await writeIndexedUserStateRaw(secondKey, '[1]');

    expect(await clearIndexedUserStateForUser(firstUserId)).toEqual({ cleared: true, legacyEvidenceRetained: false });
    expect(await readIndexedUserStateRaw(firstKey)).toBeNull();
    expect(await readIndexedUserStateRaw(secondKey)).toBe('[1]');
  });
});
