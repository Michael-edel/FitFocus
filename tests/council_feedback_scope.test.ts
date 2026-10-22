import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CouncilScreen from '../CouncilScreen';
import { useCouncilChat } from '../useCouncilChat';
import { authenticatedAccountSessionScope, getAccountScopedUiStateValue, updateAccountScopedUiState } from '../features/state/accountScopedUi';
import type { OutboxReadGuard } from '../storage/durableOutbox';
import type { UserProfile } from '../types';

const guard: OutboxReadGuard = { accountId: 'a', sessionEpoch: 'epoch', serverSessionId: 'session', authFence: 1 };
const user = { id: 'a' } as UserProfile;

describe('Council history clear readiness', () => {
  it.each([
    [false, guard, false],
    [true, null, false],
    [true, { ...guard, accountId: 'b' }, false],
    [true, guard, true],
  ] as const)('renders the same readiness as the history handler: cache=%s guard=%s', (allowCachedUiStateRestore, loginGuard, enabled) => {
    function Screen() {
      const council = useCouncilChat({ currentUser: user, foodDiary: [], habits: [], loginGuard,
        isCurrentSession: () => true, allowCachedUiStateRestore });
      return React.createElement(CouncilScreen, { ...council,
        canClearHistory: council.canClearCouncilHistory, onClearHistory: council.clearCouncilHistory });
    }
    const markup = renderToStaticMarkup(React.createElement(Screen));
    const clearButton = markup.match(/<button[^>]*type="button"[^>]*>/)?.[0];
    expect(clearButton).toBeDefined();
    expect(clearButton?.includes('disabled=""')).toBe(!enabled);
    expect(clearButton?.includes('title=')).toBe(!enabled);
  });
});

describe('profile sync feedback scope', () => {
  it('accepts feedback while cache restoration is paused and keeps it across an auth fence refresh', () => {
    const scope = authenticatedAccountSessionScope(guard, user.id);
    const state = updateAccountScopedUiState<string | null>({ scopeKey: scope, value: null }, scope, 'Profile refreshed', null);
    const reconciledScope = authenticatedAccountSessionScope({ ...guard, authFence: 2 }, user.id);
    expect(getAccountScopedUiStateValue(state, reconciledScope, null)).toBe('Profile refreshed');
  });

  it('hides feedback on logout, mismatched account, and a new login session', () => {
    const state = { scopeKey: authenticatedAccountSessionScope(guard, user.id), value: 'Profile refreshed' };
    for (const scope of [
      authenticatedAccountSessionScope(null, user.id),
      authenticatedAccountSessionScope(guard, 'b'),
      authenticatedAccountSessionScope(guard, null),
      authenticatedAccountSessionScope({ ...guard, sessionEpoch: 'new' }, user.id),
      authenticatedAccountSessionScope({ ...guard, serverSessionId: 'new' }, user.id),
    ]) expect(getAccountScopedUiStateValue(state, scope, null)).toBeNull();
  });
});
