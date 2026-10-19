import { describe, expect, it } from 'vitest';
import {
  accountSessionRenderKey,
  createAccountScopedUiUpdater,
  getAccountScopedUiStateValue,
  getAccountScopedUiValue,
  updateAccountScopedUiState,
} from '../features/state/accountScopedUi';

describe('account-scoped UI state visibility', () => {
  it('changes stateful screen identity when account or login session changes', () => {
    const accountA = { accountId: 'user-a', sessionEpoch: 'epoch-a', serverSessionId: 'a'.repeat(64), authFence: 1 };
    const accountB = { accountId: 'user-b', sessionEpoch: 'epoch-b', serverSessionId: 'b'.repeat(64), authFence: 2 };
    const newSessionA = { ...accountA, serverSessionId: 'c'.repeat(64), authFence: 3 };

    expect(accountSessionRenderKey(accountA, 'user-a')).not.toBe(accountSessionRenderKey(accountB, 'user-b'));
    expect(accountSessionRenderKey(accountA, 'user-a')).not.toBe(accountSessionRenderKey(newSessionA, 'user-a'));
    expect(accountSessionRenderKey(null, 'user-a')).not.toBe(accountSessionRenderKey(null, 'user-b'));
  });

  it('keeps local screen identity across an auth fence change within the same session', () => {
    const beforePause = { accountId: 'user-a', sessionEpoch: 'epoch-a', serverSessionId: 'a'.repeat(64), authFence: 1 };
    const afterPause = { ...beforePause, authFence: 2 };

    expect(accountSessionRenderKey(beforePause, 'user-a')).toBe(accountSessionRenderKey(afterPause, 'user-a'));
  });

  it('does not expose a prior profile weight draft or search query before hydration', () => {
    const accountA = 'fitfocus.dashboard.new-weight.v1:user-a';
    const accountB = 'fitfocus.dashboard.new-weight.v1:user-b';

    expect(getAccountScopedUiValue(accountB, accountA, '68.5', '')).toBe('');
    expect(getAccountScopedUiValue(
      'fitfocus.nutrition.search.v1:user-b',
      'fitfocus.nutrition.search.v1:user-a',
      { query: 'аллергены и исключения', open: true },
      { query: '', open: false },
    )).toEqual({ query: '', open: false });
  });

  it('hides transient UI state and starts empty after an account or session change', () => {
    const accountA = { scopeKey: 'account-a:session-1', value: 'draft from A' };
    expect(getAccountScopedUiStateValue(accountA, 'account-b:session-1', '')).toBe('');

    const accountB = updateAccountScopedUiState(accountA, 'account-b:session-1', 'draft from B', '');
    expect(accountB).toEqual({ scopeKey: 'account-b:session-1', value: 'draft from B' });
    expect(accountA.value).toBe('draft from A');

    const newSessionA = updateAccountScopedUiState(accountA, 'account-a:session-2', 'new draft', '');
    expect(newSessionA).toEqual({ scopeKey: 'account-a:session-2', value: 'new draft' });
  });

  it('does not revive a private root overlay after logout or a different login session', () => {
    const accountAInsight = {
      id: 'food-a',
      photo: 'data:image/jpeg;base64,account-a',
      name: 'Блюдо аккаунта A',
    };
    const state = { scopeKey: 'account-a:session-1', value: accountAInsight };

    expect(getAccountScopedUiStateValue(state, null, null)).toBeNull();
    expect(getAccountScopedUiStateValue(state, 'account-b:session-1', null)).toBeNull();
    expect(getAccountScopedUiStateValue(state, 'account-a:session-2', null)).toBeNull();

    const signedOut = updateAccountScopedUiState(state, null, null, null);
    expect(signedOut).toBe(state);
    expect(state.value).toBe(accountAInsight);
  });

  it('hides profile-sync and adaptation notes outside their owning login session', () => {
    const state = {
      scopeKey: 'account-a:session-1',
      value: {
        profileSync: 'Профиль аккаунта A обновлён из облака.',
        adaptation: 'С учётом динамики веса аккаунта A рекомендуется изменить план питания.',
      },
    };

    expect(getAccountScopedUiStateValue(state, null, { profileSync: null, adaptation: '' }))
      .toEqual({ profileSync: null, adaptation: '' });
    expect(getAccountScopedUiStateValue(
      state,
      'account-b:session-1',
      { profileSync: null, adaptation: '' },
    )).toEqual({ profileSync: null, adaptation: '' });
    expect(getAccountScopedUiStateValue(
      state,
      'account-a:session-2',
      { profileSync: null, adaptation: '' },
    )).toEqual({ profileSync: null, adaptation: '' });
  });

  it('does not show a health registration draft to a different Google identity', () => {
    const defaults = {
      weight: 70,
      medicalRestrictions: '',
      bloodGlucoseMmolL: 0,
    };
    const state = {
      scopeKey: 'registration:google-account-a',
      value: {
        weight: 98.5,
        medicalRestrictions: 'персональные данные аккаунта A',
        bloodGlucoseMmolL: 6.2,
      },
    };

    expect(getAccountScopedUiStateValue(state, null, defaults)).toEqual(defaults);
    expect(getAccountScopedUiStateValue(state, 'registration:google-account-b', defaults))
      .toEqual(defaults);
  });

  it('does not accept transient UI updates while no account session is active', () => {
    const previous = { scopeKey: 'account-a:session-1', value: 'private draft' };
    expect(getAccountScopedUiStateValue(previous, null, '')).toBe('');
    expect(updateAccountScopedUiState(previous, null, 'new value', '')).toBe(previous);
  });

  it('exposes the hydrated value only in its exact storage scope', () => {
    const state = { query: 'овсянка', open: true };
    const key = 'fitfocus.nutrition.search.v1:user-a';

    expect(getAccountScopedUiValue(key, key, state, { query: '', open: false })).toBe(state);
    expect(getAccountScopedUiValue(null, key, state, { query: '', open: false })).toEqual({ query: '', open: false });
  });

  it('hides a matching cache until the durable account session is confirmed', () => {
    const key = 'fitfocus.dashboard.new-weight.v1:user-a';
    expect(getAccountScopedUiValue(key, key, '98.765', '', false)).toBe('');
  });

  it('discards a queued setter when its account scope changes before React applies it', () => {
    let activeStorageKey: string | null = 'fitfocus.dashboard.new-weight.v1:user-a';
    const updater = createAccountScopedUiUpdater(
      activeStorageKey,
      () => activeStorageKey,
      previous => `${previous}1`,
    );

    expect(updater('7')).toBe('71');
    activeStorageKey = 'fitfocus.dashboard.new-weight.v1:user-b';
    expect(updater('7')).toBe('7');
  });

  it('discards a queued setter when the durable account-session gate closes', () => {
    let enabled = true;
    const key = 'fitfocus.dashboard.new-weight.v1:user-a';
    const updater = createAccountScopedUiUpdater(
      key,
      () => key,
      previous => `${previous}1`,
      () => enabled,
    );

    expect(updater('7')).toBe('71');
    enabled = false;
    expect(updater('7')).toBe('7');
  });
});
