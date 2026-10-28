import { setPurchasedCheckbox } from './support/shoppingInteractions';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';
import { confirmedConfiguration, planningDay, planningRoster } from './support/familyPlanningFixture';
import { navigate, saved, preview as previewDay } from './support/familyHarness';
import { deriveLegacyFamilyMenu, type PlannedFamilyMenu } from '../domain/familyPlanning';

const accountA = { id: 'family-callback-account-a', sid: 'a'.repeat(64), name: 'Семья A' };
const accountB = { id: 'family-callback-account-b', sid: 'b'.repeat(64), name: 'Семья B' };
type Account = typeof accountA;
type FixtureState = {
  current: Account;
  familyId?: string;
  inviteRequests: number;
  inviteTargetIds: string[];
  inviteSessionIds?: string[];
  releasedInvites: number;
  shoppingCheckRequests: number;
  shoppingCheckAccounts: string[];
  shoppingCheckSessions?: string[];
  shoppingCheckFamilyIds?: string[];
  releasedShoppingChecks: number;
  failShoppingCheckRequest?: number;
  failedShoppingCheckRequests?: number;
  personalShoppingListRequests: number;
  personalShoppingListAccounts: string[];
  releasedPersonalShoppingLists: number;
  rejectedPersonalShoppingLists: number;
  personalShoppingCheckRequests: number;
  personalShoppingCheckAccounts: string[];
  personalShoppingCheckValues?: boolean[];
  personalShoppingCheckCommits?: boolean[];
  personalShoppingCheckedByAccount?: Record<string, boolean>;
  rejectedPersonalShoppingChecks: number;
  shoppingAchievements: string[];
  memberRequests: number;
  memberTargetIds: string[];
  memberSessionIds?: string[];
  releasedMembers: number;
  noFamilyForA?: boolean;
  joinRequests?: number;
  joinSessionIds?: string[];
  releasedJoins?: number;
  createRequests?: number;
  createSessionIds?: string[];
  releasedCreates?: number;
  familyJoinAchievements?: string[];
  familyLoadAccounts?: string[];
  familyLoadSessions?: string[];
  releasedFamilyContexts?: number;
  familyShoppingListRequests?: number;
  familyShoppingListAccounts?: string[];
  familyShoppingListSessions?: string[];
  familyShoppingListNamesBySession?: Record<string, string>;
  familyShoppingChecked?: boolean;
  releasedFamilyShoppingLists?: number;
  familyMenuSessions?: string[];
  familyMenuNamesBySession?: Record<string, string>;
  releasedFamilyMenus?: number;
  supportListAccounts?: string[];
  releasedSupportLists?: number;
  supportAttachmentRequests?: Array<{ account: string | undefined; session: string | undefined }>;
  mobileTokenAccounts?: string[];
  releasedMobileTokens?: number;
  pushStatusAccounts?: string[];
  pushStatusSessions?: string[];
  pushStatusLastErrors?: Record<string, string>;
  releasedPushStatuses?: number;
  billingCheckoutAccounts?: string[];
  releasedBillingCheckouts?: number;
  plans?: Record<string, 'free' | 'pro' | 'family'>;
  planningMenus?: Record<string, { version: number; menu: PlannedFamilyMenu }>;
  familyPurchaseMutations?: Array<{ account: string; session: string; familyId: string; baseVersion: number; menu: PlannedFamilyMenu }>;
  profileWrites?: string[];
  holdFamilyPreview?: boolean;
  previewSessions?: string[];
  releasedPreviews?: number;
  planningCommits?: string[];
};

function newState(overrides: Partial<FixtureState> = {}): FixtureState {
  return { current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    ...overrides };
}

function profileFor(account: Account, includePersonalShopping = false, plan: 'free' | 'pro' | 'family' = 'family') {
  const profile = buildMockProfile();
  return {
    ...profile,
    id: account.id,
    googleSub: account.id,
    name: account.name,
    email: `${account.id}@example.test`,
    plan,
    ...(includePersonalShopping ? {
      aiPlan: {
        ...profile.aiPlan,
        weeklyMenu: {
          weekStart: '2026-10-12',
          days: Array.from({ length: 7 }, (_, index) => ({
            day: `День ${index + 1}`, breakfast: 'Овсянка', lunch: 'Курица', dinner: 'Рыба', snack: 'Йогурт',
          })),
          shoppingList: [`Меню ${account.id}`],
          shoppingListItems: [{ name: `Меню ${account.id}`, grams: 700 }],
        },
      },
    } : {}),
  };
}

function scopedHeaders(account: Account) {
  return {
    'X-FitFocus-State-Account': account.id,
    'X-FitFocus-State-Session': account.sid,
    'X-FitFocus-State-Protocol': '2',
    'X-FitFocus-State-Guard': '1',
    'X-FitFocus-Profile-Protocol': '1',
    'X-FitFocus-Profile-Guard': '1',
    'X-FitFocus-Bootstrap-Protocol': '1',
    'X-FitFocus-Bootstrap-Guard': '1',
    'X-FitFocus-Achievements-Protocol': '1',
    'X-FitFocus-Achievements-Guard': '1',
    'X-FitFocus-AI-Protocol': '1',
    'X-FitFocus-AI-Guard': '1',
    'X-FitFocus-Weekly-Menu-Protocol': '1',
    'X-FitFocus-Weekly-Menu-Guard': '1',
    'X-FitFocus-Family-Protocol': '1',
    'X-FitFocus-Family-Guard': '1',
    'X-FitFocus-Family-Menu-Protocol': '1',
    'X-FitFocus-Family-Menu-Guard': '1',
    'X-FitFocus-Support-Protocol': '1',
    'X-FitFocus-Support-Guard': '1',
    'X-FitFocus-Mobile-Token-Protocol': '1',
    'X-FitFocus-Mobile-Token-Guard': '1',
    'X-FitFocus-Push-Protocol': '1',
    'X-FitFocus-Push-Guard': '1',
    'X-FitFocus-Billing-Protocol': '1',
    'X-FitFocus-Billing-Guard': '1',
  };
}

function apiBody(account: Account, includePersonalShopping = false, plan: 'free' | 'pro' | 'family' = 'family') {
  return {
    user: { sub: account.id, roles: ['user'] },
    hasAccess: true,
    stateSync: { protocol: 2, guard: 1, accountId: account.id, sessionId: account.sid },
    bootstrapSync: { protocol: 1, guard: 1 },
    profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 },
    aiSync: { protocol: 1, guard: 1 },
    weeklyMenuSync: { protocol: 1, guard: 1 },
    achievementSync: { protocol: 1, guard: 1 },
    huaweiSync: { protocol: 1, guard: 1 },
    billingSync: { protocol: 1, guard: 1 },
    pushSync: { protocol: 1, guard: 1 },
    familySync: { protocol: 1, guard: 1, target: 1 },
    familyMenuSync: { protocol: 1, guard: 1, cas: 1 },
    familyPlanning: { version: 1 },
    profile: profileFor(account, includePersonalShopping, plan),
  };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function installAccountApi(
  page: Page,
  state: FixtureState,
  holdInvite: boolean,
  errors: string[],
  holdShoppingCheck = false,
  holdMemberUpdate = false,
  includePersonalShopping = false,
  holdPersonalShoppingList = false,
  holdJoin = false,
  holdCreate = false,
  holdFamilyContext = false,
  holdFamilyShoppingList = false,
  holdSupportList = false,
  holdMobileToken = false,
  holdPushStatus = false,
  holdBillingCheckout = false,
  holdFamilyMenu = false,
) {
  await mockApp(page, { session: 'app' });
  if (holdMobileToken) {
    await page.addInitScript(() => {
      const target = window as typeof window & { __fitfocusClipboardWrites?: string[] };
      target.__fitfocusClipboardWrites = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value: string) => { target.__fitfocusClipboardWrites?.push(value); } },
      });
    });
  }
  const heldInvite = deferred();
  const heldShoppingCheckResponse = deferred();
  const heldPersonalShoppingListResponse = deferred();
  const heldMemberResponse = deferred();
  const heldJoinResponse = deferred();
  const heldCreateResponse = deferred();
  const heldFamilyContextResponse = deferred();
  const heldFamilyShoppingListResponse = deferred();
  const heldFamilyMenuResponse = deferred();
  const heldFamilyPreviewResponse = deferred();
  const heldSupportListResponse = deferred();
  const heldMobileTokenResponse = deferred();
  const heldPushStatusResponse = deferred();
  const heldBillingCheckoutResponse = deferred();
  const meSessionIds: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const requestedAccount = request.headers()['x-fitfocus-state-account'];
    const requestedSession = request.headers()['x-fitfocus-state-session'];
    const scopedAccount = [accountA, accountB].find(account => account.id === requestedAccount
      && account.sid === requestedSession) ?? state.current;
    const json = (body: unknown, account = scopedAccount, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: scopedHeaders(account),
      body: JSON.stringify(body),
    });

    if (path === '/api/env') return json({ requireInvite: false }, state.current);
    if (path === '/api/me') {
      meSessionIds.push(state.current.sid);
      return json(apiBody(state.current, includePersonalShopping,
        state.plans?.[state.current.id] ?? 'family'), state.current);
    }
    if (path === '/api/bootstrap') return json({ user: { sub: state.current.id }, profile: profileFor(state.current,
      includePersonalShopping, state.plans?.[state.current.id] ?? 'family'), items: [] }, state.current);
    if (path === '/api/profile') {
      if (request.method() === 'PUT') (state.profileWrites ??= []).push(scopedAccount.id);
      return json({ profile: profileFor(scopedAccount), version: 1 });
    }
    if (path === '/api/state') {
      if (request.method() === 'GET') return json({ items: [] });
      const items = (request.postDataJSON()?.items ?? []) as Array<{ key: string; baseVersion: number }>;
      expect(items.every(item => !item.key.includes('_family_menu:'))).toBe(true);
      return json({ ok: true, items: items.map(item => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    }
    if (path === '/api/achievements/check') {
      const body = request.postDataJSON() as { context?: { source?: unknown } } | null;
      if (body?.context?.source === 'shopping_item_checked') state.shoppingAchievements.push(scopedAccount.id);
      if (body?.context?.source === 'family_join_or_create') (state.familyJoinAchievements ??= []).push(scopedAccount.id);
      return json({ enabled: true, catalog: [], unlocked: [], newlyUnlocked: [] });
    }
    if (path === '/api/achievements') return json({ enabled: true, catalog: [], unlocked: [], newlyUnlocked: [] });
    if (path === '/api/ai') return json({ text: 'Тестовая интерпретация.' });
    if (path === '/api/logout') return json({ ok: true });
    if (path === '/api/mobile/token' && request.method() === 'POST') {
      (state.mobileTokenAccounts ??= []).push(scopedAccount.id);
      if (holdMobileToken && scopedAccount.id === accountA.id) {
        await heldMobileTokenResponse.promise;
        state.releasedMobileTokens = (state.releasedMobileTokens ?? 0) + 1;
        return json({ token: 'account-a-mobile-token-secret', expiresAt: Date.now() + 60_000 }, accountA);
      }
      return json({ token: `mobile-token-${scopedAccount.id}`, expiresAt: Date.now() + 60_000 });
    }
    if (path === '/api/push/status' && request.method() === 'GET') {
      expect(requestedAccount).toBe(scopedAccount.id);
      expect(requestedSession).toBe(scopedAccount.sid);
      (state.pushStatusAccounts ??= []).push(scopedAccount.id);
      (state.pushStatusSessions ??= []).push(requestedSession ?? '');
      const status = {
        configured: true,
        vapid_public_key: 'mock-public-key',
        current_subscription_id: `push-${scopedAccount.id}`,
        current_browser_label: 'Тестовый браузер',
        count: 1,
        subscriptions: [{
          id: `push-${scopedAccount.id}`,
          device_label: 'Тестовое устройство',
          user_agent: 'Playwright',
          last_error: state.pushStatusLastErrors?.[requestedSession ?? '']
            ?? (scopedAccount.id === accountA.id ? 'ACCOUNT_A_PUSH_STATUS_ONLY' : 'ACCOUNT_B_PUSH_STATUS_ONLY'),
        }],
      };
      if (holdPushStatus && scopedAccount.id === accountA.id) {
        await heldPushStatusResponse.promise;
        state.releasedPushStatuses = (state.releasedPushStatuses ?? 0) + 1;
        return json(status, accountA);
      }
      return json(status);
    }
    if (path === '/api/billing/checkout' && request.method() === 'POST') {
      (state.billingCheckoutAccounts ??= []).push(scopedAccount.id);
      if (holdBillingCheckout && scopedAccount.id === accountA.id) {
        await heldBillingCheckoutResponse.promise;
        state.releasedBillingCheckouts = (state.releasedBillingCheckouts ?? 0) + 1;
        return json({ url: 'https://checkout.stripe.com/c/pay/account-a' }, accountA);
      }
      return json({ url: `https://checkout.stripe.com/c/pay/${scopedAccount.id}` });
    }
    if (path === '/api/support/attachment') {
      state.supportAttachmentRequests?.push({ account: requestedAccount, session: requestedSession });
      expect(requestedAccount).toBe(scopedAccount.id);
      expect(requestedSession).toBe(scopedAccount.sid);
      return route.fulfill({
        status: 200,
        headers: {
          ...scopedHeaders(scopedAccount),
          'Content-Type': 'image/gif',
          'X-FitFocus-Support-Attachment-Protocol': '1',
          'X-FitFocus-Support-Attachment-Guard': '1',
        },
        body: Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64'),
      });
    }
    if (path === '/api/support/feedback/my') {
      expect(requestedAccount).toBe(scopedAccount.id);
      expect(requestedSession).toBe(scopedAccount.sid);
      const ticketId = `ticket-${scopedAccount.id}`;
      const hasAttachmentFixture = state.supportAttachmentRequests !== undefined;
      const ticket = {
        id: ticketId,
        created_at: 1,
        updated_at: 1,
        category: 'Ошибка',
        section: 'Обзор',
        subject: `Обращение ${scopedAccount.id === accountA.id ? 'A' : 'B'}`,
        message: `Секретное обращение ${scopedAccount.id}`,
        status: 'new',
        priority: 'normal',
        attachment_count: hasAttachmentFixture ? 2 : 0,
        ...(hasAttachmentFixture ? {
          attachments: [{ name: 'ticket-evidence.gif', mime: 'image/gif', size: 26, kind: 'photo',
            data_url: `/api/support/attachment?id=${encodeURIComponent(ticketId)}&index=0` }],
          messages: [{ id: 'message-1', author_role: 'admin', author_user_id: 'support-agent',
            message: 'Ответ с файлом', created_at: 2, attachment_count: 1,
            attachments: [{ name: 'reply-evidence.gif', mime: 'image/gif', size: 26, kind: 'photo',
              data_url: `/api/support/attachment?id=${encodeURIComponent(ticketId)}&messageId=message-1&index=0` }] }],
        } : { messages: [] }),
      };
      if (request.method() === 'GET' && !url.searchParams.has('id')) {
        (state.supportListAccounts ??= []).push(scopedAccount.id);
        if (holdSupportList && scopedAccount.id === accountA.id) {
          await heldSupportListResponse.promise;
          state.releasedSupportLists = (state.releasedSupportLists ?? 0) + 1;
          return json({ tickets: [ticket] }, accountA);
        }
        return json({ tickets: [ticket] });
      }
      if (request.method() === 'GET') return json({ ticket });
      return json({ ticket, ok: true });
    }
    if (path === '/api/support/feedback' && request.method() === 'POST') {
      return json({ ok: true, id: `ticket-${scopedAccount.id}` });
    }
    if (path.startsWith('/api/family') || path.startsWith('/api/shopping')) {
      expect(requestedAccount).toBe(scopedAccount.id);
      expect(requestedSession).toBe(scopedAccount.sid);
    }
    if (path === '/api/family') {
      if (request.method() === 'POST') {
        state.createRequests = (state.createRequests ?? 0) + 1;
        (state.createSessionIds ??= []).push(requestedSession ?? '');
        if (holdCreate && scopedAccount.id === accountA.id) {
          await heldCreateResponse.promise;
          state.releasedCreates = (state.releasedCreates ?? 0) + 1;
          return json({ ok: true }, accountA);
        }
        return json({ ok: true });
      }
      if (request.method() === 'GET') {
        (state.familyLoadAccounts ??= []).push(scopedAccount.id);
        (state.familyLoadSessions ??= []).push(requestedSession ?? '');
        if (holdFamilyContext && scopedAccount.id === accountA.id) {
          await heldFamilyContextResponse.promise;
          state.releasedFamilyContexts = (state.releasedFamilyContexts ?? 0) + 1;
          return json({ family: { id: `family-${accountA.id}`, name: accountA.name, owner_user_id: accountA.id },
            members: [{ user_id: accountA.id, name: accountA.name, role: 'owner', goal: 'MAINTAIN' }] }, accountA);
        }
        if (state.noFamilyForA && scopedAccount.id === accountA.id) return json({ family: null, members: [] }, accountA);
      }
      const familyId = state.familyId ?? `family-${scopedAccount.id}`;
      const familyName = state.familyId ? `Семья ${state.familyId}` : scopedAccount.name;
      return json({
      family: { id: familyId, name: familyName, owner_user_id: scopedAccount.id },
      members: [{ user_id: scopedAccount.id, name: scopedAccount.name, role: 'owner', goal: 'MAINTAIN' }],
    });
    }
    const targetFamily = state.familyId && scopedAccount.id === state.current.id ? state.familyId : `family-${scopedAccount.id}`;
    if (path === '/api/family/dining-profiles') return json({ roster: planningRoster(url.searchParams.get('familyId') ?? targetFamily, scopedAccount.id) });
    if (path === '/api/family/dining-profile') {
      const body = request.method() === 'GET' ? null : request.postDataJSON();
      const familyId = body?.familyId ?? url.searchParams.get('familyId') ?? targetFamily;
      const roster = planningRoster(familyId, scopedAccount.id);
      const profile = { ...roster.profiles[0], configuration: body?.profile ?? confirmedConfiguration };
      if (request.method() === 'PATCH') {
        state.memberRequests += 1; state.memberTargetIds.push(familyId); state.memberSessionIds?.push(requestedSession ?? '');
        if (holdMemberUpdate && scopedAccount.id === accountA.id) await heldMemberResponse.promise;
        await json({ ok: true, profile: { ...profile, version: 2 }, rosterVersion: 2,
          roster: { ...roster, rosterVersion: 2, profiles: [{ ...roster.profiles[0], version: 2 }] } });
        if (holdMemberUpdate && scopedAccount.id === accountA.id) state.releasedMembers += 1;
        return;
      }
      return json({ profile });
    }
    if (path === '/api/family/menu/state') {
      const date = url.searchParams.get('week') ?? request.postDataJSON()?.weekStart;
      const body = request.method() === 'PUT' ? request.postDataJSON() : null;
      const familyId = body?.familyId ?? url.searchParams.get('familyId') ?? targetFamily;
      const sessionId = requestedSession ?? '';
      // Keep generations separate across account, session, family and exact day.
      const key = JSON.stringify([scopedAccount.id, sessionId, familyId, date]);
      const initial = planningDay(scopedAccount.id, date);
      const marker = state.familyShoppingListNamesBySession?.[sessionId] ?? state.familyMenuNamesBySession?.[sessionId]
        ?? `Семейный список ${scopedAccount.id === accountA.id ? 'A' : 'B'}`;
      const entry = (state.planningMenus ??= {})[key] ??= { version: 1, menu: deriveLegacyFamilyMenu({ ...initial.planningV1,
        manualItems: [{ id: 'manual:session-marker', name: marker, unit: 'g', quantity: 400, purchasedQuantity: 0 }] }) };
      if (request.method() === 'GET') {
        (state.familyMenuSessions ??= []).push(sessionId);
        state.familyShoppingListRequests = (state.familyShoppingListRequests ?? 0) + 1;
        (state.familyShoppingListAccounts ??= []).push(scopedAccount.id);
        (state.familyShoppingListSessions ??= []).push(sessionId);
        if (holdFamilyMenu && requestedSession === accountA.sid && scopedAccount.id === accountA.id) {
          await heldFamilyMenuResponse.promise; state.releasedFamilyMenus = (state.releasedFamilyMenus ?? 0) + 1;
        }
        if (holdFamilyShoppingList && scopedAccount.id === accountA.id) {
          await heldFamilyShoppingListResponse.promise; state.releasedFamilyShoppingLists = (state.releasedFamilyShoppingLists ?? 0) + 1;
        }
      } else if (body.mutationKind === 'planning') {
        (state.planningCommits ??= []).push(sessionId);
        expect(body.baseVersion).toBe(entry.version);
        entry.menu = body.menu; entry.version += 1;
      } else {
        expect(body.mutationKind).toBe('purchases');
        state.shoppingCheckRequests += 1; state.shoppingCheckAccounts.push(scopedAccount.id);
        state.shoppingCheckSessions?.push(sessionId); state.shoppingCheckFamilyIds?.push(familyId);
        (state.familyPurchaseMutations ??= []).push({ account: scopedAccount.id, session: sessionId, familyId, baseVersion: body.baseVersion, menu: body.menu });
        if (state.failShoppingCheckRequest !== undefined && state.shoppingCheckRequests >= state.failShoppingCheckRequest) {
          state.failedShoppingCheckRequests = (state.failedShoppingCheckRequests ?? 0) + 1;
          return json({ error: 'SHOPPING_UPDATE_FAILED' }, scopedAccount, 503);
        }
        if (holdShoppingCheck && scopedAccount.id === accountA.id) {
          await heldShoppingCheckResponse.promise; state.releasedShoppingChecks += 1;
        }
        // A held request retains its captured target; it never mutates the current login's generation.
        expect(body.baseVersion).toBe(entry.version);
        entry.menu = body.menu; entry.version += 1;
      }
      return json({ ok: true, snapshot: { familyId, weekStart: date, version: entry.version, menu: entry.menu } });
    }
    if (path === '/api/family/menu/generate') {
      const body = request.postDataJSON();
      expect(body).toMatchObject({ preview: true, familyId: targetFamily, rosterVersion: 1 });
      (state.previewSessions ??= []).push(requestedSession ?? '');
      const capturedFamily = targetFamily;
      if (state.holdFamilyPreview && requestedSession === accountA.sid) {
        await heldFamilyPreviewResponse.promise; state.releasedPreviews = (state.releasedPreviews ?? 0) + 1;
      }
      const menu = planningDay(scopedAccount.id, body.date, 1, body.selections);
      return json({ preview: true, rosterVersion: 1, profileVersions: menu.planningV1.profileVersions,
        shared: { familyId: capturedFamily, weekStart: body.date, menu } });
    }
    if (path === '/api/family/invite') {
      state.inviteRequests += 1;
      (state.inviteSessionIds ??= []).push(requestedSession ?? '');
      const body = request.postDataJSON() as { familyId?: unknown } | null;
      state.inviteTargetIds.push(typeof body?.familyId === 'string' ? body.familyId : '');
      if (holdInvite && scopedAccount.id === accountA.id) {
        await heldInvite.promise;
        state.releasedInvites += 1;
        return json({ code: 'OBSOLETE-CODE-FROM-A' }, accountA);
      }
      return json({ code: 'CURRENT-CODE' });
    }
    if (path === '/api/family/join') {
      state.joinRequests = (state.joinRequests ?? 0) + 1;
      (state.joinSessionIds ??= []).push(requestedSession ?? '');
      if (holdJoin && scopedAccount.id === accountA.id) {
        await heldJoinResponse.promise;
        state.releasedJoins = (state.releasedJoins ?? 0) + 1;
        return json({ ok: true }, accountA);
      }
      return json({ ok: true });
    }
    if (path === '/api/family/member' || path === '/api/family/menu'
      || path === '/api/weekly_menu/items' && request.method() === 'POST') {
      throw new Error(`Obsolete family writer/read in day-planning test: ${request.method()} ${path}`);
    }
    if (path === '/api/shopping/list') {
      const weekStart = url.searchParams.get('week');
      if (!url.searchParams.has('family_id')) {
        state.personalShoppingListRequests += 1;
        state.personalShoppingListAccounts.push(scopedAccount.id);
        if (holdPersonalShoppingList && scopedAccount.id === accountA.id) {
          await heldPersonalShoppingListResponse.promise;
          state.releasedPersonalShoppingLists += 1;
        }
        if (requestedAccount !== state.current.id || requestedSession !== state.current.sid) {
          state.rejectedPersonalShoppingLists += 1;
          return json({ error: 'STATE_SESSION_CHANGED' }, state.current, 401);
        }
        return json({
          week_start: weekStart,
          items: [{ name: `Список ${scopedAccount.id === accountA.id ? 'A' : 'B'}`, grams: 400,
            checked: state.personalShoppingCheckedByAccount?.[scopedAccount.id] ?? false }],
        });
      }
      throw new Error('Family purchases must read the accepted day through menu/state.');
    }
    if (path === '/api/shopping/check') {
      state.shoppingCheckRequests += 1;
      state.shoppingCheckAccounts.push(scopedAccount.id);
      const body = request.postDataJSON() as { family_id?: unknown; checked?: unknown } | null;
      state.shoppingCheckSessions?.push(requestedSession ?? '');
      state.shoppingCheckFamilyIds?.push(typeof body?.family_id === 'string' ? body.family_id : '');
      expect(body?.family_id).toBeUndefined();
      const personal = !body?.family_id;
      if (personal) {
        state.personalShoppingCheckRequests += 1;
        state.personalShoppingCheckAccounts.push(scopedAccount.id);
        state.personalShoppingCheckValues?.push(body?.checked === true);
      }
      if (state.failShoppingCheckRequest !== undefined && state.shoppingCheckRequests >= state.failShoppingCheckRequest) {
        state.failedShoppingCheckRequests = (state.failedShoppingCheckRequests ?? 0) + 1;
        return json({ error: 'SHOPPING_UPDATE_FAILED' }, scopedAccount, 503);
      }
      if (holdShoppingCheck && scopedAccount.id === accountA.id) {
        await heldShoppingCheckResponse.promise;
        state.releasedShoppingChecks += 1;
        if (personal && (requestedAccount !== state.current.id || requestedSession !== state.current.sid)) {
          state.rejectedPersonalShoppingChecks += 1;
          return json({ error: 'STATE_SESSION_CHANGED' }, state.current, 401);
        }
        if (personal) {
          const checked = body?.checked === true;
          (state.personalShoppingCheckedByAccount ??= {})[scopedAccount.id] = checked;
          state.personalShoppingCheckCommits?.push(checked);
        } else state.familyShoppingChecked = body?.checked === true;
        await json({ ok: true }, accountA);
        return;
      }
      if (personal && (requestedAccount !== state.current.id || requestedSession !== state.current.sid)) {
        state.rejectedPersonalShoppingChecks += 1;
        return json({ error: 'STATE_SESSION_CHANGED' }, state.current, 401);
      }
      if (personal) {
        const checked = body?.checked === true;
        (state.personalShoppingCheckedByAccount ??= {})[scopedAccount.id] = checked;
        state.personalShoppingCheckCommits?.push(checked);
      } else state.familyShoppingChecked = body?.checked === true;
      return json({ ok: true });
    }
    return route.fallback();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /\/api\/shopping\/(list|check)/.test(message.location().url)
      && /\b401\b/.test(message.text())) return;
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });
  return {
    releaseInvite: heldInvite.release,
    releaseShoppingCheck: heldShoppingCheckResponse.release,
    releasePersonalShoppingList: heldPersonalShoppingListResponse.release,
    releaseMemberUpdate: heldMemberResponse.release,
    releaseJoin: heldJoinResponse.release,
    releaseCreate: heldCreateResponse.release,
    releaseFamilyContext: heldFamilyContextResponse.release,
    releaseFamilyShoppingList: heldFamilyShoppingListResponse.release,
    releaseFamilyMenu: heldFamilyMenuResponse.release,
    releaseFamilyPreview: heldFamilyPreviewResponse.release,
    releaseSupportList: heldSupportListResponse.release,
    releaseMobileToken: heldMobileTokenResponse.release,
    releasePushStatus: heldPushStatusResponse.release,
    releaseBillingCheckout: heldBillingCheckoutResponse.release,
    meSessionIds,
  };
}

async function activeSessionIdentity(page: Page): Promise<{ accountId?: string; serverSessionId?: string; sessionEpoch?: string } | null> {
  return page.evaluate(async () => {
    const opening = indexedDB.open('fitfocus-user-state-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction('outbox_meta', 'readonly');
      const request = tx.objectStore('outbox_meta').get('active-session');
      const value = await new Promise<{ accountId?: string; serverSessionId?: string; sessionEpoch?: string } | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return value ? {
        accountId: value.accountId,
        serverSessionId: value.serverSessionId,
        sessionEpoch: value.sessionEpoch,
      } : null;
    } finally {
      db.close();
    }
  });
}

async function activeAccount(page: Page): Promise<string | null> {
  return (await activeSessionIdentity(page))?.accountId ?? null;
}

async function editOwnDiningProfile(page: Page) {
  await page.getByRole('button', { name: 'Настроить профиль', exact: true }).click();
  await page.getByText(/Дополнительные настройки \(необязательно\)/).click();
  await page.locator('#fp-goal-context').selectOption('LOSS');
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
}

async function resumeFamilyPage(page: Page) {
  // The new screen serializes UI actions. Retire the held attempt before a
  // restored page explicitly refreshes a changed family under the same login.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
}

async function openAccountB(context: BrowserContext, state: FixtureState, errors: string[], includePersonalShopping = false,
  targetTab: 'family' | 'plan' | 'support' | 'settings' = includePersonalShopping ? 'plan' : 'family') {
  state.current = accountB;
  const page = await context.newPage();
  await installAccountApi(page, state, false, errors, false, false, includePersonalShopping);
  await openApp(page, `/#${targetTab}`);
  await expect(page).toHaveTitle(/FitFocus/);
  if (targetTab === 'support') {
    await expect(page.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Обращение B', exact: true })).toBeVisible();
  } else if (targetTab === 'settings') {
    await expect(page.getByRole('button', { name: 'Сгенерировать token' })).toBeVisible();
  } else if (includePersonalShopping) {
    await expect(page.locator('#shopping-list')).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
  }
  await expect.poll(() => activeAccount(page)).toBe(accountB.id);
  return page;
}

for (const boundary of ['another-account', 'same-account-new-session'] as const) {
  test(`a held family day preview cannot cross ${boundary}; current preview requires explicit confirm before purchases`, async ({ page, context }) => {
    const errors: string[] = [], currentErrors: string[] = [];
    const currentAccount = boundary === 'another-account' ? accountB : { ...accountA, sid: '9'.repeat(64) };
    const state = newState({ holdFamilyPreview: true, previewSessions: [], planningCommits: [], profileWrites: [] });
    const previous = await installAccountApi(page, state, false, errors);
    await openApp(page, '/#family');
    await previewDay(page);
    await expect.poll(() => state.previewSessions).toEqual([accountA.sid]);
    expect(state.planningCommits).toEqual([]); expect(state.shoppingCheckRequests).toBe(0);
    expect((await saved(page)).operations).toEqual([]);
    const currentPage = await context.newPage();
    state.current = currentAccount;
    const current = await installAccountApi(currentPage, state, false, currentErrors);
    try {
      await openApp(currentPage, '/#family');
      await expect(currentPage.getByRole('heading', { name: currentAccount.name, exact: true })).toBeVisible();
      await expect.poll(() => activeSessionIdentity(page)).toMatchObject({ accountId: currentAccount.id, serverSessionId: currentAccount.sid });
      await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
      const oldReads = state.familyMenuSessions?.filter(sid => sid === accountA.sid).length;
      previous.releaseFamilyPreview();
      await expect.poll(() => state.releasedPreviews).toBe(1);
      await expect(page.getByRole('button', { name: 'Подтвердить меню', exact: true })).toHaveCount(0);
      await expect(currentPage.getByRole('button', { name: 'Подтвердить меню', exact: true })).toHaveCount(0);
      expect(state.familyMenuSessions?.filter(sid => sid === accountA.sid)).toHaveLength(oldReads!);
      expect(state.planningCommits).toEqual([]); expect(state.shoppingCheckRequests).toBe(0);
      expect(state.profileWrites).toEqual([]); expect((await saved(currentPage)).operations).toEqual([]);
      await previewDay(currentPage);
      await expect(currentPage.getByRole('heading', { name: 'Предпросмотр — ещё не сохранено', exact: true })).toBeVisible();
      expect(state.planningCommits).toEqual([]);
      await currentPage.getByRole('button', { name: 'Подтвердить меню', exact: true }).click();
      await expect.poll(() => state.planningCommits).toEqual([currentAccount.sid]);
      await expect.poll(async () => (await saved(currentPage)).operations.length).toBe(0);
      await navigate(currentPage, 'Покупки');
      const purchase = currentPage.locator('.fp-shopping-list').getByRole('checkbox').first();
      await expect(purchase).toBeEnabled(); await setPurchasedCheckbox(purchase, true);
      await expect.poll(() => state.shoppingCheckRequests).toBe(1);
      await expect.poll(async () => (await saved(currentPage)).operations.length).toBe(0);
      expect(state.familyPurchaseMutations).toHaveLength(1);
      expect(state.familyPurchaseMutations![0]).toMatchObject({ account: currentAccount.id, session: currentAccount.sid, baseVersion: 2 });
      expect(state.profileWrites).toEqual([]); expect(state.shoppingAchievements).toEqual([]);
      expect(errors).toEqual([]); expect(currentErrors).toEqual([]);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await expect(currentPage.locator('vite-error-overlay')).toHaveCount(0);
    } finally { previous.releaseFamilyPreview(); current.releaseFamilyPreview(); }
  });
}

test('a delayed family callback from account A is ignored after another tab signs in as account B', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixtureA = await installAccountApi(page, state, true, errorsA);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Меню семьи', exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await page.getByRole('button', { name: 'Пригласить по коду', exact: true }).click();
  await expect.poll(() => state.inviteRequests).toBe(1);
  expect(state.inviteTargetIds).toEqual([`family-${accountA.id}`]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseInvite();
    await expect.poll(() => state.releasedInvites).toBe(1);
    await expect(page.getByText('OBSOLETE-CODE-FROM-A', { exact: true })).toHaveCount(0);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-callback-account-b.png') });
  } finally {
    fixtureA.releaseInvite();
  }
});

test('a delayed family callback stays bound to its captured family when the same login reloads another family', async ({ page }, info) => {
  const errors: string[] = [];
  const state: FixtureState = {
    current: accountA,
    familyId: 'family-a-original',
    inviteRequests: 0,
    inviteTargetIds: [],
    releasedInvites: 0,
    shoppingCheckRequests: 0,
    shoppingCheckAccounts: [],
    releasedShoppingChecks: 0,
    personalShoppingListRequests: 0,
    personalShoppingListAccounts: [],
    releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0,
    personalShoppingCheckRequests: 0,
    personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0,
    shoppingAchievements: [],
    memberRequests: 0,
    memberTargetIds: [],
    releasedMembers: 0,
  };
  const fixture = await installAccountApi(page, state, true, errors);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Меню семьи', exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await expect(page.getByRole('heading', { name: 'Семья family-a-original', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Пригласить по коду', exact: true }).click();
  await expect.poll(() => state.inviteRequests).toBe(1);
  expect(state.inviteTargetIds).toEqual(['family-a-original']);

  state.familyId = 'family-a-next';
    await resumeFamilyPage(page);
  await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Семья family-a-next', exact: true })).toBeVisible();

  fixture.releaseInvite();
  await expect.poll(() => state.releasedInvites).toBe(1);
  await expect(page.getByText('OBSOLETE-CODE-FROM-A', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Сессия изменилась. Войдите снова и повторите действие.', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('a delayed family-join response from account A cannot publish success after account B signs in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, noFamilyForA: true, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyJoinAchievements: [], familyLoadAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await page.getByText('У меня есть код приглашения', { exact: true }).click();
  const joinCode = page.getByLabel('Код приглашения', { exact: true });
  await expect(joinCode).toBeVisible();
  await joinCode.fill('JOIN-CODE-A');
  const accountAFamilyLoads = state.familyLoadAccounts.filter(id => id === accountA.id).length;
  await page.getByRole('button', { name: 'Присоединиться', exact: true }).click();
  await expect.poll(() => state.joinRequests).toBe(1);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseJoin();
    await expect.poll(() => state.releasedJoins).toBe(1);
    await expect(joinCode).toHaveCount(0);
    await expect(accountBPage.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
    await page.waitForTimeout(100);
    expect(state.familyLoadAccounts.filter(id => id === accountA.id)).toHaveLength(accountAFamilyLoads);
    expect(state.familyJoinAchievements).toEqual([]);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-join-account-b.png') });
  } finally {
    fixtureA.releaseJoin();
  }
});

test('a delayed family-create response from account A cannot publish success after account B signs in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, noFamilyForA: true, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyJoinAchievements: [], familyLoadAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const familyName = page.getByLabel('Название семьи', { exact: true });
  await expect(familyName).toBeVisible();
  await familyName.fill('Семья A');
  await expect.poll(() => state.familyLoadAccounts.filter(id => id === accountA.id).length).toBeGreaterThan(0);
  const accountAFamilyLoads = state.familyLoadAccounts.filter(id => id === accountA.id).length;
  await page.getByRole('button', { name: 'Создать семью', exact: true }).click();
  await expect.poll(() => state.createRequests).toBe(1);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseCreate();
    await expect.poll(() => state.releasedCreates).toBe(1);
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    await expect(page.getByRole('button', { name: 'Создать семью', exact: true })).toHaveCount(0);
    await expect(accountBPage.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
    await page.waitForTimeout(100);
    expect(state.familyLoadAccounts.filter(id => id === accountA.id)).toHaveLength(accountAFamilyLoads);
    expect(state.familyJoinAchievements).toEqual([]);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-create-account-b.png') });
  } finally {
    fixtureA.releaseCreate();
  }
});

test('a delayed family-context read from account A cannot appear after account B signs in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyJoinAchievements: [], familyLoadAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => state.familyLoadAccounts.filter(id => id === accountA.id).length).toBe(1);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseFamilyContext();
    await expect.poll(() => state.releasedFamilyContexts).toBe(1);
    await page.waitForTimeout(100);
    await expect(page.getByRole('heading', { name: accountA.name, exact: true })).toHaveCount(0);
    await expect(accountBPage.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
    expect(state.familyLoadAccounts.filter(id => id === accountA.id)).toHaveLength(1);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-context-account-b.png') });
  } finally {
    fixtureA.releaseFamilyContext();
  }
});

test('a delayed shared family-menu read from account A cannot appear after account B signs in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const oldMenuName = 'MENU_ACCOUNT_A_ONLY';
  const currentMenuName = 'MENU_ACCOUNT_B_ONLY';
  const state: FixtureState = {
    current: accountA,
    inviteRequests: 0,
    inviteTargetIds: [],
    releasedInvites: 0,
    shoppingCheckRequests: 0,
    shoppingCheckAccounts: [],
    releasedShoppingChecks: 0,
    personalShoppingListRequests: 0,
    personalShoppingListAccounts: [],
    releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0,
    personalShoppingCheckRequests: 0,
    personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0,
    shoppingAchievements: [],
    memberRequests: 0,
    memberTargetIds: [],
    releasedMembers: 0,
    familyLoadAccounts: [],
    familyLoadSessions: [],
    familyMenuSessions: [],
    familyMenuNamesBySession: { [accountA.sid]: oldMenuName, [accountB.sid]: currentMenuName },
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA,
    false, false, false, false, false, false, false, false, false, false, false, false, true);

  try {
    await openApp(page, '/#family');
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(() => state.familyMenuSessions?.filter(session => session === accountA.sid).length).toBe(1);

    const accountBPage = await openAccountB(context, state, errorsB);
    await expect.poll(() => state.familyMenuSessions?.filter(session => session === accountB.sid).length).toBeGreaterThan(0);
    await navigate(accountBPage, 'Покупки');
    await expect(accountBPage.getByText(currentMenuName)).toBeVisible();
    await expect(accountBPage.getByText(oldMenuName)).toHaveCount(0);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: accountB.id,
      serverSessionId: accountB.sid,
    });
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    const oldFamilyReadsBeforeRelease = state.familyLoadSessions?.filter(session => session === accountA.sid).length ?? 0;

    fixtureA.releaseFamilyMenu();
    await expect.poll(() => state.releasedFamilyMenus).toBe(1);
    await expect(accountBPage.getByText(currentMenuName)).toBeVisible();
    await expect(accountBPage.getByText(oldMenuName)).toHaveCount(0);
    expect(state.familyMenuSessions?.filter(session => session === accountA.sid)).toHaveLength(1);
    expect(state.familyLoadSessions?.filter(session => session === accountA.sid)).toHaveLength(oldFamilyReadsBeforeRelease);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releaseFamilyMenu();
  }
});

test('a delayed family-context read from the previous same-account session is discarded after reauthentication', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyLoadAccounts: [], familyLoadSessions: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => state.familyLoadSessions?.filter(session => session === accountA.sid).length).toBe(1);

  const reauthenticated = { ...accountA, sid: 'c'.repeat(64) };
  state.current = reauthenticated;
  state.familyId = 'family-reauthenticated';
  const reauthenticatedPage = await context.newPage();
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);

  try {
    await openApp(reauthenticatedPage, '/#family');
    await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-reauthenticated', exact: true })).toBeVisible();
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect.poll(() => state.familyLoadSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');

    fixtureA.releaseFamilyContext();
    await expect.poll(() => state.releasedFamilyContexts).toBe(1);
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-reauthenticated', exact: true })).toBeVisible();
    expect(state.familyLoadSessions?.filter(session => session === accountA.sid)).toHaveLength(1);
    expect(state.familyLoadSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releaseFamilyContext();
    fixtureReauthenticated.releaseFamilyContext();
  }
});

test('a delayed shared family-menu read from the previous same-account session is discarded after reauthentication', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const oldMenuName = 'MENU_OLD_SERVER_SESSION';
  const newMenuName = 'MENU_NEW_SERVER_SESSION';
  const state: FixtureState = {
    current: accountA,
    familyId: 'family-before-menu-reauthentication',
    inviteRequests: 0,
    inviteTargetIds: [],
    releasedInvites: 0,
    shoppingCheckRequests: 0,
    shoppingCheckAccounts: [],
    releasedShoppingChecks: 0,
    personalShoppingListRequests: 0,
    personalShoppingListAccounts: [],
    releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0,
    personalShoppingCheckRequests: 0,
    personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0,
    shoppingAchievements: [],
    memberRequests: 0,
    memberTargetIds: [],
    releasedMembers: 0,
    familyLoadAccounts: [],
    familyLoadSessions: [],
    familyMenuSessions: [],
    familyMenuNamesBySession: { [accountA.sid]: oldMenuName },
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA,
    false, false, false, false, false, false, false, false, false, false, false, false, true);

  try {
    await openApp(page, '/#family');
    await expect(page).toHaveTitle(/FitFocus/);
    await expect.poll(() => state.familyMenuSessions?.filter(session => session === accountA.sid).length).toBe(1);

    const reauthenticated = { ...accountA, sid: 'e'.repeat(64) };
    state.current = reauthenticated;
    state.familyId = 'family-after-menu-reauthentication';
    state.familyMenuNamesBySession![reauthenticated.sid] = newMenuName;
    const reauthenticatedPage = await context.newPage();
    const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);

    try {
      await openApp(reauthenticatedPage, '/#family');
      await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-after-menu-reauthentication', exact: true })).toBeVisible();
      await expect.poll(() => state.familyMenuSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
      await navigate(reauthenticatedPage, 'Покупки');
      await expect(reauthenticatedPage.getByText(newMenuName)).toBeVisible();
      await expect(reauthenticatedPage.getByText(oldMenuName)).toHaveCount(0);
      await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
        accountId: accountA.id,
        serverSessionId: reauthenticated.sid,
      });
      await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
        accountId: accountA.id,
        serverSessionId: reauthenticated.sid,
      });
      await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
      const oldFamilyReadsBeforeRelease = state.familyLoadSessions?.filter(session => session === accountA.sid).length ?? 0;

      fixtureA.releaseFamilyMenu();
      await expect.poll(() => state.releasedFamilyMenus).toBe(1);
      await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
      await expect(reauthenticatedPage.getByText(newMenuName)).toBeVisible();
      await expect(reauthenticatedPage.getByText(oldMenuName)).toHaveCount(0);
      expect(state.familyMenuSessions?.filter(session => session === accountA.sid)).toHaveLength(1);
      expect(state.familyLoadSessions?.filter(session => session === accountA.sid)).toHaveLength(oldFamilyReadsBeforeRelease);
      expect(errorsA).toEqual([]);
      expect(errorsReauthenticated).toEqual([]);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
    } finally {
      fixtureReauthenticated.releaseFamilyMenu();
    }
  } finally {
    fixtureA.releaseFamilyMenu();
  }
});

test('a delayed family invite from the previous same-account session is discarded after reauthentication', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], inviteSessionIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyLoadAccounts: [], familyLoadSessions: [],
  };
  const fixtureA = await installAccountApi(page, state, true, errorsA);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: accountA.name, exact: true })).toBeVisible();
  await expect.poll(() => state.familyLoadSessions?.filter(session => session === accountA.sid).length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Пригласить по коду', exact: true }).click();
  await expect.poll(() => state.inviteRequests).toBe(1);
  expect(state.inviteTargetIds).toEqual([`family-${accountA.id}`]);
  expect(state.inviteSessionIds).toEqual([accountA.sid]);
  const previousSessionFamilyLoads = state.familyLoadSessions?.filter(session => session === accountA.sid).length;

  const reauthenticated = { ...accountA, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);

  try {
    await openApp(reauthenticatedPage, '/#family');
    await expect(reauthenticatedPage.getByRole('heading', { name: accountA.name, exact: true })).toBeVisible();
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect.poll(() => state.familyLoadSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');

    fixtureA.releaseInvite();
    await expect.poll(() => state.releasedInvites).toBe(1);
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    await expect(page.getByText('OBSOLETE-CODE-FROM-A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('OBSOLETE-CODE-FROM-A', { exact: true })).toHaveCount(0);
    expect(state.inviteSessionIds).toEqual([accountA.sid]);
    expect(state.familyLoadSessions?.filter(session => session === accountA.sid)).toHaveLength(previousSessionFamilyLoads);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releaseInvite();
    fixtureReauthenticated.releaseInvite();
  }
});

test('a delayed family create from the previous same-account session is discarded after reauthentication', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const state: FixtureState = {
    current: accountA, noFamilyForA: true, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    createSessionIds: [], familyJoinAchievements: [], familyLoadAccounts: [], familyLoadSessions: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => state.familyLoadSessions?.filter(session => session === accountA.sid).length).toBeGreaterThan(0);
  const familyName = page.getByLabel('Название семьи', { exact: true });
  await expect(familyName).toBeVisible();
  await familyName.fill('Семья A');
  await page.getByRole('button', { name: 'Создать семью', exact: true }).click();
  await expect.poll(() => state.createRequests).toBe(1);
  expect(state.createSessionIds).toEqual([accountA.sid]);
  const previousSessionFamilyLoads = state.familyLoadSessions?.filter(session => session === accountA.sid).length;

  const reauthenticated = { ...accountA, sid: 'e'.repeat(64) };
  state.current = reauthenticated;
  state.noFamilyForA = false;
  state.familyId = 'family-reauthenticated';
  const reauthenticatedPage = await context.newPage();
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);

  try {
    await openApp(reauthenticatedPage, '/#family');
    await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-reauthenticated', exact: true })).toBeVisible();
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect.poll(() => state.familyLoadSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');

    fixtureA.releaseCreate();
    await expect.poll(() => state.releasedCreates).toBe(1);
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-reauthenticated', exact: true })).toBeVisible();
    expect(state.createSessionIds).toEqual([accountA.sid]);
    expect(state.familyLoadSessions?.filter(session => session === accountA.sid)).toHaveLength(previousSessionFamilyLoads);
    expect(state.familyJoinAchievements).toEqual([]);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releaseCreate();
    fixtureReauthenticated.releaseCreate();
  }
});

test('a delayed family join from the previous same-account session is discarded after reauthentication', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const state: FixtureState = {
    current: accountA, noFamilyForA: true, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    joinSessionIds: [], familyJoinAchievements: [], familyLoadAccounts: [], familyLoadSessions: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => state.familyLoadSessions?.filter(session => session === accountA.sid).length).toBeGreaterThan(0);
  await page.getByText('У меня есть код приглашения', { exact: true }).click();
  const joinCode = page.getByLabel('Код приглашения', { exact: true });
  await expect(joinCode).toBeVisible();
  await joinCode.fill('JOIN-CODE-A');
  await page.getByRole('button', { name: 'Присоединиться', exact: true }).click();
  await expect.poll(() => state.joinRequests).toBe(1);
  expect(state.joinSessionIds).toEqual([accountA.sid]);
  const previousSessionFamilyLoads = state.familyLoadSessions?.filter(session => session === accountA.sid).length;

  const reauthenticated = { ...accountA, sid: 'f'.repeat(64) };
  state.current = reauthenticated;
  state.noFamilyForA = false;
  state.familyId = 'family-reauthenticated';
  const reauthenticatedPage = await context.newPage();
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);

  try {
    await openApp(reauthenticatedPage, '/#family');
    await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-reauthenticated', exact: true })).toBeVisible();
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect.poll(() => state.familyLoadSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');

    fixtureA.releaseJoin();
    await expect.poll(() => state.releasedJoins).toBe(1);
    await expect(joinCode).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-reauthenticated', exact: true })).toBeVisible();
    expect(state.joinSessionIds).toEqual([accountA.sid]);
    expect(state.familyLoadSessions?.filter(session => session === accountA.sid)).toHaveLength(previousSessionFamilyLoads);
    expect(state.familyJoinAchievements).toEqual([]);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releaseJoin();
    fixtureReauthenticated.releaseJoin();
  }
});

test('a delayed family shopping-list read from account A cannot appear after account B signs in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyJoinAchievements: [], familyLoadAccounts: [], familyShoppingListAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, false, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: accountA.name, exact: true })).toBeVisible();
  await expect.poll(() => state.familyShoppingListAccounts.filter(id => id === accountA.id).length).toBeGreaterThan(0);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    // Account A can start more than one held read while B's login propagates.
    // Count only after the shared session in this tab has committed B, then
    // prove delayed A responses do not cause any further A reads.
    const accountAFamilyShoppingRequestsAfterSwitch = state.familyShoppingListAccounts.filter(id => id === accountA.id).length;
    fixtureA.releaseFamilyShoppingList();
    await expect.poll(() => state.releasedFamilyShoppingLists).toBeGreaterThanOrEqual(accountAFamilyShoppingRequestsAfterSwitch);
    await page.waitForTimeout(100);
    await expect(page.getByText('Семейный список A', { exact: false })).toHaveCount(0);
    const refreshB = accountBPage.getByRole('button', { name: 'Обновить данные', exact: true });
    await refreshB.click();
    await navigate(accountBPage, 'Покупки');
    await expect(accountBPage.getByText('Семейный список B', { exact: false })).toBeVisible();
    expect(state.familyShoppingListAccounts.filter(id => id === accountA.id)).toHaveLength(accountAFamilyShoppingRequestsAfterSwitch);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-shopping-account-b.png') });
  } finally {
    fixtureA.releaseFamilyShoppingList();
  }
});

test('a delayed family shopping-list read from the previous same-account session is discarded after reauthentication', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const oldListName = 'СПИСОК_СТАРОЙ_СЕССИИ';
  const newListName = 'СПИСОК_НОВОЙ_СЕССИИ';
  const state: FixtureState = {
    current: accountA,
    familyId: 'family-before-reauthentication',
    inviteRequests: 0,
    inviteTargetIds: [],
    releasedInvites: 0,
    shoppingCheckRequests: 0,
    shoppingCheckAccounts: [],
    releasedShoppingChecks: 0,
    personalShoppingListRequests: 0,
    personalShoppingListAccounts: [],
    releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0,
    personalShoppingCheckRequests: 0,
    personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0,
    shoppingAchievements: [],
    memberRequests: 0,
    memberTargetIds: [],
    releasedMembers: 0,
    familyLoadSessions: [],
    familyShoppingListAccounts: [],
    familyShoppingListSessions: [],
    familyShoppingListNamesBySession: { [accountA.sid]: oldListName },
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, false, false, true);

  try {
    await openApp(page, '/#family');
    await expect(page.getByRole('heading', { name: 'Семья family-before-reauthentication', exact: true })).toBeVisible();
    await expect.poll(() => state.familyShoppingListSessions?.filter(session => session === accountA.sid).length).toBeGreaterThan(0);
    const previousSessionReads = state.familyShoppingListSessions?.filter(session => session === accountA.sid).length ?? 0;

    const reauthenticated = { ...accountA, sid: 'f'.repeat(64) };
    state.current = reauthenticated;
    state.familyId = 'family-after-reauthentication';
    state.familyShoppingListNamesBySession![reauthenticated.sid] = newListName;
    const reauthenticatedPage = await context.newPage();
    const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);

    try {
      await openApp(reauthenticatedPage, '/#family');
      await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-after-reauthentication', exact: true })).toBeVisible();
      await navigate(reauthenticatedPage, 'Покупки');
      await expect(reauthenticatedPage.getByText(newListName, { exact: false })).toBeVisible();
      await expect(reauthenticatedPage.getByText(oldListName, { exact: false })).toHaveCount(0);
      await expect.poll(() => state.familyShoppingListSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
      await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
        accountId: accountA.id,
        serverSessionId: reauthenticated.sid,
      });
      await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
        accountId: accountA.id,
        serverSessionId: reauthenticated.sid,
      });
      await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
      const previousSessionReadsBeforeRelease = state.familyShoppingListSessions?.filter(session => session === accountA.sid).length ?? 0;

      fixtureA.releaseFamilyShoppingList();
      await expect.poll(() => state.releasedFamilyShoppingLists ?? 0).toBeGreaterThanOrEqual(previousSessionReads);
      await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
      await navigate(reauthenticatedPage, 'Покупки');
      await expect(reauthenticatedPage.getByText(newListName, { exact: false })).toBeVisible();
      await expect(reauthenticatedPage.getByText(oldListName, { exact: false })).toHaveCount(0);
      expect(state.familyShoppingListSessions?.filter(session => session === accountA.sid)).toHaveLength(previousSessionReadsBeforeRelease);
      expect(errorsA).toEqual([]);
      expect(errorsReauthenticated).toEqual([]);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
    } finally {
      fixtureReauthenticated.releaseFamilyShoppingList();
    }
  } finally {
    fixtureA.releaseFamilyShoppingList();
  }
});

test('a delayed family shopping response cannot trigger an achievement after another tab signs in as account B', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Меню семьи', exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await navigate(page, 'Покупки');
  const accountACheckbox = page.locator('.fp-shopping-list').getByRole('checkbox').first();
  await expect(accountACheckbox).toBeVisible();
  await setPurchasedCheckbox(accountACheckbox, true);
  await expect.poll(() => state.shoppingCheckRequests).toBe(1);
  expect(state.shoppingCheckAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    await navigate(accountBPage, 'Покупки');
    const accountBCheckbox = accountBPage.locator('.fp-shopping-list').getByRole('checkbox').first();
    await expect(accountBCheckbox).toBeVisible();
    await expect(accountBCheckbox).not.toBeChecked();
    expect(await activeAccount(page)).toBe(accountB.id);

    fixtureA.releaseShoppingCheck();
    await expect.poll(() => state.releasedShoppingChecks).toBe(1);
    // AchievementClient may coalesce checks for up to 500ms; allow that window before asserting absence.
    await page.waitForTimeout(700);
    expect(state.shoppingAchievements).toEqual([]);
    await expect(accountBCheckbox).not.toBeChecked();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-shopping-account-b.png') });
  } finally {
    fixtureA.releaseShoppingCheck();
  }
});

test('a delayed family purchase callback is discarded while its durable intent retries under the reauthenticated session', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const state: FixtureState = {
    current: accountA, familyId: 'family-before-reauthentication', inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], shoppingCheckSessions: [], shoppingCheckFamilyIds: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyLoadSessions: [], familyShoppingListAccounts: [], familyShoppingListSessions: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Семья family-before-reauthentication', exact: true })).toBeVisible();
  await expect.poll(() => state.familyShoppingListSessions?.filter(session => session === accountA.sid).length).toBeGreaterThan(0);
  await navigate(page, 'Покупки');
  const oldCheckbox = page.locator('.fp-shopping-list').getByRole('checkbox').first();
  await expect(oldCheckbox).toBeVisible();
  await setPurchasedCheckbox(oldCheckbox, true);
  await expect.poll(() => state.shoppingCheckRequests).toBe(1);
  expect(state.shoppingCheckAccounts).toEqual([accountA.id]);
  expect(state.shoppingCheckSessions).toEqual([accountA.sid]);
  expect(state.shoppingCheckFamilyIds).toEqual(['family-before-reauthentication']);

  const retainedPurchase = await saved(page);
  expect(retainedPurchase.operations).toHaveLength(1);
  expect(retainedPurchase.operations[0].opId).toEqual(expect.any(String));
  expect(JSON.parse(retainedPurchase.operations[0].value)).toMatchObject({
    familyId: 'family-before-reauthentication', mutationKind: 'purchases',
  });
  const originalMutation = structuredClone(state.familyPurchaseMutations![0]);

  const reauthenticated = { ...accountA, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  state.familyId = 'family-after-reauthentication';
  const reauthenticatedPage = await context.newPage();
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);

  try {
    await openApp(reauthenticatedPage, '/#family');
    await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-after-reauthentication', exact: true })).toBeVisible();
    await navigate(reauthenticatedPage, 'Покупки');
    const newCheckbox = reauthenticatedPage.locator('.fp-shopping-list').getByRole('checkbox').first();
    await expect(newCheckbox).toBeVisible();
    await expect(newCheckbox).not.toBeChecked();
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect.poll(() => state.familyShoppingListSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');

    // Same-account reauthentication resumes the saved intent with a fresh guard.
    // It must retain the original family/payload/CAS, never target the new family.
    await expect.poll(() => state.shoppingCheckSessions).toEqual([accountA.sid, reauthenticated.sid]);
    expect(state.familyPurchaseMutations).toEqual([
      originalMutation, { ...originalMutation, session: reauthenticated.sid },
    ]);
    await expect.poll(async () => (await saved(reauthenticatedPage)).operations).toEqual([]);
    const acknowledgedPurchase = await saved(reauthenticatedPage);
    const oldSessionListReadsBeforeLateResponse = state.familyShoppingListSessions?.filter(session => session === accountA.sid).length ?? 0;
    fixtureA.releaseShoppingCheck();
    await expect.poll(() => state.releasedShoppingChecks).toBe(1);
    await page.waitForTimeout(700);
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    await expect(newCheckbox).not.toBeChecked();
    expect(state.shoppingCheckSessions).toEqual([accountA.sid, reauthenticated.sid]);
    expect(state.shoppingCheckFamilyIds).toEqual(['family-before-reauthentication', 'family-before-reauthentication']);
    expect(state.familyPurchaseMutations).toEqual([
      originalMutation, { ...originalMutation, session: reauthenticated.sid },
    ]);
    expect(await saved(reauthenticatedPage)).toEqual(acknowledgedPurchase);
    expect(state.familyShoppingListSessions?.filter(session => session === accountA.sid)).toHaveLength(oldSessionListReadsBeforeLateResponse);
    expect(state.shoppingAchievements).toEqual([]);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releaseShoppingCheck();
    fixtureReauthenticated.releaseShoppingCheck();
  }
});

test('a failed family purchase CAS preserves the newer durable intent until its retry is acknowledged', async ({ page }, info) => {
  const errors: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    failShoppingCheckRequest: 2,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixture = await installAccountApi(page, state, false, errors, true);
  const checkbox = page.locator('.fp-shopping-list').getByRole('checkbox').first();
  try {
    await openApp(page, '/#family');
    await expect(page).toHaveTitle(/FitFocus/);
    await expect(page.getByRole('heading', { name: 'Меню семьи', exact: true })).toBeVisible();
    await expect.poll(() => activeAccount(page)).toBe(accountA.id);
    await navigate(page, 'Покупки');
    await expect(checkbox).toBeVisible(); await expect(checkbox).not.toBeChecked();
    await setPurchasedCheckbox(checkbox, true);
    await expect.poll(() => state.shoppingCheckRequests).toBe(1);
    await expect(checkbox).toBeChecked();
    // A pending generation cannot be raced by another purchase write.
    await expect(checkbox).toBeDisabled();
    await page.waitForTimeout(250); expect(state.shoppingCheckRequests).toBe(1);
    fixture.releaseShoppingCheck();
    await expect(checkbox).toBeEnabled();
    await setPurchasedCheckbox(checkbox, false);
    await expect.poll(() => state.failedShoppingCheckRequests ?? 0).toBeGreaterThan(0);
    await expect(checkbox).not.toBeChecked();
    await expect.poll(async () => (await saved(page)).operations.map(operation => operation.status)).toEqual(['pending']);
    const retained = await saved(page);
    expect(retained.operations).toHaveLength(1);
    const pendingId = retained.operations[0].opId;
    expect(retained.operations[0].status).toBe('pending');
    expect(JSON.parse(retained.operations[0].value).menu.planningV1.purchasedQuantities[0].quantity).toBe(0);
    expect(state.familyPurchaseMutations![0].baseVersion).toBe(1);
    expect(state.familyPurchaseMutations![1].baseVersion).toBe(2);
    expect(state.planningMenus && Object.values(state.planningMenus)[0].menu.planningV1.purchasedQuantities[0].quantity).toBeGreaterThan(0);
    expect((await saved(page)).operations[0].opId).toBe(pendingId);
    state.failShoppingCheckRequest = undefined;
    await page.getByRole('button', { name: 'Проверить синхронизацию', exact: true }).click();
    await expect.poll(async () => (await saved(page)).operations.length).toBe(0);
    await expect(checkbox).toBeEnabled(); await expect(checkbox).not.toBeChecked();
    expect(state.familyPurchaseMutations!.slice(1).every(item => item.baseVersion === 2)).toBe(true);
    await page.reload(); await navigate(page, 'Покупки'); await expect(checkbox).not.toBeChecked();
    expect(state.shoppingAchievements).toEqual([]);
    expect(errors.filter(message => !/503 \(Service Unavailable\)/.test(message))).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  } finally { fixture.releaseShoppingCheck(); }
});
test('a delayed personal shopping-list read cannot cross the account boundary', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, true, true);
  await openApp(page, '/#plan');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await expect(page.locator('#shopping-list')).toBeVisible();
  await expect.poll(() => state.personalShoppingListRequests).toBe(1);
  expect(state.personalShoppingListAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB, true);
    await expect.poll(() => state.personalShoppingListRequests).toBe(2);
    const accountBItem = accountBPage.getByText('Список B', { exact: true });
    await expect(accountBItem).toBeVisible();
    expect(state.personalShoppingListAccounts).toEqual([accountA.id, accountB.id]);

    fixtureA.releasePersonalShoppingList();
    await expect.poll(() => state.releasedPersonalShoppingLists).toBe(1);
    await expect.poll(() => state.rejectedPersonalShoppingLists).toBe(1);
    await expect(accountBItem).toBeVisible();
    await expect(accountBPage.getByText('Список A', { exact: true })).toHaveCount(0);
    await accountBItem.scrollIntoViewIfNeeded();
    await expect(accountBItem).toBeInViewport();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('personal-shopping-list-account-b.png') });
  } finally {
    fixtureA.releasePersonalShoppingList();
  }
});

test('personal shopping CSV exports only the current account snapshot', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  await installAccountApi(page, state, false, errorsA, false, false, true);
  await openApp(page, '/#plan');
  await expect(page.locator('#shopping-list')).toBeVisible();
  await expect(page.getByText('Список A', { exact: true })).toBeVisible();

  const accountBPage = await openAccountB(context, state, errorsB, true, 'plan');
  await expect(accountBPage.getByText('Список B', { exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountB.id);

  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toHaveCount(0);

  const currentDownloadPromise = accountBPage.waitForEvent('download');
  await accountBPage.getByRole('button', { name: 'CSV', exact: true }).click();
  const currentDownload = await currentDownloadPromise;
  expect(currentDownload.suggestedFilename()).toBe('shopping_2026-10-12.csv');
  const stream = await currentDownload.createReadStream();
  expect(stream).not.toBeNull();
  let csv = '';
  for await (const chunk of stream!) csv += Buffer.from(chunk).toString('utf8');
  expect(csv).toContain('Список B');
  expect(csv).not.toContain('Список A');
  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
});

test('a delayed personal shopping check from account A is rejected after account B signs in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, true, false, true);
  await openApp(page, '/#plan');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const accountACheckbox = page.locator('#shopping-list').getByRole('checkbox', { name: 'Список A 400 г', exact: true });
  await expect(accountACheckbox).toBeVisible();
  await setPurchasedCheckbox(accountACheckbox, true);
  await expect.poll(() => state.personalShoppingCheckRequests).toBe(1);
  expect(state.personalShoppingCheckAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB, true);
    const accountBCheckbox = accountBPage.locator('#shopping-list').getByRole('checkbox', { name: 'Список B 400 г', exact: true });
    await expect(accountBCheckbox).toBeVisible();
    await expect(accountBCheckbox).not.toBeChecked();
    expect(await activeAccount(page)).toBe(accountB.id);

    fixtureA.releaseShoppingCheck();
    await expect.poll(() => state.releasedShoppingChecks).toBe(1);
    await expect.poll(() => state.rejectedPersonalShoppingChecks).toBe(1);
    await expect(accountBCheckbox).not.toBeChecked();
    await accountBCheckbox.scrollIntoViewIfNeeded();
    await expect(accountBCheckbox).toBeInViewport();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(state.shoppingAchievements).toEqual([]);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('personal-shopping-check-account-b.png') });
  } finally {
    fixtureA.releaseShoppingCheck();
  }
});

test('personal shopping toggles for one item reach the server in user-intent order', async ({ page }, info) => {
  const errors: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    personalShoppingCheckValues: [], personalShoppingCheckCommits: [], personalShoppingCheckedByAccount: {},
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixture = await installAccountApi(page, state, false, errors, true, false, true);
  const checkbox = page.locator('#shopping-list').getByRole('checkbox', { name: 'Список A 400 г', exact: true });

  try {
    await openApp(page, '/#plan');
    await expect(page).toHaveTitle(/FitFocus/);
    await expect(page.locator('#shopping-list')).toBeVisible();
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    await setPurchasedCheckbox(checkbox, true);
    await expect.poll(() => state.personalShoppingCheckRequests).toBe(1);
    await setPurchasedCheckbox(checkbox, false);
    await expect(checkbox).not.toBeChecked();

    // The first server write is held. A newer intent must wait instead of racing it.
    await page.waitForTimeout(250);
    expect(state.personalShoppingCheckRequests).toBe(1);
    expect(state.personalShoppingCheckValues).toEqual([true]);

    fixture.releaseShoppingCheck();
    await expect.poll(() => state.personalShoppingCheckRequests).toBe(2);
    await expect.poll(() => state.personalShoppingCheckCommits?.length).toBe(2);
    expect(state.personalShoppingCheckValues).toEqual([true, false]);
    expect(state.personalShoppingCheckCommits).toEqual([true, false]);

    await page.reload();
    await expect(page.locator('#shopping-list')).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    expect(errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixture.releaseShoppingCheck();
  }
});

test('a delayed support ticket list from account A cannot appear in account B', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    supportListAccounts: [], releasedSupportLists: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, false, false, false, false, false, false, false, true);
  await openApp(page, '/#support');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await expect.poll(() => state.supportListAccounts?.length).toBe(1);
  expect(state.supportListAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB, false, 'support');
    expect(state.supportListAccounts).toEqual([accountA.id, accountB.id]);
    const accountBTicket = accountBPage.getByRole('heading', { name: 'Обращение B', exact: true });
    await expect(accountBTicket).toBeVisible();

    fixtureA.releaseSupportList();
    await expect.poll(() => state.releasedSupportLists).toBe(1);
    await expect(accountBTicket).toBeVisible();
    await expect(accountBPage.getByRole('heading', { name: 'Обращение A', exact: true })).toHaveCount(0);
    await accountBTicket.scrollIntoViewIfNeeded();
    await expect(accountBTicket).toBeInViewport();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('support-account-switch-b.png') });
  } finally {
    fixtureA.releaseSupportList();
  }
});

test('a delayed support ticket list from a retired same-account session is discarded after reauthentication', async ({ page, context }) => {
  const errors: string[] = [], renewedErrors: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [],
    releasedMembers: 0, supportListAccounts: [], releasedSupportLists: 0,
  };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, false, errors, false, false, false, false, false, false, false, false, true);
  const reauthenticated: Account = { id: accountA.id, sid: 'd'.repeat(64), name: accountA.name };
  const renewedTicket = {
    id: `ticket-${accountA.id}`, created_at: 2, updated_at: 2, category: 'Ошибка', section: 'Обзор',
    subject: 'Обращение новой сессии', message: 'Тикет из актуальной сессии', status: 'new', priority: 'normal',
    attachment_count: 0, messages: [],
  };
  const installRenewedSupportResponse = async (target: Page) => {
    await target.route('**/api/support/feedback/my*', async route => {
      const request = route.request();
      if (request.headers()['x-fitfocus-state-session'] !== reauthenticated.sid) return route.fallback();
      expect(request.headers()['x-fitfocus-state-account']).toBe(accountA.id);
      const body = new URL(request.url()).searchParams.has('id')
        ? { ticket: renewedTicket }
        : { tickets: [renewedTicket] };
      return route.fulfill({
        contentType: 'application/json',
        headers: scopedHeaders(reauthenticated),
        body: JSON.stringify(body),
      });
    });
  };
  await installRenewedSupportResponse(page);
  await openApp(page, '/#support');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
  await expect.poll(() => state.supportListAccounts?.length).toBe(1);
  expect(state.supportListAccounts).toEqual([accountA.id]);

  const previousSession = await activeSessionIdentity(page);
  expect(previousSession?.serverSessionId).toBe(accountA.sid);
  const renewedPage = await context.newPage();
  renewedPage.on('pageerror', error => renewedErrors.push(error.message));
  renewedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) renewedErrors.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(renewedPage, state, false, renewedErrors);
  await installRenewedSupportResponse(renewedPage);

  try {
    state.current = reauthenticated;
    await openApp(renewedPage, '/#support');
    await expect.poll(async () => activeSessionIdentity(renewedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    const currentSession = await activeSessionIdentity(renewedPage);
    expect(currentSession?.sessionEpoch).not.toBe(previousSession?.sessionEpoch);
    const currentTicketTitle = renewedPage.getByRole('heading', { name: renewedTicket.subject, exact: true });
    await expect(currentTicketTitle).toBeVisible();
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();

    fixtureA.releaseSupportList();
    await expect.poll(() => state.releasedSupportLists).toBe(1);
    await expect(currentTicketTitle).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Обращение A', exact: true })).toHaveCount(0);
    await expect(renewedPage.getByRole('heading', { name: 'Обращение A', exact: true })).toHaveCount(0);
    await expect(renewedPage.getByText(renewedTicket.message, { exact: true })).toBeVisible();
    await expect(page.getByText('Сессия изменилась или истекла. Войдите снова и повторите действие.')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(renewedErrors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(renewedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releaseSupportList();
  }
});

test('a delayed support ticket detail and attachment from a retired same-account session are discarded after reauthentication', async ({ page, context }) => {
  const errors: string[] = [], renewedErrors: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [],
    releasedMembers: 0, supportAttachmentRequests: [],
  };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(page, state, false, errors);
  const reauthenticated: Account = { id: accountA.id, sid: 'e'.repeat(64), name: accountA.name };
  const oldTicket = {
    id: 'retired-session-ticket', created_at: 1, updated_at: 1, category: 'Ошибка', section: 'Обзор',
    subject: 'Обращение прежней сессии', message: 'Секретный ответ прежней сессии', status: 'new', priority: 'normal',
    attachment_count: 1,
    attachments: [{ name: 'private-old-session.gif', mime: 'image/gif', size: 26, kind: 'photo',
      data_url: '/api/support/attachment?id=retired-session-ticket&index=0' }],
    messages: [],
  };
  const currentTicket = {
    id: 'current-session-ticket', created_at: 2, updated_at: 2, category: 'Ошибка', section: 'Обзор',
    subject: 'Обращение текущей сессии', message: 'Актуальный ответ поддержки', status: 'new', priority: 'normal',
    attachment_count: 0, attachments: [], messages: [],
  };
  const held = deferred();
  let heldDetails = 0, releasedDetails = 0;
  await page.route('**/api/support/feedback/my*', async route => {
    const request = route.request();
    const sessionId = request.headers()['x-fitfocus-state-session'];
    if (sessionId === accountA.sid) {
      if (new URL(request.url()).searchParams.has('id')) {
        heldDetails += 1;
        await held.promise;
        await route.fulfill({
          contentType: 'application/json', headers: scopedHeaders(accountA),
          body: JSON.stringify({ ticket: oldTicket }),
        });
        releasedDetails += 1;
        return;
      }
      return route.fulfill({
        contentType: 'application/json', headers: scopedHeaders(accountA),
        body: JSON.stringify({ tickets: [oldTicket] }),
      });
    }
    if (sessionId === reauthenticated.sid) {
      const body = new URL(request.url()).searchParams.has('id')
        ? { ticket: currentTicket }
        : { tickets: [currentTicket] };
      return route.fulfill({
        contentType: 'application/json', headers: scopedHeaders(reauthenticated), body: JSON.stringify(body),
      });
    }
    return route.fallback();
  });

  await openApp(page, '/#support');
  await expect(page.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Обращение прежней сессии/ })).toBeVisible();
  await expect.poll(() => heldDetails).toBe(1);
  const previousSession = await activeSessionIdentity(page);
  expect(previousSession?.serverSessionId).toBe(accountA.sid);

  const renewedPage = await context.newPage();
  renewedPage.on('pageerror', error => renewedErrors.push(error.message));
  renewedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) renewedErrors.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(renewedPage, state, false, renewedErrors);
  await renewedPage.route('**/api/support/feedback/my*', async route => {
    const request = route.request();
    expect(request.headers()['x-fitfocus-state-account']).toBe(accountA.id);
    expect(request.headers()['x-fitfocus-state-session']).toBe(reauthenticated.sid);
    const body = new URL(request.url()).searchParams.has('id')
      ? { ticket: currentTicket }
      : { tickets: [currentTicket] };
    return route.fulfill({
      contentType: 'application/json', headers: scopedHeaders(reauthenticated), body: JSON.stringify(body),
    });
  });

  try {
    state.current = reauthenticated;
    await openApp(renewedPage, '/#support');
    await expect.poll(async () => activeSessionIdentity(renewedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    const currentSession = await activeSessionIdentity(renewedPage);
    expect(currentSession?.sessionEpoch).not.toBe(previousSession?.sessionEpoch);
    const currentTicketMessage = renewedPage.getByText(currentTicket.message, { exact: true });
    await expect(currentTicketMessage).toBeVisible();
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();

    held.release();
    await expect.poll(() => releasedDetails).toBe(1);
    await expect(renewedPage.getByText(oldTicket.message, { exact: true })).toHaveCount(0);
    await expect(page.getByText(oldTicket.message, { exact: true })).toHaveCount(0);
    await expect(renewedPage.getByText('private-old-session.gif', { exact: true })).toHaveCount(0);
    await expect(currentTicketMessage).toBeVisible();
    expect(state.supportAttachmentRequests).toEqual([]);
    await expect(page.getByText('Сессия изменилась или истекла. Войдите снова и повторите действие.')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(renewedErrors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(renewedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    held.release();
  }
});

test('a delayed support ticket creation from a retired same-account session does not report success after reauthentication', async ({ page, context }) => {
  const errors: string[] = [], renewedErrors: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const reauthenticated: Account = { ...accountA, sid: '6'.repeat(64) };
  const held = deferred();
  const createSessions: string[] = [];
  let releasedCreates = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(page, state, false, errors);
  await page.route('**/api/support/feedback', async route => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    expect(request.headers()['x-fitfocus-state-account']).toBe(accountA.id);
    expect(request.headers()['x-fitfocus-state-session']).toBe(accountA.sid);
    createSessions.push(request.headers()['x-fitfocus-state-session'] ?? '');
    await held.promise;
    releasedCreates += 1;
    return route.fulfill({
      contentType: 'application/json',
      headers: scopedHeaders(accountA),
      body: JSON.stringify({ ok: true, id: 'retired-session-created-ticket' }),
    });
  });

  await openApp(page, '/#support');
  await expect(page.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
  await page.getByPlaceholder('Например: кнопка не нажимается после сохранения рецепта').fill('Тема из прежней сессии');
  await page.getByPlaceholder('Что произошло, что вы ожидали увидеть и что увидели на самом деле').fill('Описание из прежней сессии');
  await page.getByRole('button', { name: 'Отправить обращение' }).click();
  await expect.poll(() => createSessions.length).toBe(1);

  const previousSession = await activeSessionIdentity(page);
  expect(previousSession?.serverSessionId).toBe(accountA.sid);
  const renewedPage = await context.newPage();
  renewedPage.on('pageerror', error => renewedErrors.push(error.message));
  renewedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) renewedErrors.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(renewedPage, state, false, renewedErrors);

  try {
    state.current = reauthenticated;
    await openApp(renewedPage, '/#support');
    await expect.poll(async () => activeSessionIdentity(renewedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    const currentSession = await activeSessionIdentity(renewedPage);
    expect(currentSession?.sessionEpoch).not.toBe(previousSession?.sessionEpoch);
    const successMessage = 'Обращение отправлено. Оно появится в админке и будет доступно для проверки.';
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await expect(renewedPage.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
    await expect(renewedPage.getByText(successMessage, { exact: true })).toHaveCount(0);

    held.release();
    await expect.poll(() => releasedCreates).toBe(1);
    expect(createSessions).toEqual([accountA.sid]);
    await expect(page.getByText(successMessage, { exact: true })).toHaveCount(0);
    await expect(renewedPage.getByText(successMessage, { exact: true })).toHaveCount(0);
    await expect(renewedPage.getByRole('heading', { name: 'Тема из прежней сессии', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(renewedErrors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(renewedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    held.release();
  }
});

test('a delayed support reply from a retired same-account session does not refresh the ticket after reauthentication', async ({ page, context }) => {
  const errors: string[] = [], renewedErrors: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const reauthenticated: Account = { ...accountA, sid: '7'.repeat(64) };
  const held = deferred();
  const replySessions: string[] = [];
  const supportReadSessions: string[] = [];
  let releasedReplies = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(page, state, false, errors);
  await page.route('**/api/support/feedback/my*', async route => {
    const request = route.request();
    const sessionId = request.headers()['x-fitfocus-state-session'] ?? '';
    if (request.method() === 'GET') supportReadSessions.push(sessionId);
    if (request.method() !== 'POST') return route.fallback();
    expect(request.headers()['x-fitfocus-state-account']).toBe(accountA.id);
    expect(sessionId).toBe(accountA.sid);
    replySessions.push(sessionId);
    await held.promise;
    releasedReplies += 1;
    return route.fulfill({
      contentType: 'application/json',
      headers: scopedHeaders(accountA),
      body: JSON.stringify({
        ok: true,
        ticket: {
          id: `ticket-${accountA.id}`,
          messages: [{ id: 'retired-reply', author_role: 'user', author_user_id: accountA.id,
            message: 'Ответ из завершённой сессии', created_at: 3, attachment_count: 0 }],
        },
      }),
    });
  });

  await openApp(page, '/#support');
  await expect(page.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Обращение A', exact: true })).toBeVisible();
  await page.getByPlaceholder('Добавьте уточнение, новые шаги или скриншот').fill('Ответ из завершённой сессии');
  await page.getByRole('button', { name: 'Отправить ответ' }).click();
  await expect.poll(() => replySessions.length).toBe(1);

  const previousSession = await activeSessionIdentity(page);
  expect(previousSession?.serverSessionId).toBe(accountA.sid);
  const renewedPage = await context.newPage();
  renewedPage.on('pageerror', error => renewedErrors.push(error.message));
  renewedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) renewedErrors.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(renewedPage, state, false, renewedErrors);

  try {
    state.current = reauthenticated;
    await openApp(renewedPage, '/#support');
    await expect.poll(async () => activeSessionIdentity(renewedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    const currentSession = await activeSessionIdentity(renewedPage);
    expect(currentSession?.sessionEpoch).not.toBe(previousSession?.sessionEpoch);
    await expect(renewedPage.getByText(`Секретное обращение ${accountA.id}`, { exact: true })).toBeVisible();
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    const readsBeforeRelease = supportReadSessions.length;

    held.release();
    await expect.poll(() => releasedReplies).toBe(1);
    expect(replySessions).toEqual([accountA.sid]);
    expect(supportReadSessions.slice(readsBeforeRelease)).toEqual([]);
    await expect(page.getByText('Ответ из завершённой сессии', { exact: true })).toHaveCount(0);
    await expect(renewedPage.getByText('Ответ из завершённой сессии', { exact: true })).toHaveCount(0);
    await expect(renewedPage.getByText(`Секретное обращение ${accountA.id}`, { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    expect(renewedErrors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(renewedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    held.release();
  }
});

test('loads support ticket and reply attachments with the captured session proof', async ({ page }) => {
  const errors: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [],
    releasedMembers: 0, supportAttachmentRequests: [],
  };
  await installAccountApi(page, state, false, errors);
  await openApp(page, '/#support');

  await expect(page.getByRole('heading', { name: 'Мои обращения', exact: true })).toBeVisible();
  const ticketImage = page.getByRole('img', { name: 'ticket-evidence.gif' });
  const replyImage = page.getByRole('img', { name: 'reply-evidence.gif' });
  await expect(ticketImage).toBeVisible();
  await expect(replyImage).toBeVisible();
  await expect.poll(() => ticketImage.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1);
  await expect.poll(() => replyImage.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1);

  expect(state.supportAttachmentRequests).toEqual([
    { account: accountA.id, session: accountA.sid },
    { account: accountA.id, session: accountA.sid },
  ]);
  expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('a delayed mobile token from account A is neither shown nor copied after account B signs in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    mobileTokenAccounts: [], releasedMobileTokens: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA,
    false, false, false, false, false, false, false, false, false, true);
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const generateButton = page.getByRole('button', { name: 'Сгенерировать token' });
  await expect(generateButton).toBeVisible();
  await generateButton.click();
  await expect.poll(() => state.mobileTokenAccounts?.length).toBe(1);
  expect(state.mobileTokenAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB, false, 'settings');
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseMobileToken();
    await expect.poll(() => state.releasedMobileTokens).toBe(1);

    await expect(page.getByText('account-a-mobile-token-secret', { exact: true })).toHaveCount(0);
    await expect(accountBPage.getByText('account-a-mobile-token-secret', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Mobile token', { exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __fitfocusClipboardWrites?: string[] }).__fitfocusClipboardWrites ?? [])).toEqual([]);
    expect(await activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('mobile-token-account-b.png') });
  } finally {
    fixtureA.releaseMobileToken();
  }
});

test('a delayed mobile token from a retired same-account session is neither shown nor copied after reauthentication', async ({ page, context }) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const reauthenticated: Account = { ...accountA, sid: 'f'.repeat(64) };
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    mobileTokenAccounts: [], releasedMobileTokens: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA,
    false, false, false, false, false, false, false, false, false, true);
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
    accountId: accountA.id,
    serverSessionId: accountA.sid,
  });
  const previousSession = await activeSessionIdentity(page);
  await page.getByRole('button', { name: 'Сгенерировать token' }).click();
  await expect.poll(() => state.mobileTokenAccounts?.length).toBe(1);
  expect(state.mobileTokenAccounts).toEqual([accountA.id]);

  const renewedPage = await context.newPage();
  renewedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  renewedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(renewedPage, state, false, errorsReauthenticated);
  await renewedPage.addInitScript(() => {
    const target = window as Window & { __fitfocusClipboardWrites?: string[] };
    target.__fitfocusClipboardWrites = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { target.__fitfocusClipboardWrites?.push(value); } },
    });
  });
  const renewedToken = 'current-session-mobile-token';
  const renewedTokenSessions: string[] = [];
  await renewedPage.route('**/api/mobile/token', async route => {
    const request = route.request();
    expect(request.headers()['x-fitfocus-state-account']).toBe(accountA.id);
    expect(request.headers()['x-fitfocus-state-session']).toBe(reauthenticated.sid);
    renewedTokenSessions.push(request.headers()['x-fitfocus-state-session'] ?? '');
    return route.fulfill({
      contentType: 'application/json',
      headers: scopedHeaders(reauthenticated),
      body: JSON.stringify({ token: renewedToken, expiresAt: Date.now() + 60_000 }),
    });
  });

  try {
    state.current = reauthenticated;
    await openApp(renewedPage, '/#settings');
    await expect.poll(() => activeSessionIdentity(renewedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    const currentSession = await activeSessionIdentity(renewedPage);
    expect(currentSession?.sessionEpoch).not.toBe(previousSession?.sessionEpoch);
    const createToken = renewedPage.getByRole('button', { name: 'Сгенерировать token' });
    await expect(createToken).toBeEnabled();
    await createToken.click();
    const currentToken = renewedPage.getByText(renewedToken, { exact: true });
    await expect(currentToken).toBeVisible();
    await expect.poll(() => renewedPage.evaluate(() =>
      (window as Window & { __fitfocusClipboardWrites?: string[] }).__fitfocusClipboardWrites ?? [])).toEqual([renewedToken]);
    await expect.poll(async () => activeSessionIdentity(page)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');

    fixtureA.releaseMobileToken();
    await expect.poll(() => state.releasedMobileTokens).toBe(1);
    await expect(page.getByText('account-a-mobile-token-secret', { exact: true })).toHaveCount(0);
    await expect(renewedPage.getByText('account-a-mobile-token-secret', { exact: true })).toHaveCount(0);
    await expect(currentToken).toBeVisible();
    await expect.poll(() => renewedPage.evaluate(() =>
      (window as Window & { __fitfocusClipboardWrites?: string[] }).__fitfocusClipboardWrites ?? [])).toEqual([renewedToken]);
    await expect.poll(() => page.evaluate(() =>
      (window as Window & { __fitfocusClipboardWrites?: string[] }).__fitfocusClipboardWrites ?? [])).toEqual([]);
    expect(renewedTokenSessions).toEqual([reauthenticated.sid]);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(renewedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releaseMobileToken();
  }
});

test('a delayed push status from account A cannot update Settings after account B signs in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    pushStatusAccounts: [], releasedPushStatuses: 0,
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA,
    false, false, false, false, false, false, false, false, false, false, true);
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await expect.poll(() => state.pushStatusAccounts).toContain(accountA.id);

  try {
    const accountBPage = await openAccountB(context, state, errorsB, false, 'settings');
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    await expect(accountBPage.getByText(/ACCOUNT_B_PUSH_STATUS_ONLY/)).toBeVisible();

    fixtureA.releasePushStatus();
    await expect.poll(() => state.releasedPushStatuses).toBe(1);
    await expect(page.getByText(/ACCOUNT_A_PUSH_STATUS_ONLY/)).toHaveCount(0);
    await expect(accountBPage.getByText(/ACCOUNT_B_PUSH_STATUS_ONLY/)).toBeVisible();
    expect(await activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('push-status-account-switch-b.png') });
  } finally {
    fixtureA.releasePushStatus();
  }
});

test('a delayed push status from the previous same-account session cannot update Settings after reauthentication', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const reauthenticated = { ...accountA, sid: 'c'.repeat(64) };
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    pushStatusAccounts: [], pushStatusSessions: [], releasedPushStatuses: 0,
    pushStatusLastErrors: {
      [accountA.sid]: 'OLD_SESSION_PUSH_STATUS_ONLY',
      [reauthenticated.sid]: 'NEW_SESSION_PUSH_STATUS_ONLY',
    },
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA,
    false, false, false, false, false, false, false, false, false, false, true);
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
    accountId: accountA.id,
    serverSessionId: accountA.sid,
  });
  await expect.poll(() => state.pushStatusSessions).toContain(accountA.sid);
  const reauthenticatedPage = await context.newPage();
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);

  try {
    state.current = reauthenticated;
    await openApp(reauthenticatedPage, '/#settings');
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect.poll(() => state.pushStatusSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
    const currentStatus = reauthenticatedPage.getByText(/NEW_SESSION_PUSH_STATUS_ONLY/);
    await expect(currentStatus).toBeVisible();
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');

    fixtureA.releasePushStatus();
    await expect.poll(() => state.releasedPushStatuses).toBe(1);
    await expect(currentStatus).toBeVisible();
    await expect(reauthenticatedPage.getByText(/OLD_SESSION_PUSH_STATUS_ONLY/)).toHaveCount(0);
    expect(state.pushStatusSessions).toEqual([accountA.sid, reauthenticated.sid]);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releasePushStatus();
    fixtureReauthenticated.releasePushStatus();
  }
});

test('a delayed checkout URL from account A is not opened after account B signs in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    billingCheckoutAccounts: [], releasedBillingCheckouts: 0, plans: { [accountA.id]: 'free' },
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA,
    false, false, false, false, false, false, false, false, false, false, false, true);
  const popups: Page[] = [];
  page.on('popup', popup => popups.push(popup));
  await openApp(page, '/#pro');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  await page.getByRole('button', { name: 'Выбрать тарифный план' }).click();
  await expect(page.getByRole('heading', { name: 'Тарифы', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Оформить Pro', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть Stripe Checkout', exact: true }).click();
  await expect.poll(() => state.billingCheckoutAccounts?.length).toBe(1);
  expect(state.billingCheckoutAccounts).toEqual([accountA.id]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    fixtureA.releaseBillingCheckout();
    await expect.poll(() => state.releasedBillingCheckouts).toBe(1);
    await page.waitForTimeout(200);

    expect(popups).toHaveLength(0);
    expect(page.url()).toContain('/#pro');
    await expect(accountBPage.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
    expect(await activeAccount(page)).toBe(accountB.id);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('billing-account-switch-b.png') });
  } finally {
    fixtureA.releaseBillingCheckout();
  }
});

test('a delayed checkout URL from a previous same-account session is not opened after reauthentication', async ({ page, context }) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const reauthenticated = { ...accountA, sid: 'f'.repeat(64) };
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    billingCheckoutAccounts: [], releasedBillingCheckouts: 0, plans: { [accountA.id]: 'free' },
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA,
    false, false, false, false, false, false, false, false, false, false, false, true);
  const popupsA: Page[] = [], popupsReauthenticated: Page[] = [];
  page.on('popup', popup => popupsA.push(popup));
  await openApp(page, '/#pro');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);
  const previousSession = await activeSessionIdentity(page);
  expect(previousSession?.serverSessionId).toBe(accountA.sid);
  expect(previousSession?.sessionEpoch).toBeTruthy();
  await page.getByRole('button', { name: 'Выбрать тарифный план' }).click();
  await expect(page.getByRole('heading', { name: 'Тарифы', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Оформить Pro', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть Stripe Checkout', exact: true }).click();
  await expect.poll(() => state.billingCheckoutAccounts?.length).toBe(1);
  expect(state.billingCheckoutAccounts).toEqual([accountA.id]);

  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);
  reauthenticatedPage.on('popup', popup => popupsReauthenticated.push(popup));

  try {
    await openApp(reauthenticatedPage, '/#settings');
    await expect.poll(() => fixtureReauthenticated.meSessionIds).toContain(reauthenticated.sid);
    await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    const nextSession = await activeSessionIdentity(reauthenticatedPage);
    expect(nextSession?.sessionEpoch).toBeTruthy();
    expect(nextSession?.sessionEpoch).not.toBe(previousSession?.sessionEpoch);
    await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
      accountId: accountA.id,
      serverSessionId: reauthenticated.sid,
    });
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');

    fixtureA.releaseBillingCheckout();
    await expect.poll(() => state.releasedBillingCheckouts).toBe(1);
    await page.waitForTimeout(200);

    expect(popupsA).toHaveLength(0);
    expect(popupsReauthenticated).toHaveLength(0);
    expect(page.url()).toContain('/#pro');
    expect(reauthenticatedPage.url()).toContain('/#settings');
    expect(state.billingCheckoutAccounts).toEqual([accountA.id]);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.releaseBillingCheckout();
    fixtureReauthenticated.releaseBillingCheckout();
  }
});

test('a delayed family member update stays bound to its captured family after the same login loads another family', async ({ page }, info) => {
  const errors: string[] = [];
  const state: FixtureState = {
    current: accountA, familyId: 'family-a-original', inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [],
    memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
  };
  const fixture = await installAccountApi(page, state, false, errors, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Меню семьи', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Семья family-a-original', exact: true })).toBeVisible();

  try {
    await editOwnDiningProfile(page);
    await expect.poll(() => state.memberRequests).toBe(1);
    expect(state.memberTargetIds).toEqual(['family-a-original']);

    state.familyId = 'family-a-next';
    await resumeFamilyPage(page);
    await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Семья family-a-next', exact: true })).toBeVisible();
    fixture.releaseMemberUpdate();
    await expect.poll(() => state.releasedMembers).toBe(1);
    await expect(page.getByRole('heading', { name: 'Семья family-a-next', exact: true })).toBeVisible();
    await expect(page.getByText('Сессия изменилась. Войдите снова и повторите действие.', { exact: true })).toHaveCount(0);
    expect(state.memberRequests).toBe(1);
    expect(errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixture.releaseMemberUpdate();
  }
});

test('a delayed family member update from the previous same-account session is discarded after reauthentication', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  const state: FixtureState = {
    current: accountA, familyId: 'family-before-reauthentication', inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [],
    memberSessionIds: [], releasedMembers: 0, familyLoadSessions: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Семья family-before-reauthentication', exact: true })).toBeVisible();
  await expect.poll(() => state.familyLoadSessions?.filter(session => session === accountA.sid).length).toBeGreaterThan(0);

  try {
    await editOwnDiningProfile(page);
    await expect.poll(() => state.memberRequests).toBe(1);
    expect(state.memberTargetIds).toEqual(['family-before-reauthentication']);
    expect(state.memberSessionIds).toEqual([accountA.sid]);
    const previousSessionFamilyLoads = state.familyLoadSessions?.filter(session => session === accountA.sid).length;

    const reauthenticated = { ...accountA, sid: 'e'.repeat(64) };
    state.current = reauthenticated;
    state.familyId = 'family-after-reauthentication';
    const reauthenticatedPage = await context.newPage();
    const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state, false, errorsReauthenticated);

    try {
      await openApp(reauthenticatedPage, '/#family');
      await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-after-reauthentication', exact: true })).toBeVisible();
      await expect.poll(() => activeSessionIdentity(reauthenticatedPage)).toMatchObject({
        accountId: accountA.id,
        serverSessionId: reauthenticated.sid,
      });
      await expect.poll(() => state.familyLoadSessions?.filter(session => session === reauthenticated.sid).length).toBeGreaterThan(0);
      await expect.poll(() => activeSessionIdentity(page)).toMatchObject({
        accountId: accountA.id,
        serverSessionId: reauthenticated.sid,
      });
      await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');

      fixtureA.releaseMemberUpdate();
      await expect.poll(() => state.releasedMembers).toBe(1);
      await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
      await expect(page.getByRole('heading', { name: 'Семья family-after-reauthentication', exact: true })).toHaveCount(0);
      await expect(reauthenticatedPage.getByRole('heading', { name: 'Семья family-after-reauthentication', exact: true })).toBeVisible();
      expect(state.memberRequests).toBe(1);
      expect(state.memberTargetIds).toEqual(['family-before-reauthentication']);
      expect(state.memberSessionIds).toEqual([accountA.sid]);
      expect(state.familyLoadSessions?.filter(session => session === accountA.sid)).toHaveLength(previousSessionFamilyLoads);
      expect(state.shoppingAchievements).toEqual([]);
      expect(errorsA).toEqual([]);
      expect(errorsReauthenticated).toEqual([]);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
    } finally {
      fixtureReauthenticated.releaseMemberUpdate();
    }
  } finally {
    fixtureA.releaseMemberUpdate();
  }
});

test('a delayed family member update from account A cannot affect account B after sign-in', async ({ page, context }, info) => {
  const errorsA: string[] = [], errorsB: string[] = [];
  const state: FixtureState = {
    current: accountA, inviteRequests: 0, inviteTargetIds: [], releasedInvites: 0,
    shoppingCheckRequests: 0, shoppingCheckAccounts: [], releasedShoppingChecks: 0,
    personalShoppingListRequests: 0, personalShoppingListAccounts: [], releasedPersonalShoppingLists: 0,
    rejectedPersonalShoppingLists: 0, personalShoppingCheckRequests: 0, personalShoppingCheckAccounts: [],
    rejectedPersonalShoppingChecks: 0, shoppingAchievements: [], memberRequests: 0, memberTargetIds: [], releasedMembers: 0,
    familyLoadAccounts: [],
  };
  const fixtureA = await installAccountApi(page, state, false, errorsA, false, true);
  await openApp(page, '/#family');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: accountA.name, exact: true })).toBeVisible();
  await expect.poll(() => activeAccount(page)).toBe(accountA.id);

  await editOwnDiningProfile(page);
  await expect.poll(() => state.memberRequests).toBe(1);
  expect(state.memberTargetIds).toEqual([`family-${accountA.id}`]);

  try {
    const accountBPage = await openAccountB(context, state, errorsB);
    expect(await activeAccount(page)).toBe(accountB.id);
    const accountAFamilyLoadsAfterSwitch = state.familyLoadAccounts.filter(id => id === accountA.id).length;

    fixtureA.releaseMemberUpdate();
    await expect.poll(() => state.releasedMembers).toBe(1);
    await expect(accountBPage.getByRole('heading', { name: accountB.name, exact: true })).toBeVisible();
    await expect.poll(() => activeAccount(page)).toBe(accountB.id);
    expect(state.memberRequests).toBe(1);
    expect(state.memberTargetIds).toEqual([`family-${accountA.id}`]);
    expect(state.familyLoadAccounts.filter(id => id === accountA.id)).toHaveLength(accountAFamilyLoadsAfterSwitch);
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(accountBPage.locator('vite-error-overlay')).toHaveCount(0);
    await accountBPage.screenshot({ path: info.outputPath('family-member-account-b.png') });
  } finally {
    fixtureA.releaseMemberUpdate();
  }
});
