import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { clearLocalUserData, clearRetiredLocalTelemetry, localUserIdFromStorageKey } from '../storage/hybrid';
import { userStateDatabase } from '../storage/stateDatabase';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

describe('clearLocalUserData', () => {
  afterEach(() => {
    userStateDatabase.close();
    vi.unstubAllGlobals();
  });

  it('parses account owners without truncating dynamic suffixes embedded in account ids', () => {
    const accountId = 'owner_ai_cache_v1:embedded_family_menu:';
    expect(localUserIdFromStorageKey(`fitfocus_data_${accountId}_ai_cache_v1:recipe`)).toBe(accountId);
    expect(localUserIdFromStorageKey(`fitfocus_data_${accountId}_family_menu:["family","2026-10-19"]`)).toBe(accountId);
    expect(localUserIdFromStorageKey(`fitfocus_data_${accountId}_shopping_fallback_2026-10-19`)).toBe(accountId);
    expect(localUserIdFromStorageKey(`fitfocus_usage_counters_v1:${encodeURIComponent(accountId)}__ffv`)).toBe(accountId);
    expect(localUserIdFromStorageKey('fitfocus.remote-kv-outbox.v1')).toBeNull();
    expect(localUserIdFromStorageKey(`fitfocus_data_${accountId}_council_history`)).toBe(accountId);
  });

  it('removes all user-scoped data and version metadata without touching another account', async () => {
    const storage = new MemoryStorage();
    storage.setItem('fitfocus_data_user-1_diary', 'private diary');
    storage.setItem('fitfocus_data_user-1_diary__ffv', '4');
    storage.setItem('fitfocus.nutrition.selected-day.v1:user-1', '2026-08-29');
    storage.setItem('fitfocus.nutrition.selected-day.v1:user-1__ffv', '2');
    storage.setItem('fitfocus.achievements.counters.v1:user-1', '{"x":1}');
    storage.setItem('fitfocus.analytics.sent.v1:user-1', '["started"]');
    storage.setItem('fitfocus.analytics.sent.v1:user-10', '["7_days"]');
    storage.setItem(
      'fitfocus_usage_counters_v1:user-1',
      '{"weekStart":"2026-10-19","recipes":4}',
    );
    storage.setItem(
      'fitfocus_usage_counters_v1:user-10',
      '{"weekStart":"2026-10-19","recipes":9}',
    );
    storage.setItem('fitfocus.analytics.onboarding.v1', '[{"weight":72,"age":34}]');
    storage.setItem('fitfocus.analytics.wis_share.v1', '[{"meta":{"wis":81}}]');
    storage.setItem('fitfocus.analytics.food_streak.v1', '[{"meta":{"streak":7}}]');
    storage.setItem('ff_last_weekly_ai_attempt_user-1', '123');
    storage.setItem('ff_last_weekly_ai_attempt_user-10', 'keep prefix-collision sibling');
    storage.setItem('ff_weekly_ai_inflight_user-10', 'keep sibling');
    storage.setItem('ff_dev_plan_override_scope_user-10', 'keep sibling');
    storage.setItem('fitfocus_data_user-2_diary', 'keep this');
    storage.setItem('fitfocus.nutrition.selected-day.v1:user-2', 'keep this too');

    vi.stubGlobal('localStorage', storage);

    const result = await clearLocalUserData('user-1');
    expect(result).toMatchObject({
      complete: true,
      localStorageKeysRemoved: 11,
      localStorageCleared: true,
      indexedDbCleared: true,
      legacyEvidenceRetained: false,
    });
    expect(storage.getItem('fitfocus_data_user-1_diary')).toBeNull();
    expect(storage.getItem('fitfocus_data_user-1_diary__ffv')).toBeNull();
    expect(storage.getItem('fitfocus.nutrition.selected-day.v1:user-1')).toBeNull();
    expect(storage.getItem('fitfocus.nutrition.selected-day.v1:user-1__ffv')).toBeNull();
    expect(storage.getItem('fitfocus.achievements.counters.v1:user-1')).toBeNull();
    expect(storage.getItem('fitfocus.analytics.sent.v1:user-1')).toBeNull();
    expect(storage.getItem('fitfocus_usage_counters_v1:user-1')).toBeNull();
    expect(storage.getItem('fitfocus.analytics.onboarding.v1')).toBeNull();
    expect(storage.getItem('fitfocus.analytics.wis_share.v1')).toBeNull();
    expect(storage.getItem('fitfocus.analytics.food_streak.v1')).toBeNull();
    expect(storage.getItem('ff_last_weekly_ai_attempt_user-1')).toBeNull();
    expect(storage.getItem('fitfocus_data_user-2_diary')).toBe('keep this');
    expect(storage.getItem('fitfocus.nutrition.selected-day.v1:user-2')).toBe('keep this too');
    expect(storage.getItem('fitfocus.analytics.sent.v1:user-10')).toBe('["7_days"]');
    expect(storage.getItem('fitfocus_usage_counters_v1:user-10')).toBe(
      '{"weekStart":"2026-10-19","recipes":9}',
    );
    expect(storage.getItem('ff_last_weekly_ai_attempt_user-10')).toBe('keep prefix-collision sibling');
    expect(storage.getItem('ff_weekly_ai_inflight_user-10')).toBe('keep sibling');
    expect(storage.getItem('ff_dev_plan_override_scope_user-10')).toBe('keep sibling');
  });

  it('removes an encoded recipe usage counter for only the deleted account', async () => {
    const storage = new MemoryStorage();
    storage.setItem('fitfocus_usage_counters_v1:account%3Aone', '{"recipes":2}');
    storage.setItem('fitfocus_usage_counters_v1:account%3Aother', '{"recipes":8}');
    vi.stubGlobal('localStorage', storage);

    const result = await clearLocalUserData('account:one');

    expect(result.complete).toBe(true);
    expect(storage.getItem('fitfocus_usage_counters_v1:account%3Aone')).toBeNull();
    expect(storage.getItem('fitfocus_usage_counters_v1:account%3Aother')).toBe('{"recipes":8}');
  });

  it('clears every account-scoped local UI key without matching another account', async () => {
    const storage = new MemoryStorage();
    const accountId = 'privacy:owner/1';
    const siblingAccountId = `${accountId}0`;
    const accountKeys = [
      `fitfocus.nutrition.selected-day.v1:${accountId}`,
      `fitfocus.nutrition.camera-facing.v1:${accountId}`,
      `fitfocus.dashboard.new-weight.v1:${accountId}`,
      `fitfocus.dashboard.pdf-include-meal-log.v1:${accountId}`,
      `fitfocus.dashboard.mobile-more-open.v1:${accountId}`,
      `fitfocus.course.ui.v1:${accountId}`,
      `fitfocus.plan.ui.v1:${accountId}`,
      `fitfocus.plan.active-day.v1:${accountId}`,
      `fitfocus.progress.ui.v1:${accountId}`,
      `fitfocus.progress-archive.sections.v1:${accountId}`,
      `fitfocus.settings.ui.v1:${accountId}`,
      `fitfocus.nutrition.search.v1:${accountId}`,
      `fitfocus.analytics.sent.v1:${accountId}`,
      `fitfocus.achievements.counters.v1:${accountId}`,
      `fitfocus_usage_counters_v1:${encodeURIComponent(accountId)}`,
      `ff_last_weekly_ai_attempt_${accountId}`,
      `ff_weekly_ai_inflight_${accountId}`,
      `ff_dev_plan_override_scope_${accountId}`,
      `fitfocus_data_${accountId}_profile`,
    ];
    const siblingKeys = accountKeys.map((key) => key.startsWith('fitfocus_usage_counters_v1:')
      ? `fitfocus_usage_counters_v1:${encodeURIComponent(siblingAccountId)}`
      : key.replaceAll(accountId, siblingAccountId));

    for (const key of accountKeys) storage.setItem(key, 'private account data');
    for (const key of siblingKeys) storage.setItem(key, 'sibling account data');
    const versionedKey = `fitfocus.nutrition.selected-day.v1:${accountId}__ffv`;
    storage.setItem(versionedKey, '3');
    vi.stubGlobal('localStorage', storage);

    const result = await clearLocalUserData(accountId);

    expect(result).toMatchObject({
      complete: true,
      localStorageCleared: true,
      indexedDbCleared: true,
      legacyEvidenceRetained: false,
    });
    for (const key of accountKeys) expect(storage.getItem(key), key).toBeNull();
    for (const key of siblingKeys) expect(storage.getItem(key), key).toBe('sibling account data');
    expect(storage.getItem(versionedKey)).toBeNull();
  });

  it('does nothing for an empty user id', async () => {
    const storage = new MemoryStorage();
    storage.setItem('fitfocus_data_user-1_diary', 'keep');
    vi.stubGlobal('localStorage', storage);

    expect(await clearLocalUserData('')).toMatchObject({ complete: false, localStorageKeysRemoved: 0 });
    expect(storage.getItem('fitfocus_data_user-1_diary')).toBe('keep');
  });

  it('removes account data restored while the deletion tombstone is being written', async () => {
    const storage = new MemoryStorage();
    const accountId = 'restore-during-delete';
    const accountKey = `fitfocus_data_${accountId}_diary`;
    vi.stubGlobal('localStorage', storage);

    const originalOpen = userStateDatabase.open.bind(userStateDatabase);
    let signalOpenStarted!: () => void;
    let releaseOpen!: () => void;
    const openStarted = new Promise<void>((resolve) => { signalOpenStarted = resolve; });
    const openGate = new Promise<void>((resolve) => { releaseOpen = resolve; });
    vi.spyOn(userStateDatabase, 'open').mockImplementationOnce(async () => {
      signalOpenStarted();
      await openGate;
      return originalOpen();
    });

    const deletion = clearLocalUserData(accountId);
    await openStarted;

    // Model an old backup restore landing after the first localStorage sweep.
    storage.setItem(accountKey, 'stale private diary');
    releaseOpen();

    await expect(deletion).resolves.toMatchObject({
      complete: true,
      indexedDbCleared: true,
      localStorageCleared: true,
    });
    expect(storage.getItem(accountKey)).toBeNull();
  });

  it('rechecks legacy evidence written by an old tab during account cleanup', async () => {
    const storage = new MemoryStorage();
    const accountId = 'legacy-race-user';
    const accountKey = `fitfocus_data_${accountId}_diary`;
    storage.setItem('fitfocus.remote-kv-outbox.v1', JSON.stringify([
      { type: 'put', key: 'fitfocus_data_other-user_diary', value: 'unrelated' },
    ]));
    vi.stubGlobal('localStorage', storage);

    const originalOpen = userStateDatabase.open.bind(userStateDatabase);
    let signalOpenStarted!: () => void;
    let releaseOpen!: () => void;
    const openStarted = new Promise<void>((resolve) => { signalOpenStarted = resolve; });
    const openGate = new Promise<void>((resolve) => { releaseOpen = resolve; });
    vi.spyOn(userStateDatabase, 'open').mockImplementationOnce(async () => {
      signalOpenStarted();
      await openGate;
      return originalOpen();
    });

    const deletion = clearLocalUserData(accountId);
    await openStarted;
    storage.setItem('fitfocus.remote-kv-outbox.v1', JSON.stringify([
      { type: 'put', key: accountKey, value: 'legacy private diary from old tab' },
    ]));
    releaseOpen();

    await expect(deletion).resolves.toMatchObject({
      complete: false,
      localStorageCleared: true,
      indexedDbCleared: true,
      legacyEvidenceRetained: true,
    });
  });

  it('preserves a mixed-account legacy queue and reports retained account evidence', async () => {
    const storage = new MemoryStorage();
    const legacySource = JSON.stringify([
      { type: 'put', key: 'fitfocus_data_user-1_diary', value: 'target legacy value' },
      { type: 'put', key: 'fitfocus_data_user-2_diary', value: 'other account value' },
    ]);
    storage.setItem('fitfocus_data_user-1_diary', 'local value');
    storage.setItem('fitfocus.remote-kv-outbox.v1', legacySource);
    vi.stubGlobal('localStorage', storage);

    const result = await clearLocalUserData('user-1');

    expect(result).toMatchObject({
      complete: false,
      localStorageCleared: true,
      indexedDbCleared: true,
      legacyEvidenceRetained: true,
    });
    expect(storage.getItem('fitfocus_data_user-1_diary')).toBeNull();
    expect(storage.getItem('fitfocus.remote-kv-outbox.v1')).toBe(legacySource);
  });

  it('reports an unowned global legacy record as retained during account deletion', async () => {
    const storage = new MemoryStorage();
    const legacySource = JSON.stringify([
      { type: 'put', key: 'ff_ai_last_status_v1', value: 'possibly account-owned evidence' },
    ]);
    storage.setItem('fitfocus_data_user-1_diary', 'local value');
    storage.setItem('fitfocus.remote-kv-outbox.v1', legacySource);
    vi.stubGlobal('localStorage', storage);

    const result = await clearLocalUserData('user-1');

    expect(result).toMatchObject({
      complete: false,
      localStorageCleared: true,
      indexedDbCleared: true,
      legacyEvidenceRetained: true,
    });
    expect(storage.getItem('fitfocus_data_user-1_diary')).toBeNull();
    expect(storage.getItem('fitfocus.remote-kv-outbox.v1')).toBe(legacySource);
  });

  it('does not classify a clearly other-account legacy key as retained for this deletion', async () => {
    const storage = new MemoryStorage();
    const legacySource = JSON.stringify([
      { type: 'put', key: 'fitfocus_data_user-2_diary', value: 'other account value' },
    ]);
    storage.setItem('fitfocus.remote-kv-outbox.v1', legacySource);
    vi.stubGlobal('localStorage', storage);

    const result = await clearLocalUserData('user-1');

    expect(result).toMatchObject({
      complete: true,
      localStorageCleared: true,
      indexedDbCleared: true,
      legacyEvidenceRetained: false,
    });
    expect(storage.getItem('fitfocus.remote-kv-outbox.v1')).toBe(legacySource);
  });
});

describe('retired local telemetry cleanup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('removes old unscoped health telemetry and sent markers without touching app data', () => {
    const storage = new MemoryStorage();
    storage.setItem('fitfocus.analytics.onboarding.v1', '[{"weight":72,"age":34}]');
    storage.setItem('fitfocus.analytics.wis_share.v1', '[{"meta":{"wis":81}}]');
    storage.setItem('fitfocus.analytics.food_streak.v1', '[{"meta":{"streak":7}}]');
    storage.setItem('fitfocus.analytics.sent.v1:user-1', '["started"]');
    storage.setItem('fitfocus_data_user-1_profile', '{"weight":72}');
    storage.setItem('fitfocus.nutrition.selected-day.v1:user-1', '2026-10-17');
    vi.stubGlobal('localStorage', storage);

    expect(clearRetiredLocalTelemetry()).toBe(4);
    expect(storage.getItem('fitfocus.analytics.onboarding.v1')).toBeNull();
    expect(storage.getItem('fitfocus.analytics.wis_share.v1')).toBeNull();
    expect(storage.getItem('fitfocus.analytics.food_streak.v1')).toBeNull();
    expect(storage.getItem('fitfocus.analytics.sent.v1:user-1')).toBeNull();
    expect(storage.getItem('fitfocus_data_user-1_profile')).toBe('{"weight":72}');
    expect(storage.getItem('fitfocus.nutrition.selected-day.v1:user-1')).toBe('2026-10-17');
  });
});
