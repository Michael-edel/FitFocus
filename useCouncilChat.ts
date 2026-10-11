import { useCallback, useEffect, useRef, useState } from 'react';
import { callAiCouncil } from './geminiService';
import { FoodEntry, UserHabit, UserProfile } from './types';
import type { CouncilChatMsg } from './storage/stateTypes';
export type { CouncilChatMsg } from './storage/stateTypes';
import { useOwnedState } from './features/state/useOwnedState';
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

type UseCouncilChatArgs = {
  currentUser: UserProfile | null;
  foodDiary: FoodEntry[];
  habits: UserHabit[];
};

export function useCouncilChat({ currentUser, foodDiary, habits }: UseCouncilChatArgs) {
  const [councilInput, setCouncilInput] = useState('');
  const [councilLoading, setCouncilLoading] = useState(false);
  const [councilStage, setCouncilStage] = useState<'idle' | 'router' | 'experts' | 'review' | 'chairman'>('idle');
  const history = useOwnedState(currentUser?.id, 'council_history', [], councilCodec);
  const councilMessages = history.value;
  const setCouncilMessages = history.setValue;
  const requestGeneration = useRef(0);
  const [expandedCouncilThoughtIds, setExpandedCouncilThoughtIds] = useState<Record<string, boolean>>({});
  const councilScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    requestGeneration.current += 1;
    setCouncilInput(''); setCouncilLoading(false);
    setExpandedCouncilThoughtIds({}); setCouncilStage('idle');
    return () => { requestGeneration.current += 1; };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!councilScrollRef.current) return;
    councilScrollRef.current.scrollTop = councilScrollRef.current.scrollHeight;
  }, [councilMessages.length, councilLoading]);

  const clearCouncilHistory = useCallback(() => {
    const generation = ++requestGeneration.current;
    setCouncilLoading(false); setCouncilStage('idle');
    void history.remove().then((operation) => {
      if (generation === requestGeneration.current && (!operation || operation.status === 'pending')) setExpandedCouncilThoughtIds({});
    }).catch(() => {});
  }, [history.remove]);

  const handleCouncilSubmit = useCallback(async () => {
    if (!currentUser) return;
    const q = councilInput.trim();
    if (!q) return;
    const generation = ++requestGeneration.current;
    const isCurrent = () => generation === requestGeneration.current;

    const userMsg = {
      id: `u_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
      role: 'user' as const,
      text: q,
      createdAt: new Date().toISOString(),
    };
    setCouncilInput('');

    setCouncilMessages((prev) => [...prev, userMsg]);
    setCouncilLoading(true);
    setCouncilStage('router');

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => { if (isCurrent()) setCouncilStage((s) => (s === 'router' ? 'experts' : s)); }, 350));
    timers.push(setTimeout(() => { if (isCurrent()) setCouncilStage((s) => (s === 'experts' ? 'review' : s)); }, 900));
    timers.push(setTimeout(() => { if (isCurrent()) setCouncilStage((s) => (s === 'review' ? 'chairman' : s)); }, 1400));

    try {
      const r = await callAiCouncil(q, currentUser, foodDiary, habits);
      if (!isCurrent()) return;
      const assistantMsg: CouncilChatMsg = {
        id: `a_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
        role: 'assistant',
        text: r.finalAnswer,
        createdAt: new Date().toISOString(),
        response: r,
      };
      setCouncilMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Ошибка совета.');
      if (!isCurrent()) return;
      const assistantMsg: CouncilChatMsg = {
        id: `a_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
        role: 'assistant',
        text: `⚠️ ${msg}`,
        createdAt: new Date().toISOString(),
      };
      setCouncilMessages((prev) => [...prev, assistantMsg]);
    } finally {
      timers.forEach((t) => clearTimeout(t));
      if (isCurrent()) { setCouncilLoading(false); setCouncilStage('idle'); }
    }
  }, [councilInput, currentUser, foodDiary, habits, setCouncilMessages]);

  return {
    councilInput,
    setCouncilInput,
    councilLoading,
    councilStage,
    councilMessages,
    expandedCouncilThoughtIds,
    setExpandedCouncilThoughtIds,
    councilScrollRef,
    handleCouncilSubmit,
    clearCouncilHistory,
  };
}
