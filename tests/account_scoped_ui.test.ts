import { describe, expect, it } from 'vitest';
import { createAccountScopedUiUpdater, getAccountScopedUiValue } from '../features/state/accountScopedUi';

describe('account-scoped UI state visibility', () => {
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

  it('exposes the hydrated value only in its exact storage scope', () => {
    const state = { query: 'овсянка', open: true };
    const key = 'fitfocus.nutrition.search.v1:user-a';

    expect(getAccountScopedUiValue(key, key, state, { query: '', open: false })).toBe(state);
    expect(getAccountScopedUiValue(null, key, state, { query: '', open: false })).toEqual({ query: '', open: false });
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
});
