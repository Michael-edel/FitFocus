import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FamilyWeeklyMenu, UserProfile } from '../../types';
import { isRecord } from '../../safeJson';
import { isDiningProfileInput, isFamilyPlanningMenu, deriveLegacyFamilyMenu, projectFamilyDay,
  type DiningPrivateProfile, type FamilyRoster, type FamilyMealSelection, type PlannedFamilyMenu,
  type FamilyPlanningV1, type RawUnit } from '../../domain/familyPlanning';
import { FAMILY_INGREDIENTS } from '../../domain/familyPlanningCatalog';
import { FamilyMenuRepository, type FamilyMenuObservation } from '../../storage/familyMenuRepository';
import { DurableOutbox, type OutboxOperation, type OutboxReadGuard } from '../../storage/durableOutbox';
import { stateSync } from '../../storage/stateSync';
import { isFamilyMenuSnapshot, isFamilyMenuIntent } from '../../familyMenuValidation';
import { familyErrorMessage, requestFamilyJson, type FamilySession } from '../../services/familySession';
import { FamilyActionScope } from '../family/actionScope';
import { createFamily, createFamilyInvite, joinFamily, type CloudFamily } from '../family/familyApi';
import { defaultSelections, emptyDrafts, profileDraft, profileErrors, profileInput,
  PUBLIC_ERRORS, readDraftCache, validDate, type PlanningDrafts, type ProfileDraft } from './planningUiState';

export type FamilyPlanningOptions = {
  currentUser: UserProfile; loginGuard: OutboxReadGuard | null; isCurrentSession: () => boolean;
  allowCachedUiStateRestore?: boolean; onSyncNow?: () => Promise<unknown>;
};
type Candidate = { menu: PlannedFamilyMenu; observation: FamilyMenuObservation; inputKey: string; familyId: string };
export type DeliveryState = { kind: 'loading' | 'empty' | 'local' | 'sending' | 'server' | 'conflict' | 'error';
  message: string; operation?: OutboxOperation; remote?: FamilyWeeklyMenu; expectedOpIds?: string[] };
type Archive = { familyId: string; periodStart: string; kind: 'legacy-weekly'; menu: FamilyWeeklyMenu };
type SelectionRecovery = { familyId: string; date: string; selections: FamilyMealSelection[] };
type EditorRead = { familyId: string | undefined; revision: number; editor: ProfileDraft | null };
export function profileReadCanApply(sent: EditorRead, current: EditorRead): boolean {
  return sent.familyId === current.familyId && sent.revision === current.revision && sent.editor === current.editor;
}
export function profileSelectionsCanApply(sentRevision: number, currentRevision: number, sentDate: string, currentDate: string): boolean {
  return sentRevision === currentRevision && sentDate === currentDate;
}

export function profileAckDraft(previous: PlanningDrafts, sent: ProfileDraft, accepted: ProfileDraft): PlanningDrafts {
  // A cancelled/replaced editor belongs to a different intention. Never resurrect it.
  if (!previous.profile || previous.profile.id !== sent.id) return previous;
  const edited = previous.profile !== sent;
  return { ...previous, profile: edited ? { ...previous.profile, id: accepted.id,
    baseVersion: accepted.baseVersion, baseRosterVersion: accepted.baseRosterVersion } : accepted,
    profileOpen: edited ? previous.profileOpen : false, profileDirty: edited };
}

export function legacySelectionRecovery(envelope: unknown, saved: PlanningDrafts): SelectionRecovery | null {
  if (!isRecord(envelope) || typeof envelope.familyId !== 'string') return null;
  const source = isRecord(envelope.selectionRecovery) ? envelope.selectionRecovery : null;
  if (source && source.familyId === envelope.familyId && typeof source.date === 'string' && validDate(source.date)) {
    const checked = readDraftCache(JSON.stringify({ version: 1, drafts: { ...saved, date: source.date,
      selectionDate: source.date, selections: source.selections } }), emptyDrafts(source.date));
    if (checked.selections.length) return { familyId: envelope.familyId, date: source.date, selections: checked.selections };
  }
  return typeof envelope.selectionDraft !== 'boolean' && saved.selections.length && saved.selectionDate === saved.date
    ? { familyId: envelope.familyId, date: saved.date, selections: structuredClone(saved.selections) } : null;
}

function requestOptions(method = 'GET', body?: unknown): RequestInit {
  return { method, credentials: 'include', ...(body === undefined ? {} : {
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) };
}
function checkedRoster(value: unknown, familyId: string): FamilyRoster {
  if (!isRecord(value) || value.familyId !== familyId || !Number.isSafeInteger(value.rosterVersion)
    || value.limit !== 5 || !Array.isArray(value.profiles) || !isRecord(value.planningConstraints)
    || !Array.isArray(value.planningConstraints.blockedIngredientIds)
    || !value.planningConstraints.blockedIngredientIds.every(id => typeof id === 'string')
    || typeof value.planningConstraints.incomplete !== 'boolean'
    || !value.profiles.every(profile => isRecord(profile) && profile.familyId === familyId
      && typeof profile.id === 'string' && typeof profile.displayName === 'string'
      && ['account', 'managed'].includes(String(profile.kind)) && Number.isSafeInteger(profile.version)
      && typeof profile.active === 'boolean' && typeof profile.canEdit === 'boolean')) {
    throw new Error('Не удалось проверить состав семьи. Повторите загрузку.');
  }
  return value as unknown as FamilyRoster;
}
function checkedProfile(value: unknown, familyId: string, id?: string): DiningPrivateProfile {
  if (!isRecord(value) || value.familyId !== familyId || typeof value.id !== 'string'
    || (id !== undefined && value.id !== id) || typeof value.displayName !== 'string'
    || !Number.isSafeInteger(value.version) || value.canEdit !== true || value.active !== true
    || !['account', 'managed'].includes(String(value.kind))
    || (value.configuration !== null && !isDiningProfileInput(value.configuration))) {
    throw new Error('Не удалось проверить профиль. Черновик не изменён.');
  }
  return value as unknown as DiningPrivateProfile;
}
function errorText(error: unknown): string {
  return error instanceof Error && PUBLIC_ERRORS[error.message] ? PUBLIC_ERRORS[error.message] : familyErrorMessage(error);
}
function snapshotMenu(value: string | undefined): FamilyWeeklyMenu | undefined {
  try { const parsed: unknown = value ? JSON.parse(value) : null;
    return isFamilyMenuIntent(parsed) ? parsed.menu : undefined;
  } catch { return undefined; }
}

export function restoredDaySelections(menu: FamilyWeeklyMenu | null, date: string, roster: FamilyRoster,
  userDraft?: FamilyMealSelection[]): FamilyMealSelection[] {
  if (userDraft !== undefined) return userDraft;
  return menu && isFamilyPlanningMenu(menu, date)
    ? menu.planningV1.meals.map(({ slot, recipeId, participantShares }) => ({ slot, recipeId, participantShares: { ...participantShares } }))
    : defaultSelections(roster);
}

export function previewDelivery(delivery: DeliveryState, hasPreview: boolean): DeliveryState {
  return hasPreview && (delivery.kind === 'server' || delivery.kind === 'empty')
    ? { ...delivery, message: delivery.kind === 'server'
      ? 'Предыдущая версия сохранена на сервере. Показанный предпросмотр ещё не сохранён — подтвердите его.'
      : 'Показанный предпросмотр ещё не сохранён — подтвердите его.' }
    : delivery;
}

export function useFamilyPlanning(options: FamilyPlanningOptions) {
  const { currentUser, loginGuard } = options;
  const latest = useRef(options); latest.current = options;
  const guardKey = loginGuard ? JSON.stringify([loginGuard.accountId, loginGuard.serverSessionId, loginGuard.sessionEpoch, loginGuard.authFence]) : '';
  const ownerKey = loginGuard ? JSON.stringify([loginGuard.accountId, loginGuard.serverSessionId, loginGuard.sessionEpoch]) : '';
  const scope = useMemo(() => new FamilyActionScope(() => {
    const now = latest.current;
    return !!loginGuard && now.currentUser.id === loginGuard.accountId && now.isCurrentSession()
      && now.allowCachedUiStateRestore !== false
      && !!now.loginGuard && JSON.stringify([now.loginGuard.accountId, now.loginGuard.serverSessionId, now.loginGuard.sessionEpoch, now.loginGuard.authFence]) === guardKey;
  }), [guardKey, currentUser.id]);
  const outbox = useMemo(() => new DurableOutbox(), [scope]);
  const [family, setFamily] = useState<CloudFamily | null>(null);
  const [roster, setRoster] = useState<FamilyRoster | null>(null);
  const [published, setPublished] = useState<FamilyWeeklyMenu | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [delivery, setDelivery] = useState<DeliveryState>({ kind: 'loading', message: 'Проверяем сохранённое меню…' });
  const [drafts, setDrafts] = useState<PlanningDrafts>(() => emptyDrafts());
  const [draftNotice, setDraftNotice] = useState('');
  const [selectionRecovery, setSelectionRecovery] = useState<SelectionRecovery | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [profileNotice, setProfileNotice] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [archives, setArchives] = useState<Archive[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const busyRef = useRef(false);
  const actionCounter = useRef(0);
  const repoRef = useRef<FamilyMenuRepository | null>(null);
  const familyRef = useRef(family); familyRef.current = family;
  const rosterRef = useRef(roster); rosterRef.current = roster;
  const draftsRef = useRef(drafts); draftsRef.current = drafts;
  const publishedRef = useRef(published); publishedRef.current = published;
  const candidateRef = useRef(candidate); candidateRef.current = candidate;
  const deliveryRef = useRef(delivery); deliveryRef.current = delivery;
  const ownReceipts = useRef(new Map<string, OutboxOperation>());
  const inputRevision = useRef(0);
  const profileEditorRevision = useRef(0);
  const profileIdentity = useRef(0);
  // Defaults and restored accepted selections are not user intent. Even an explicitly
  // empty selection is intent and must survive refresh and late HTTP/ACK responses.
  const selectionDraft = useRef(false);
  const draftFamilyId = useRef<string | null>(null);
  const cacheKey = `fitfocus.family-planning.draft.v1:${ownerKey}`;

  const run = useCallback(async (label: string, action: (session: FamilySession) => Promise<void>): Promise<boolean> => {
    if (busyRef.current || !loginGuard || !scope.isCurrent()) return false;
    const attempt = scope.begin('ui'); if (!attempt) return false;
    const actionId = ++actionCounter.current;
    busyRef.current = true; setBusy(label); setError('');
    const session: FamilySession = { guard: loginGuard, controller: attempt.controller, isCurrentSession: attempt.isCurrent, outbox };
    try {
      await action(session);
      return attempt.isCurrent();
    } catch (cause) {
      if (attempt.isCurrent()) setError(errorText(cause));
      return false;
    } finally {
      if (actionCounter.current === actionId) { if (attempt.isCurrent()) setBusy(null); busyRef.current = false; }
      attempt.finish();
    }
  }, [loginGuard, outbox, scope]);

  const request = useCallback(async (session: FamilySession, url: string, method = 'GET', body?: unknown) => {
    const result = await requestFamilyJson({ ...session, requireFamilyPlanning: url !== '/api/family' }, url, requestOptions(method, body));
    if (!session.isCurrentSession()) throw new Error('Сессия изменилась. Повторите вход.');
    if (!result.response.ok) {
      const data = isRecord(result.body) ? result.body : {};
      const detail = isRecord(data.error) ? data.error : data;
      const code = typeof detail.code === 'string' ? detail.code : typeof data.error === 'string' ? data.error : '';
      if (result.response.status === 402) throw new Error('Для общего меню нужен действующий семейный тариф организатора.');
      if (code === 'VERSION_CONFLICT' || result.response.status === 409 && !code) throw new Error(PUBLIC_ERRORS.CONFLICT);
      if (code === 'FAMILY_LIMIT') throw new Error(PUBLIC_ERRORS.FAMILY_LIMIT_REACHED);
      throw new Error(PUBLIC_ERRORS[code] ?? (typeof detail.message === 'string' ? detail.message : 'Не удалось выполнить действие. Черновик сохранён.'));
    }
    return result.body;
  }, []);

  const observeDelivery = useCallback(async (repository: FamilyMenuRepository) => {
    if (!loginGuard || !scope.isCurrent()) return;
    const result = await outbox.deliverySnapshot(currentUser.id, repository.key, loginGuard);
    if (!scope.isCurrent() || repoRef.current !== repository) return;
    const local = result.value ? snapshotMenu(result.value) ?? null : null;
    const operations = result.operations.filter(operation => operation.key === repository.key);
    const conflict = operations.find(operation => operation.status === 'conflicted');
    const failed = operations.find(operation => operation.status === 'failed');
    const pending = operations.find(operation => operation.status === 'sending') ?? operations.find(operation => operation.status === 'pending');
    let next: DeliveryState;
    if (conflict) next = { kind: 'conflict', message: 'Есть другая версия. Ваш вариант сохранён на устройстве. Сравните версии перед новым подтверждением.',
      operation: conflict, remote: snapshotMenu(conflict.serverSnapshot?.value), expectedOpIds: operations.map(operation => operation.opId) };
    else if (failed) next = { kind: 'error', message: 'Изменения сохранены на устройстве, но сервер их не принял. Проверьте синхронизацию.', operation: failed };
    else if (pending) next = { kind: pending.status === 'sending' ? 'sending' : 'local', operation: pending,
      message: pending.status === 'sending' ? 'Отправляем сохранённую версию…' : 'Сохранено на устройстве — ожидает отправки.' };
    else {
      const own = ownReceipts.current.get(repository.key);
      const acknowledged = result.acknowledged;
      const exactOwnAck = own && acknowledged?.opId === own.opId && acknowledged.writerId === own.writerId
        && acknowledged.revision === own.revision && result.revision === own.revision;
      next = local ? { kind: result.confirmedVersion > 0 ? 'server' : 'local', message: exactOwnAck ? 'Ваши изменения сохранены на сервере.'
        : result.confirmedVersion > 0 ? 'Показана подтверждённая версия меню.' : 'Меню на устройстве; серверное подтверждение ещё не получено.' }
        : { kind: 'empty', message: 'На эту дату меню ещё не подтверждено.' };
      if (own && !exactOwnAck && result.revision === own.revision) next = { kind: 'local', message: 'Ожидаем подтверждение именно этой версии.' };
    }
    await repository.observe();
    if (!scope.isCurrent() || repoRef.current !== repository) return;
    if (!candidateRef.current && rosterRef.current) {
      const previous = draftsRef.current;
      const selections = restoredDaySelections(local, previous.date, rosterRef.current,
        selectionDraft.current ? previous.selections : undefined);
      if (JSON.stringify(previous.selections) !== JSON.stringify(selections) || previous.selectionDate !== previous.date) {
        const restored = { ...previous, selections, selectionDate: previous.date };
        draftsRef.current = restored; setDrafts(restored);
      }
    }
    setPublished(local); setDelivery(next);
  }, [currentUser.id, loginGuard, outbox, scope]);

  const loadDay = useCallback(async (session: FamilySession, targetFamily: CloudFamily, date: string) => {
    const repository = new FamilyMenuRepository(currentUser.id, { familyId: targetFamily.id, weekStart: date }, { outbox });
    repoRef.current = repository;
    setPublished(null); setDelivery({ kind: 'loading', message: 'Проверяем сохранённое меню…' });
    const before = await repository.observe();
    if (!session.isCurrentSession() || draftsRef.current.date !== date) return;
    await observeDelivery(repository);
    const data = await request(session, `/api/family/menu/state?familyId=${encodeURIComponent(targetFamily.id)}&week=${encodeURIComponent(date)}`);
    if (!isRecord(data) || !isFamilyMenuSnapshot(data.snapshot) || data.snapshot.familyId !== targetFamily.id || data.snapshot.weekStart !== date) {
      throw new Error('Не удалось проверить дату и версию меню.');
    }
    if (!session.isCurrentSession() || repoRef.current !== repository || draftsRef.current.date !== date) return;
    await repository.refresh(data.snapshot, session.guard, before);
    if (!session.isCurrentSession()) return;
    await observeDelivery(repository);
  }, [currentUser.id, observeDelivery, outbox, request]);

  const loadContext = useCallback(async (session: FamilySession) => {
    const raw = await request(session, '/api/family');
    if (!isRecord(raw) || raw.family !== null && (!isRecord(raw.family) || typeof raw.family.id !== 'string'
      || typeof raw.family.name !== 'string' || typeof raw.family.owner_user_id !== 'string')) throw new Error('Не удалось проверить семью.');
    if (!raw.family) {
      familyRef.current = null; setFamily(null); setRoster(null); setPublished(null); repoRef.current = null;
      setDelivery({ kind: 'empty', message: 'Создайте семью или присоединитесь по коду.' }); return;
    }
    const next = raw.family as CloudFamily;
    if (draftFamilyId.current && draftFamilyId.current !== next.id) {
      selectionDraft.current = false;
      const reset = { ...draftsRef.current, profile: null, profileOpen: false, profileDirty: false, selections: [], manualName: '', manualQuantity: '' };
      draftsRef.current = reset; setDrafts(reset);
      setCandidate(null); candidateRef.current = null;
    }
    draftFamilyId.current = next.id;
    familyRef.current = next; setFamily(next);
    const rosterData = await request(session, `/api/family/dining-profiles?familyId=${encodeURIComponent(next.id)}`);
    const nextRoster = checkedRoster(isRecord(rosterData) ? rosterData.roster : null, next.id);
    rosterRef.current = nextRoster; setRoster(nextRoster);
    if (draftsRef.current.profile?.id && !nextRoster.profiles.some(profile => profile.id === draftsRef.current.profile?.id && profile.active && profile.canEdit)) {
      const reset = { ...draftsRef.current, profile: null, profileOpen: false, profileDirty: false };
      draftsRef.current = reset; setDrafts(reset);
    }
    await loadDay(session, next, draftsRef.current.date);
  }, [loadDay, request]);

  const resumeContext = useRef<() => void>(() => {});
  resumeContext.current = () => { void run('Проверка семьи после возврата', loadContext); };

  useEffect(() => {
    scope.activate();
    let cancelled = false;
    const bootstrap = async () => {
      if (!loginGuard) { setDelivery({ kind: 'error', message: 'Семейные данные недоступны без подтверждения входа. Подключитесь к сети и проверьте сессию.' }); return; }
      if (!scope.isCurrent() || !await outbox.isReadSessionCurrent(loginGuard) || cancelled) {
        if (!cancelled) setDelivery({ kind: 'error', message: 'Не удалось подтвердить доступ к семейным данным. Проверьте вход; сохранённые данные не изменены.' });
        return;
      }
      try {
        const raw = sessionStorage.getItem(cacheKey);
        const envelope: unknown = raw ? JSON.parse(raw) : null;
        draftFamilyId.current = isRecord(envelope) && typeof envelope.familyId === 'string' ? envelope.familyId : null;
        const saved = readDraftCache(raw, emptyDrafts());
        const recovery = legacySelectionRecovery(envelope, saved);
        selectionDraft.current = saved.selectionDate === saved.date && isRecord(envelope) && envelope.selectionDraft === true;
        if (!scope.isCurrent() || cancelled) return;
        setSelectionRecovery(recovery);
        draftsRef.current = saved; setDrafts(saved);
      } catch { setDraftNotice('Черновики пока хранятся только в открытой вкладке.'); }
      if (!scope.isCurrent() || cancelled) return;
      setCacheReady(true); await run('Загрузка семьи', loadContext);
    };
    void bootstrap().catch(cause => { if (!cancelled && scope.isCurrent()) setError(errorText(cause)); });
    const hide = () => { scope.invalidate(); actionCounter.current += 1; busyRef.current = false; };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) {
        scope.activate(); setBusy(null);
        // A restored page can belong to a changed family or session. Re-read the
        // guarded context before treating its old menu as current shared data.
        resumeContext.current();
      }
    };
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => { cancelled = true; scope.invalidate(); actionCounter.current += 1; busyRef.current = false;
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); };
  }, [scope]);

  useEffect(() => {
    if (!cacheReady || !loginGuard) return;
    let cancelled = false;
    void outbox.isReadSessionCurrent(loginGuard).then(current => {
      if (!current || cancelled || !scope.isCurrent()) return;
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ version: 1, familyId: familyRef.current?.id ?? draftFamilyId.current, selectionDraft: selectionDraft.current, selectionRecovery, drafts })); setDraftNotice('Черновики сохранены в этой вкладке.'); }
      catch { setDraftNotice('Не удалось сохранить черновик на устройстве. Не закрывайте вкладку.'); }
    }).catch(() => { if (!cancelled && scope.isCurrent()) setDraftNotice('Не удалось проверить сохранение черновика. Не закрывайте вкладку.'); });
    return () => { cancelled = true; };
  }, [cacheKey, cacheReady, drafts, selectionRecovery, loginGuard, outbox, scope]);

  useEffect(() => {
    let running = false;
    const poll = async () => {
      if (running || !scope.isCurrent() || !repoRef.current) return;
      running = true;
      try { await observeDelivery(repoRef.current); }
      catch (cause) { if (scope.isCurrent()) setDelivery({ kind: 'error', message: errorText(cause) }); }
      finally { running = false; }
    };
    const interval = window.setInterval(() => void poll(), 2000);
    return () => window.clearInterval(interval);
  }, [observeDelivery, scope]);

  const owner = family?.owner_user_id === currentUser.id;
  const currentPlan = published && isFamilyPlanningMenu(published, drafts.date) ? published : null;
  const shownMenu = candidate?.menu ?? currentPlan;
  const staleRoster = !!currentPlan && !!roster && currentPlan.planningV1.rosterVersion !== roster.rosterVersion;
  const commitBlocked = !!busy || ['loading', 'local', 'sending', 'conflict', 'error'].includes(delivery.kind);

  const updateDrafts = useCallback((update: (previous: PlanningDrafts) => PlanningDrafts) => {
    if (!scope.isCurrent()) return;
    const next = update(draftsRef.current);
    if (next.profile !== draftsRef.current.profile && (!next.profile || !draftsRef.current.profile
      || next.profile.id !== draftsRef.current.profile.id)) profileIdentity.current += 1;
    if (next.profile !== draftsRef.current.profile || next.profileOpen !== draftsRef.current.profileOpen) profileEditorRevision.current += 1;
    if (next.date !== draftsRef.current.date || next.selections !== draftsRef.current.selections) inputRevision.current += 1;
    if (next.selections !== draftsRef.current.selections) selectionDraft.current = true;
    draftsRef.current = next; setDrafts(next);
  }, [scope]);
  const patchProfile = useCallback((patch: Partial<ProfileDraft>) => {
    setFieldErrors({}); setProfileNotice('');
    updateDrafts(previous => ({ ...previous, profileDirty: true, profile: previous.profile ? { ...previous.profile, ...patch,
      ...(patch.ageGroup === 'child' ? { goalContext: '' as const } : {}) } : null }));
  }, [updateDrafts]);

  const refresh = () => run('Обновление данных', loadContext);
  const create = () => run('Создание семьи', async session => {
    const name = draftsRef.current.familyName.trim();
    if (!name) throw new Error('Введите название семьи.');
    await createFamily(name, session); if (session.isCurrentSession()) await loadContext(session);
  });
  const join = () => run('Присоединение к семье', async session => {
    const code = draftsRef.current.joinCode.trim(); if (!code) throw new Error('Введите код приглашения.');
    await joinFamily(code, session); if (session.isCurrentSession()) await loadContext(session);
  });
  const invite = () => run('Создание приглашения', async session => {
    const target = familyRef.current; if (!target || target.owner_user_id !== currentUser.id) return;
    const code = await createFamilyInvite(target.id, session);
    if (session.isCurrentSession() && familyRef.current?.id === target.id) setInviteCode(code);
  });
  const editProfile = (id: string | null) => run('Открытие профиля', async session => {
    const target = familyRef.current, members = rosterRef.current; if (!target || !members) return;
    if (draftsRef.current.profile && draftsRef.current.profile.id === id && draftsRef.current.profileDirty) { updateDrafts(previous => ({ ...previous, profileOpen: true })); return; }
    if (id === null) {
      if (target.owner_user_id !== currentUser.id || members.profiles.filter(item => item.active).length >= members.limit) throw new Error(PUBLIC_ERRORS.FAMILY_LIMIT_REACHED);
      updateDrafts(previous => ({ ...previous, profile: profileDraft(null, members.rosterVersion), profileOpen: true, profileDirty: true }));
    } else {
      if (!members.profiles.find(item => item.id === id)?.canEdit) throw new Error('Этот профиль редактирует сам участник.');
      const editorRevision = profileEditorRevision.current;
      const editor = draftsRef.current.profile;
      const data = await request(session, `/api/family/dining-profile?familyId=${encodeURIComponent(target.id)}&profileId=${encodeURIComponent(id)}`);
      const profile = checkedProfile(isRecord(data) ? data.profile : null, target.id, id);
      if (!session.isCurrentSession() || !profileReadCanApply({ familyId: target.id, revision: editorRevision, editor },
        { familyId: familyRef.current?.id, revision: profileEditorRevision.current, editor: draftsRef.current.profile })) return;
      updateDrafts(previous => ({ ...previous, profile: profileDraft(profile, members.rosterVersion, id === currentUser.id ? currentUser : undefined), profileOpen: true, profileDirty: !profile.configuration }));
    }
    setFieldErrors({}); setProfileNotice('Это черновик. Уточните аллергии и сохраните профиль.');
  });
  const saveProfile = async () => {
    const draft = draftsRef.current.profile; if (!draft) return false;
    const errors = profileErrors(draft); setFieldErrors(errors);
    const input = profileInput(draft); if (Object.keys(errors).length || !input) return false;
    return run('Сохранение профиля', async session => {
      const target = familyRef.current; if (!target) return;
      const selectionRevision = inputRevision.current, selectedDate = draftsRef.current.date;
      const editorIdentity = profileIdentity.current;
      const data = await request(session, draft.id ? '/api/family/dining-profile' : '/api/family/dining-profiles', draft.id ? 'PATCH' : 'POST', {
        familyId: target.id, baseRosterVersion: draft.baseRosterVersion, profile: input,
        ...(draft.id ? { profileId: draft.id, baseVersion: draft.baseVersion } : {}) });
      if (!isRecord(data) || data.ok !== true || !Number.isSafeInteger(data.rosterVersion)) throw new Error('Сервер не подтвердил сохранение профиля.');
      const profile = checkedProfile(data.profile, target.id, draft.id ?? undefined);
      if (!profile.configuration) throw new Error('Профиль ещё не подтверждён.');
      if (!session.isCurrentSession() || familyRef.current?.id !== target.id) return;
      const nextDraft = profileDraft(profile, Number(data.rosterVersion));
      const editedDuringSave = draftsRef.current.profile !== draft;
      const sameEditor = profileIdentity.current === editorIdentity;
      if (sameEditor) updateDrafts(previous => profileAckDraft(previous, draft, nextDraft));
      const acknowledgedEditorIdentity = profileIdentity.current;
      setProfileNotice(editedDuringSave ? 'Предыдущая версия профиля сохранена на сервере. Новые изменения остаются в черновике.' : 'Профиль сохранён на сервере.'); setCandidate(null); candidateRef.current = null;
      const rosterData = data.roster ? { roster: data.roster }
        : await request(session, `/api/family/dining-profiles?familyId=${encodeURIComponent(target.id)}`);
      const nextRoster = checkedRoster(isRecord(rosterData) ? rosterData.roster : null, target.id);
      if (!session.isCurrentSession() || familyRef.current?.id !== target.id) return;
      rosterRef.current = nextRoster; setRoster(nextRoster);
      if (sameEditor && profileIdentity.current === acknowledgedEditorIdentity && (!draft.id || !publishedRef.current)
        && profileSelectionsCanApply(selectionRevision, inputRevision.current, selectedDate, draftsRef.current.date)) updateDrafts(previous => ({ ...previous, selections: previous.selections.map(selection => ({ ...selection,
        participantShares: { ...selection.participantShares, [profile.id]: profile.configuration!.portionShare } })) }));
    });
  };
  const changeDate = (date: string) => {
    if (!validDate(date) || busyRef.current) return;
    setCandidate(null); candidateRef.current = null;
    updateDrafts(previous => ({ ...previous, date, selectionDate: date, selections: [] }));
    selectionDraft.current = false;
    if (familyRef.current) void run('Загрузка дня', session => loadDay(session, familyRef.current!, date));
  };
  const changeSelections = (selections: FamilyMealSelection[]) => {
    setCandidate(null); candidateRef.current = null;
    updateDrafts(previous => ({ ...previous, selections, selectionDate: previous.date }));
  };
  const restoreSelectionRecovery = () => {
    if (!selectionRecovery || busyRef.current || !scope.isCurrent() || familyRef.current?.id !== selectionRecovery.familyId) return;
    if (draftsRef.current.date !== selectionRecovery.date) changeDate(selectionRecovery.date);
    changeSelections(structuredClone(selectionRecovery.selections));
    setSelectionRecovery(null);
  };

  const preview = (selections = draftsRef.current.selections) => run('Подготовка меню', async session => {
    const target = familyRef.current, members = rosterRef.current, repository = repoRef.current;
    if (!target || target.owner_user_id !== currentUser.id || !members || !repository) return;
    if (['loading', 'local', 'sending', 'conflict', 'error'].includes(deliveryRef.current.kind)) throw new Error('Сначала подтвердите отправку сохранённой версии. Черновик можно редактировать.');
    const date = draftsRef.current.date, observation = repository.capture(), revision = inputRevision.current;
    const inputKey = JSON.stringify({ date, selections, rosterVersion: members.rosterVersion });
    const data = await request(session, `/api/family/menu/generate?week=${encodeURIComponent(date)}`, 'POST', {
      preview: true, familyId: target.id, date, rosterVersion: members.rosterVersion, selections });
    if (!isRecord(data) || data.preview !== true || !isRecord(data.shared) || data.shared.familyId !== target.id
      || data.shared.weekStart !== date || !isFamilyPlanningMenu(data.shared.menu, date)
      || data.rosterVersion !== data.shared.menu.planningV1.rosterVersion || !isRecord(data.profileVersions)
      || Object.keys(data.profileVersions).length !== Object.keys(data.shared.menu.planningV1.profileVersions).length
      || Object.entries(data.shared.menu.planningV1.profileVersions).some(([id, version]) => data.profileVersions[id] !== version)) throw new Error('Не удалось проверить предпросмотр. Меню не изменено.');
    if (!session.isCurrentSession() || repoRef.current !== repository || draftsRef.current.date !== date
      || rosterRef.current?.rosterVersion !== members.rosterVersion) return;
    if (revision !== inputRevision.current) throw new Error('Вы изменили выбор во время подготовки. Ваш ввод сохранён; запросите предпросмотр ещё раз.');
    // Preserve purchases/manuals from the displayed local intent as well as server-side preview.
    const previous = publishedRef.current;
    const menu = previous && isFamilyPlanningMenu(previous, date)
      ? deriveLegacyFamilyMenu({ ...data.shared.menu.planningV1,
        purchasedQuantities: data.shared.menu.planningV1.purchasedQuantities.map(item => ({ ...item, quantity: previous.planningV1.purchasedQuantities
          .find(old => old.ingredientId === item.ingredientId && old.unit === item.unit)?.quantity ?? item.quantity })),
        manualItems: previous.planningV1.manualItems }) : data.shared.menu;
    const next = { menu, observation, inputKey, familyId: target.id };
    setCandidate(next); candidateRef.current = next;
    updateDrafts(current => ({ ...current, selections, selectionDate: date }));
  });

  const commit = async (session: FamilySession, menu: PlannedFamilyMenu, observation: FamilyMenuObservation,
    mutationKind: 'planning' | 'purchases') => {
    const repository = repoRef.current, target = familyRef.current, date = draftsRef.current.date;
    const revision = inputRevision.current;
    if (!repository || !target || menu.planningV1.date !== date) throw new Error('Дата меню изменилась. Повторите действие.');
    const operation = await repository.commit(menu, observation, { readGuard: session.guard,
      canCommit: () => session.isCurrentSession() && repoRef.current === repository && familyRef.current?.id === target.id
        && draftsRef.current.date === date }, mutationKind);
    if (!session.isCurrentSession()) return;
    ownReceipts.current.set(repository.key, operation);
    await observeDelivery(repository);
    if (operation.status !== 'pending') throw new Error('Ваш вариант сохранён как конфликт. Сравните его с серверной версией.');
    if (candidateRef.current?.menu === menu && inputRevision.current === revision) {
      selectionDraft.current = false;
      const saved = { ...draftsRef.current };
      draftsRef.current = saved; setDrafts(saved);
    }
    setCandidate(null); candidateRef.current = null;
    void stateSync.flushPending(currentUser.id).catch(() => { /* Durable operation remains visible; manual sync retries it. */ });
  };
  const confirm = () => run('Сохранение меню', async session => {
    const selected = candidateRef.current, members = rosterRef.current;
    if (!selected || familyRef.current?.owner_user_id !== currentUser.id || !members) return;
    if (['loading', 'local', 'sending', 'conflict', 'error'].includes(deliveryRef.current.kind)) throw new Error('Предыдущая версия ещё не подтверждена.');
    if (selected.familyId !== familyRef.current.id || selected.menu.planningV1.rosterVersion !== members.rosterVersion
      || selected.inputKey !== JSON.stringify({ date: draftsRef.current.date, selections: draftsRef.current.selections, rosterVersion: members.rosterVersion })) {
      throw new Error('Данные предпросмотра изменились. Создайте новый предпросмотр.');
    }
    await commit(session, selected.menu, selected.observation, 'planning');
  });
  const mutatePurchases = (change: (planning: FamilyPlanningV1) => FamilyPlanningV1, mutationKind: 'planning' | 'purchases' = 'purchases') =>
    run('Сохранение покупок', async session => {
      const menu = publishedRef.current, repository = repoRef.current;
      if (!menu || !repository || !isFamilyPlanningMenu(menu, draftsRef.current.date)) throw new Error('Сначала подтвердите меню.');
      if (candidateRef.current) throw new Error('Сначала подтвердите или закройте предпросмотр.');
      if (['loading', 'local', 'sending', 'conflict', 'error'].includes(deliveryRef.current.kind)) throw new Error('Предыдущая версия ещё не подтверждена.');
      if (mutationKind === 'planning' && familyRef.current?.owner_user_id !== currentUser.id) throw new Error('Состав покупок изменяет организатор.');
      const planning = change(structuredClone(menu.planningV1));
      await commit(session, deriveLegacyFamilyMenu(planning), repository.capture(), mutationKind);
    });
  const setPurchased = (id: string, unit: RawUnit, quantity: number) => mutatePurchases(planning => {
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Количество должно быть неотрицательным числом.');
    const row = planning.purchasedQuantities.find(item => item.ingredientId === id && item.unit === unit);
    if (!row) throw new Error('Этого продукта нет в подтверждённом списке.');
    row.quantity = quantity; return planning;
  });
  const setManualPurchased = (id: string, quantity: number) => mutatePurchases(planning => {
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Количество должно быть неотрицательным числом.');
    const row = planning.manualItems.find(item => item.id === id); if (!row) throw new Error('Позиция не найдена.');
    row.purchasedQuantity = quantity; return planning;
  });
  const addManual = async () => {
    const { manualName, manualQuantity, manualUnit } = draftsRef.current;
    const quantity = Number(manualQuantity.replace(',', '.'));
    if (!manualName.trim() || !Number.isFinite(quantity) || quantity <= 0) { setError('Укажите название и количество больше нуля.'); return false; }
    const success = await mutatePurchases(planning => ({ ...planning, manualItems: [...planning.manualItems,
      { id: `manual:${crypto.randomUUID()}`, name: manualName.trim(), unit: manualUnit, quantity, purchasedQuantity: 0 }] }), 'planning');
    if (success) updateDrafts(previous => ({ ...previous, manualName: '', manualQuantity: '' }));
    return success;
  };
  const removeManual = (id: string) => mutatePurchases(planning => ({ ...planning, manualItems: planning.manualItems.filter(item => item.id !== id) }), 'planning');
  const sync = () => run('Проверка синхронизации', async session => {
    if (latest.current.onSyncNow) await latest.current.onSyncNow(); else await stateSync.syncNow(currentUser.id);
    if (session.isCurrentSession() && repoRef.current) await observeDelivery(repoRef.current);
  });
  const acceptServer = () => {
    const displayed = deliveryRef.current;
    if (displayed.kind !== 'conflict' || !displayed.expectedOpIds?.length) return Promise.resolve(false);
    if (!window.confirm('Оставить серверное меню, отменив локальные изменения? При необходимости сначала сохраните копию своего варианта.')) return Promise.resolve(false);
    return run('Выбор серверной версии', async session => {
      const repository = repoRef.current;
      if (!repository || deliveryRef.current.kind !== 'conflict') return;
      if (!session.isCurrentSession() || repoRef.current !== repository) return;
      const resolved = await outbox.resolveConflictGroup({ accountId: currentUser.id, key: repository.key,
        expectedOpIds: displayed.expectedOpIds, choice: 'accept-server', readGuard: session.guard, nowMs: Date.now() });
      if (!resolved) throw new Error('Версии изменились или серверная копия недоступна. Локальный вариант сохранён.');
      if (!session.isCurrentSession()) return;
      ownReceipts.current.delete(repository.key); setCandidate(null); candidateRef.current = null;
      await loadContext(session);
    });
  };
  const exportLocal = () => {
    const menu = deliveryRef.current.operation?.type === 'put' ? snapshotMenu(deliveryRef.current.operation.value) : publishedRef.current;
    if (!menu || !scope.isCurrent()) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: 'family-menu-draft', date: draftsRef.current.date, menu }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `family-menu-draft-${draftsRef.current.date}.json`;
    anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openArchive = () => run('Загрузка архива', async session => {
    const target = familyRef.current; if (!target) return;
    const data = await request(session, `/api/family/menu/archive?familyId=${encodeURIComponent(target.id)}`);
    if (!isRecord(data) || !Array.isArray(data.items)) throw new Error('Не удалось проверить архив.');
    const checked = data.items.filter(item => isRecord(item) && item.familyId === target.id && item.kind === 'legacy-weekly'
      && typeof item.periodStart === 'string' && isRecord(item.menu) && Array.isArray(item.menu.days));
    setArchives(checked as unknown as Archive[]); setArchiveOpen(true);
  });

  return { family, roster, owner, published, currentPlan, shownMenu, candidate, delivery: previewDelivery(delivery, !!candidate), busy, error, fieldErrors,
    drafts, draftNotice, profileNotice, inviteCode, archives, archiveOpen, setArchiveOpen, staleRoster, commitBlocked,
    selectionRecovery: selectionRecovery?.familyId === family?.id ? selectionRecovery : null, restoreSelectionRecovery,
    refresh, create, join, invite, editProfile, saveProfile, patchProfile, updateDrafts, changeDate, changeSelections,
    preview, confirm, setPurchased, setManualPurchased, addManual, removeManual, sync, openArchive, acceptServer, exportLocal,
    closeProfile: () => updateDrafts(previous => ({ ...previous, profileOpen: false })),
    discardProfile: () => { updateDrafts(previous => ({ ...previous, profile: null, profileOpen: false, profileDirty: false })); setFieldErrors({}); setProfileNotice('Черновик отменён. Сохранённый профиль не изменён.'); },
    conflictLocal: delivery.operation?.type === 'put' ? snapshotMenu(delivery.operation.value) : null,
    discardPreview: () => { setCandidate(null); candidateRef.current = null; },
    projection: currentPlan ? projectFamilyDay(currentPlan.planningV1, FAMILY_INGREDIENTS) : null };
}

export type FamilyPlanningController = ReturnType<typeof useFamilyPlanning>;
