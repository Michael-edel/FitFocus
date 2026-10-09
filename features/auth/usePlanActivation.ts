import { useCallback, useEffect, useRef, useState } from 'react';

/** Drives registration activation progress and always clears browser timers on completion or unmount. */
export function usePlanActivation(input: { totalMs: number; stepCount: number; onComplete: () => Promise<void> }) {
  const [isActivatingPlan, setIsActivatingPlan] = useState(false);
  const [activationStep, setActivationStep] = useState(0);
  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const completeRef = useRef(input.onComplete);
  completeRef.current = input.onComplete;

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    intervalRef.current = null;
    timerRef.current = null;
  }, []);

  const startPlanActivation = useCallback(() => {
    if (isActivatingPlan) return;
    const stepMs = Math.round(input.totalMs / input.stepCount);
    setActivationStep(0);
    setIsActivatingPlan(true);
    clearTimers();
    intervalRef.current = window.setInterval(() => {
      setActivationStep((step) => Math.min(step + 1, input.stepCount - 1));
    }, stepMs);
    timerRef.current = window.setTimeout(async () => {
      clearTimers();
      try {
        await completeRef.current();
      } finally {
        setIsActivatingPlan(false);
      }
    }, input.totalMs);
  }, [clearTimers, input.stepCount, input.totalMs, isActivatingPlan]);

  useEffect(() => clearTimers, [clearTimers]);
  return { isActivatingPlan, activationStep, startPlanActivation };
}