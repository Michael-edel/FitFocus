import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { callAiCouncil } from './geminiService';
import { FoodEntry, UserHabit, UserProfile } from './types';
import type { CouncilChatMsg } from './storage/stateTypes';
export type { CouncilChatMsg } from './storage/stateTypes';
import { useOwnedState } from './features/state/useOwnedState';
import { AiActionScope } from './features/ai/actionScope';
import { accountSessionRenderKey, useAccountScopedUiState } from './features/state/accountScopedUi';
import { assertAiSession, prepareAiSession, type AiSession } from './services/aiSession';
import type { OutboxLocalCommitGuard, OutboxReadGuard } from './storage/durableOutbox';
import { assertReadSession } from './storage/sessionRead';
import type { StateCodec } from './storage/stateEditor';
import { errorMessage, isRecord, parseJson } from './safeJson';

function isCouncilChatMessage(value: unknown): value is CouncilChatMsg {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    (value.role === 'user' || value.role === 'assistant') &&
    typeof value.text === 'string' &&
    typeof value.createdAt === 'string'
  );
}

const councilCodec: StateCodec<CouncilChatMsg[]> = {
  decode: (raw) => { const parsed = raw ? parseJson(raw) : []; return Array.isArray(parsed) ? parsed.filter(isCouncilChatMessage) : []; },
  encode: (value) => JSON.stringify(value.slice(-50)),
};

const EMPTY_EXPANDED_THOUGHTS: Record<string, boolean> = {};

function localCommitGuard(readGuard: OutboxReadGuard, canCommit: () => boolean): OutboxLocalCommitGuard {
  return {
    localCommitGuard: {
      accountId: readGuard.accountId,
      serverSessionId: readGuard.serverSessionId,
      sessionEpoch: readGuard.sessionEpoch,
    },
    canCommit,
  };
}

type UseCouncilChatArgs = {
  currentUser: UserProfile | null;
  foodDiary: FoodEntry[];
  habits: UserHabit[];
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  allowCachedUiStateRestore: boolean;
};

export function useCouncilChat({ currentUser, foodDiary, habits, loginGuard, isCurrentSession, allowCachedUiStateRestore }: UseCouncilChatArgs) {
  const accountId = currentUser?.id;
  const sessionScopeKey = allowCachedUiStateRestore && !!accountId
    && loginGuard?.accountId === accountId
    ? accountSessionRenderKey(loginGuard, accountId)
    : null;
  const { value: councilInput, setValue: setCouncilInput } = useAccountScopedUiState(sessionScopeKey, '');
  const { value: councilLoading, setValue: setCouncilLoading } = useAccountScopedUiState(sessionScopeKey, false);
  const { value: councilStage, setValue: setCouncilStage } = useAccountScopedUiState<'idle' | 'router' | 'experts' | 'review' | 'chairman'>(sessionScopeKey, 'idle');
  const { value: councilError, setValue: setCouncilError } = useAccountScopedUiState<string | null>(sessionScopeKey, null);
  const history = useOwnedState(currentUser?.id, 'council_history', [], councilCodec);
  const councilMessages = history.value;
  const requestGeneration = useRef(0);
  const scope = useMemo(() => new AiActionScope(() => Boolean(sessionScopeKey && loginGuard
    && loginGuard.accountId === currentUser?.id && isCurrentSession())),
  [currentUser?.id, isCurrentSession, loginGuard, sessionScopeKey]);
  const { value: expandedCouncilThoughtIds, setValue: setExpandedCouncilThoughtIds } = useAccountScopedUiState<Record<string, boolean>>(sessionScopeKey, EMPTY_EXPANDED_THOUGHTS);
  const councilScrollRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    scope.activate();
    const hide = () => {
      scope.invalidate(); requestGeneration.current += 1;
      setCouncilLoading(false); setCouncilStage('idle');
    };
    const show = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      scope.activate(); setCouncilLoading(false); setCouncilStage('idle');
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      scope.invalidate();
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [scope]);

  useEffect(() => {
    requestGeneration.current += 1;
    setCouncilLoading(false);
    setCouncilError(null);
    setExpandedCouncilThoughtIds({});
    setCouncilStage('idle');
    return () => { requestGeneration.current += 1; };
  }, [sessionScopeKey, setCouncilError, setCouncilLoading, setCouncilStage, setExpandedCouncilThoughtIds]);

  useEffect(() => {
    if (!councilScrollRef.current) return;
    councilScrollRef.current.scrollTop = councilScrollRef.current.scrollHeight;
  }, [councilMessages.length, councilLoading]);

  const clearCouncilHistory = useCallback(() => {
    if (!sessionScopeKey || !currentUser || !loginGuard || loginGuard.accountId !== currentUser.id) return;
    const attempt = scope.begin();
    if (!attempt) return;
    const generation = ++requestGeneration.current;
    const isCurrent = () => generation === requestGeneration.current && attempt.isCurrent();
    const showErrorIfActionCurrent = (message: string) => {
      if (isCurrent()) setCouncilError(message);
    };
    setCouncilLoading(false); setCouncilStage('idle'); setCouncilError(null);
    void history.remove(localCommitGuard(loginGuard, isCurrent)).then((operation) => {
      if (!isCurrent()) return;
      if (operation?.status === 'pending') setExpandedCouncilThoughtIds({});
      else showErrorIfActionCurrent('Не удалось очистить историю совета. Проверьте состояние хранилища.');
    }).catch((error: unknown) => {
      showErrorIfActionCurrent(errorMessage(error, 'Не удалось очистить историю совета.'));
    }).finally(() => attempt.finish());
  }, [currentUser, history.remove, loginGuard, scope, sessionScopeKey]);

  const handleCouncilSubmit = useCallback(async () => {
    if (!sessionScopeKey || !currentUser || !loginGuard || loginGuard.accountId !== currentUser.id) return;
    const q = councilInput.trim();
    if (!q) return;
    if (!history.ready) {
      setCouncilError('История ещё загружается. Повторите отправку вопроса.');
      return;
    }
    const attempt = scope.begin();
    if (!attempt) return;
    const generation = ++requestGeneration.current;
    const isCurrent = () => generation === requestGeneration.current && attempt.isCurrent();
    const originalGuard = Object.freeze({ ...loginGuard });
    let session: AiSession | null = null;

    const userMsg = {
      id: `u_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
      role: 'user' as const,
      text: q,
      createdAt: new Date().toISOString(),
    };
    setCouncilError(null);
    setCouncilLoading(true);
    setCouncilStage('router');

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => { if (isCurrent()) setCouncilStage((s) => (s === 'router' ? 'experts' : s)); }, 350));
    timers.push(setTimeout(() => { if (isCurrent()) setCouncilStage((s) => (s === 'experts' ? 'review' : s)); }, 900));
    timers.push(setTimeout(() => { if (isCurrent()) setCouncilStage((s) => (s === 'review' ? 'chairman' : s)); }, 1400));

    let userMessageSaved = false;
    try {
      const userOperation = await history.persistGenerated(previous => [...previous, userMsg], localCommitGuard(originalGuard, isCurrent));
      if (!isCurrent()) return;
      if (!userOperation || userOperation.status !== 'pending') throw new Error('Не удалось сохранить вопрос совета. Проверьте состояние хранилища.');
      userMessageSaved = true;
      setCouncilInput('');

      session = await prepareAiSession(currentUser.id, attempt.controller, isCurrent, { previous: originalGuard });
      if (!isCurrent()) return;
      const r = await callAiCouncil(q, currentUser, foodDiary, habits, session);
      if (!isCurrent()) return;
      await assertAiSession(session);
      if (!isCurrent()) return;
      const assistantMsg: CouncilChatMsg = {
        id: `a_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
        role: 'assistant',
        text: r.finalAnswer,
        createdAt: new Date().toISOString(),
        response: r,
      };
      const operation = await history.persistGenerated(previous => [...previous, assistantMsg], {
        readGuard: { ...session.guard }, canCommit: isCurrent,
      });
      if (!isCurrent()) return;
      if (!operation || operation.status !== 'pending') throw new Error('Ответ совета не сохранён. Проверьте конфликт или ошибку хранилища.');
    } catch (err: unknown) {
      if (!isCurrent()) return;
      const readGuard = session?.guard ?? originalGuard;
      try {
        if (session) await assertAiSession(session);
        else await assertReadSession(originalGuard, { signal: attempt.controller.signal, isCurrentSession: isCurrent });
        if (!isCurrent()) return;
      } catch {
        if (isCurrent()) {
          setCouncilLoading(false);
          setCouncilStage('idle');
          setCouncilError(userMessageSaved
            ? 'Вопрос сохранён на устройстве, но отправка ожидает повторной проверки сессии.'
            : 'Не удалось проверить сессию. Повторите попытку.');
        }
        attempt.controller.abort();
        return;
      }
      const msg = errorMessage(err, 'Ошибка совета.');
      const assistantMsg: CouncilChatMsg = {
        id: `a_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
        role: 'assistant', text: `⚠️ ${msg}`, createdAt: new Date().toISOString(),
      };
      try {
        const operation = await history.persistGenerated(previous => [...previous, assistantMsg], {
          readGuard: { ...readGuard }, canCommit: isCurrent,
        });
        if (isCurrent() && (!operation || operation.status !== 'pending')) setCouncilError(msg);
      } catch {
        if (!isCurrent()) return;
        try {
          if (session) await assertAiSession(session);
          else await assertReadSession(originalGuard, { signal: attempt.controller.signal, isCurrentSession: isCurrent });
          if (isCurrent()) setCouncilError(msg);
        } catch { return; }
      }
    } finally {
      timers.forEach((t) => clearTimeout(t));
      attempt.finish();
      if (isCurrent()) { setCouncilLoading(false); setCouncilStage('idle'); }
    }
  }, [councilInput, currentUser, foodDiary, habits, history, isCurrentSession, loginGuard, scope, sessionScopeKey]);

  return {
    councilInput,
    setCouncilInput,
    councilLoading,
    councilStage,
    councilError,
    councilMessages,
    expandedCouncilThoughtIds,
    setExpandedCouncilThoughtIds,
    councilScrollRef,
    handleCouncilSubmit,
    clearCouncilHistory,
  };
}
