import React from 'react';
import { X } from 'lucide-react';
import { useModalDismissGestures } from './useModalDismissGestures';
import type { UserProfile } from './types';

type PlanIntroModalProps = {
  currentUser: UserProfile | null;
  planError: string | null;
  open: boolean;
  onClose: () => void;
  onOpenPlan: () => void;
  onOpenNutrition: () => void;
};

export default function PlanIntroModal({ currentUser, planError, open, onClose, onOpenPlan, onOpenNutrition }: PlanIntroModalProps) {
  const dismissGestures = useModalDismissGestures(onClose);
  if (!open || !currentUser?.aiPlan) return null;

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-xl grid place-items-center p-4">
      <div
        className="w-full max-w-2xl rounded-[2.5rem] border border-slate-800 bg-slate-950/90 shadow-2xl shadow-black/60 p-6 text-left touch-pan-y"
        {...dismissGestures}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Ваш AI‑план готов</p>
            <h3 className="mt-1 text-2xl font-black text-white">{currentUser.aiPlan.title}</h3>
            <p className="mt-2 text-sm text-slate-400 font-semibold">{currentUser.aiPlan.strategySummary}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-[1.2rem] border border-slate-800 bg-slate-950 hover:border-indigo-500/30 transition-all grid place-items-center text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">KPI на день</p>
            <p className="mt-1 text-xl font-black text-white tabular-nums">{currentUser.aiPlan.dailyKpi.calories} ккал</p>
            <p className="text-sm font-black text-slate-200 tabular-nums">{currentUser.aiPlan.dailyKpi.protein}Б · {currentUser.aiPlan.dailyKpi.fat}Ж · {currentUser.aiPlan.dailyKpi.carbs}У</p>
            <p className="mt-3 text-xs text-indigo-300 font-black uppercase tracking-widest">Фокус недели: {currentUser.aiPlan.weeklyFocus}</p>
          </div>
          <div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Первые шаги</p>
            <div className="mt-2 space-y-2">
              {currentUser.aiPlan.firstTasks.slice(0, 3).map((t: string, i: number) => (
                <div key={i} className="text-sm font-bold text-slate-200">• {t}</div>
              ))}
            </div>
          </div>
        </div>

        {planError && <p className="mt-4 text-xs text-amber-300 font-bold">{planError}</p>}

        <div className="mt-6 grid gap-2">
          <button
            onClick={() => {
              onClose();
              onOpenPlan();
            }}
            className="w-full py-4 rounded-[2rem] font-black text-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-900/40 hover:from-indigo-500 hover:to-violet-500 transition-all active:scale-[0.98]"
          >
            Открыть полный план
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenNutrition();
            }}
            className="w-full py-4 rounded-[2rem] font-black text-sm text-slate-200 border border-slate-800 bg-slate-950 hover:border-indigo-500/30 transition-all"
          >
            Начать дневник сегодня
          </button>
        </div>
      </div>
    </div>
  );
}
