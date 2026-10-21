import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAiActivity, selectAiActivityForAccount } from '../features/ai/useAiActivityStatus';
import { getLastAiAction, readAiStatus, setAiStorageScope, setLastAiAction } from '../geminiService';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('AI activity status feature', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    setAiStorageScope(null);
  });

  afterEach(() => {
    setAiStorageScope(null);
    vi.unstubAllGlobals();
  });

  it('keeps a readable retry action when the status record is damaged', () => {
    expect(readAiActivity(
      () => { throw new Error('bad status'); },
      () => ({ feature: 'personal_plan', type: 'plan', userId: 'user-1' }),
    )).toEqual({
      aiStatus: null,
      lastAiAction: { feature: 'personal_plan', type: 'plan', userId: 'user-1' },
    });
  });

  it('keeps a readable status when retry metadata is damaged', () => {
    const status = { ts: 1, feature: 'coach_advice', source: 'live' as const };
    expect(readAiActivity(
      () => status,
      () => { throw new Error('bad action'); },
    )).toEqual({ aiStatus: status, lastAiAction: null });
  });

  it('reads AI activity only from the requested account scope', () => {
    const statusA = { ts: 10, feature: 'coach_advice', source: 'live' };
    storage.setItem('fitfocus_data_account-a_ai_last_status_v1', JSON.stringify(statusA));
    storage.setItem('fitfocus_data_account-a_ai_last_action_v1', JSON.stringify({
      feature: 'coach_advice', type: 'coach', userId: 'account-a', actionId: 'action-a',
    }));

    expect(readAiStatus('account-a')).toEqual(statusA);
    expect(readAiStatus('account-b')).toBeNull();
    expect(getLastAiAction('account-a')).toEqual({
      feature: 'coach_advice', type: 'coach', userId: 'account-a', actionId: 'action-a',
    });
    expect(getLastAiAction('account-b')).toBeNull();
    expect(readAiActivity(() => readAiStatus('account-b'), () => getLastAiAction('account-b')))
      .toEqual({ aiStatus: null, lastAiAction: null });
  });

  it('writes retry metadata by its owner even before the active scope changes', () => {
    const action = { feature: 'personal_plan', type: 'plan', userId: 'new-account', actionId: 'registration' };
    setAiStorageScope(null);

    setLastAiAction(action);

    expect(storage.getItem('fitfocus_data_new-account_ai_last_action_v1')).toBe(JSON.stringify(action));
    expect(storage.getItem('ai_last_action_v1')).toBeNull();
    expect(getLastAiAction('new-account')).toEqual(action);
  });

  it('keeps the default readers account-scoped and never uses global records for an empty account id', () => {
    const actionA = { feature: 'coach_advice', type: 'coach', userId: 'account-a' };
    setLastAiAction(actionA);
    setAiStorageScope('account-a');
    expect(getLastAiAction()).toEqual(actionA);
    setAiStorageScope('account-b');
    expect(getLastAiAction()).toBeNull();
    storage.setItem('ai_last_action_v1', JSON.stringify(actionA));

    expect(getLastAiAction('')).toBeNull();
    expect(readAiStatus('')).toBeNull();
  });

  it('accepts a legacy unscoped retry only when its stored owner matches', () => {
    const actionA = { feature: 'personal_plan', type: 'plan', userId: 'account-a' };
    storage.setItem('ai_last_action_v1', JSON.stringify(actionA));

    expect(getLastAiAction('account-a')).toEqual(actionA);
    expect(getLastAiAction('account-b')).toBeNull();
    expect(readAiStatus('account-a')).toBeNull();
  });

  it('suppresses the previous account snapshot immediately during a scope transition', () => {
    const activity = { aiStatus: null, lastAiAction: { feature: 'personal_plan', type: 'plan', userId: 'account-a' } };
    expect(selectAiActivityForAccount({ accountId: 'account-a', activity }, 'account-b'))
      .toEqual({ aiStatus: null, lastAiAction: null });
    expect(selectAiActivityForAccount({ accountId: 'account-b', activity: { aiStatus: null, lastAiAction: null } }, 'account-b'))
      .toEqual({ aiStatus: null, lastAiAction: null });
  });
});
