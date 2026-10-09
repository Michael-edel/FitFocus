import { useEffect, useRef, useState } from 'react';
import { getLastAiAction, readAiStatus, type AiLastStatus } from '../../geminiService';

type AiLastAction = ReturnType<typeof getLastAiAction>;

type AiActivity = {
  aiStatus: AiLastStatus | null;
  lastAiAction: AiLastAction;
};

/** Reads the two independent AI status records without letting one damaged record hide the other. */
export function readAiActivity(
  readStatus: () => AiLastStatus | null = readAiStatus,
  readLastAction: () => AiLastAction = getLastAiAction,
): AiActivity {
  let aiStatus: AiLastStatus | null = null;
  let lastAiAction: AiLastAction = null;
  try { aiStatus = readStatus(); } catch {}
  try { lastAiAction = readLastAction(); } catch {}
  return { aiStatus, lastAiAction };
}

/** Keeps transient AI status and retry metadata current while the app is open. */
export function useAiActivityStatus(refreshMs = 2000): AiActivity {
  const initialActivityRef = useRef<AiActivity | null>(null);
  if (!initialActivityRef.current) initialActivityRef.current = readAiActivity();
  const [aiStatus, setAiStatus] = useState<AiLastStatus | null>(() => initialActivityRef.current!.aiStatus);
  const [lastAiAction, setLastAiAction] = useState<AiLastAction>(() => initialActivityRef.current!.lastAiAction);

  useEffect(() => {
    const timer = window.setInterval(() => {
      try { setAiStatus(readAiStatus()); } catch {}
      try { setLastAiAction(getLastAiAction()); } catch {}
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs]);

  return { aiStatus, lastAiAction };
}