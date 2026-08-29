import { useCallback, useEffect, useRef, useState } from 'react';
import { callAiCouncil } from './geminiService';
import { FoodEntry, UserHabit, UserProfile, CouncilResponse } from './types';
import { safeRemoveItem, safeSetItem } from './storage/hybrid';
import { errorMessage, isRecord, parseJson } from './safeJson';

export type CouncilChatMsg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  response?: CouncilResponse;
};

function isCouncilChatMessage(value: unknown): value is CouncilChatMsg {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    (value.role === 'user' || value.role === 'assistant') &&
    typeof value.text === 'string' &&
    typeof value.createdAt === 'string'
  );
}

type UseCouncilChatArgs = {
  currentUser: UserProfile | null;
  foodDiary: FoodEntry[];
  habits: UserHabit[];
};

export function useCouncilChat({ currentUser, foodDiary, habits }: UseCouncilChatArgs) {
  const [councilInput, setCouncilInput] = useState('');
  const [councilLoading, setCouncilLoading] = useState(false);
  const [councilStage, setCouncilStage] = useState<'idle' | 'router' | 'experts' | 'review' | 'chairman'>('idle');
  const [councilMessages, setCouncilMessages] = useState<CouncilChatMsg[]>([]);
  const [expandedCouncilThoughtIds, setExpandedCouncilThoughtIds] = useState<Record<string, boolean>>({});
  const councilScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!currentUser?.id) {
      setCouncilMessages([]);
      setExpandedCouncilThoughtIds({});
      setCouncilStage('idle');
      return;
    }

    const key = `fitfocus_data_${currentUser.id}_council_history`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = parseJson(raw);
        setCouncilMessages(Array.isArray(parsed) ? parsed.filter(isCouncilChatMessage) : []);
      } else {
        setCouncilMessages([]);
      }
    } catch {
      setCouncilMessages([]);
    }

    setExpandedCouncilThoughtIds({});
    setCouncilStage('idle');
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || councilMessages.length === 0) return;
    const key = `fitfocus_data_${currentUser.id}_council_history`;
    try {
      safeSetItem(key, JSON.stringify(councilMessages.slice(-50)));
    } catch {}
  }, [currentUser?.id, councilMessages]);

  useEffect(() => {
    if (!councilScrollRef.current) return;
    councilScrollRef.current.scrollTop = councilScrollRef.current.scrollHeight;
  }, [councilMessages.length, councilLoading]);

  const clearCouncilHistory = useCallback(() => {
    if (!currentUser?.id) return;
    const key = `fitfocus_data_${currentUser.id}_council_history`;
    safeRemoveItem(key);
    setCouncilMessages([]);
    setExpandedCouncilThoughtIds({});
    setCouncilStage('idle');
    setCouncilLoading(false);
  }, [currentUser?.id]);

  const handleCouncilSubmit = useCallback(async () => {
    if (!currentUser) return;
    const q = councilInput.trim();
    if (!q) return;

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
    timers.push(setTimeout(() => setCouncilStage((s) => (s === 'router' ? 'experts' : s)), 350));
    timers.push(setTimeout(() => setCouncilStage((s) => (s === 'experts' ? 'review' : s)), 900));
    timers.push(setTimeout(() => setCouncilStage((s) => (s === 'review' ? 'chairman' : s)), 1400));

    try {
      const r = await callAiCouncil(q, currentUser, foodDiary, habits);
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
      const assistantMsg: CouncilChatMsg = {
        id: `a_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
        role: 'assistant',
        text: `⚠️ ${msg}`,
        createdAt: new Date().toISOString(),
      };
      setCouncilMessages((prev) => [...prev, assistantMsg]);
    } finally {
      timers.forEach((t) => clearTimeout(t));
      setCouncilLoading(false);
      setCouncilStage('idle');
    }
  }, [councilInput, currentUser, foodDiary, habits]);

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
