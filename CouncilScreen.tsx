import React from 'react';
import clsx from 'clsx';
import {
  BrainCircuit,
  ChevronDown,
  History,
  Loader2,
  MessageCircle,
  Send,
  Trash2,
} from 'lucide-react';
import { CouncilResponse } from './types';

type CouncilChatMsg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  response?: CouncilResponse;
};

type CouncilScreenProps = {
  councilInput: string;
  setCouncilInput: React.Dispatch<React.SetStateAction<string>>;
  councilLoading: boolean;
  councilStage: 'idle' | 'router' | 'experts' | 'review' | 'chairman';
  councilMessages: CouncilChatMsg[];
  expandedCouncilThoughtIds: Record<string, boolean>;
  setExpandedCouncilThoughtIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  councilScrollRef: React.RefObject<HTMLDivElement | null>;
  handleCouncilSubmit: () => void | Promise<void>;
  onClearHistory: () => void;
};

export default function CouncilScreen({
  councilInput,
  setCouncilInput,
  councilLoading,
  councilStage,
  councilMessages,
  expandedCouncilThoughtIds,
  setExpandedCouncilThoughtIds,
  councilScrollRef,
  handleCouncilSubmit,
  onClearHistory,
}: CouncilScreenProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-10 duration-700">
      <header className="text-left">
        <div className="flex items-center gap-3 text-indigo-400 mb-2">
          <BrainCircuit size={28} />
          <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
            Multi-Agent v2
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black">AI Совет Экспертов</h1>
        <p className="text-slate-400">Параллельный анализ от 4 экспертов + независимая проверка + синтез.</p>
      </header>

      <div className="bg-slate-900 rounded-[3rem] border border-slate-800 h-[640px] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 md:px-10 py-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <History size={14} /> История совета
          </div>
          <button
            type="button"
            onClick={onClearHistory}
            className="flex items-center gap-2 text-slate-500 hover:text-rose-300 font-black text-[10px] uppercase tracking-widest transition-all"
          >
            <Trash2 size={14} /> Очистить
          </button>
        </div>

        <div ref={councilScrollRef} className="flex-1 p-6 md:p-10 overflow-y-auto space-y-8 scrollbar-hide">
          <div className="space-y-6">
            {councilMessages.length === 0 && !councilLoading && (
              <div className="h-full flex flex-col items-center justify-center opacity-50 py-24">
                <MessageCircle size={72} className="mb-6 text-slate-800" />
                <p className="text-center font-bold text-slate-500 text-lg">
                  Задайте вопрос о прогрессе,
                  <br />
                  метаболизме, рационе или привычках.
                </p>
              </div>
            )}

            {councilMessages.map((m) => {
              const isUser = m.role === 'user';
              const resp = m.response;
              const score = resp?.agreementScore ?? null;
              const expanded = !!expandedCouncilThoughtIds[m.id];
              return (
                <div key={m.id} className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
                  <div
                    className={clsx(
                      'max-w-[85%] p-5 md:p-6 rounded-[2.5rem] border shadow-xl',
                      isUser
                        ? 'bg-indigo-600/10 border-indigo-500/20 text-slate-100'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    )}
                  >
                    {!isUser && score !== null && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Синтез (итог)</div>
                          <div
                            className={clsx(
                              'text-[10px] px-3 py-1 rounded-full border font-black uppercase tracking-widest tabular-nums',
                              score >= 80
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : score >= 55
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                            )}
                          >
                            Agreement {score}%
                          </div>
                        </div>
                        <div className="mt-3 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={clsx(
                              'h-full rounded-full transition-all',
                              score >= 80 ? 'bg-emerald-500' : score >= 55 ? 'bg-amber-500' : 'bg-rose-500'
                            )}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{m.text}</div>

                    {!isUser && resp?.thoughts?.length ? (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setExpandedCouncilThoughtIds((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                          className="flex items-center gap-2 text-slate-500 hover:text-indigo-400 font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                          {expanded ? 'Скрыть ход мыслей' : 'Показать ход мыслей совета'}
                          <ChevronDown className={clsx('transition-transform', expanded && 'rotate-180')} size={14} />
                        </button>

                        {expanded && (
                          <div className="mt-4 space-y-4 animate-in zoom-in-95">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {resp.thoughts.map((t, i) => (
                                <div
                                  key={i}
                                  className={clsx(
                                    'p-5 rounded-3xl border',
                                    t.isReview ? 'bg-slate-900/50 border-slate-800 italic' : 'bg-indigo-500/5 border-indigo-500/20'
                                  )}
                                >
                                  <p className="text-[10px] font-black uppercase text-slate-500 mb-2">{t.agentName}</p>
                                  <p className="text-sm text-slate-300">"{t.text}"</p>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setExpandedCouncilThoughtIds((prev) => ({ ...prev, [m.id]: false }))}
                                className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                              >
                                Свернуть
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {councilLoading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] p-5 md:p-6 rounded-[2.5rem] bg-slate-900 border border-slate-800 shadow-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-300">
                      <BrainCircuit size={14} /> Совет обсуждает…
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      {councilStage === 'router'
                        ? 'Маршрутизация'
                        : councilStage === 'experts'
                          ? 'Эксперты'
                          : councilStage === 'review'
                            ? 'Проверка'
                            : councilStage === 'chairman'
                              ? 'Синтез'
                              : '…'}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    {[
                      { id: 'router', label: 'Маршрут' },
                      { id: 'experts', label: 'Эксперты' },
                      { id: 'review', label: 'Проверка' },
                      { id: 'chairman', label: 'Синтез' },
                    ].map((s) => {
                      const order = ['router', 'experts', 'review', 'chairman'] as const;
                      const curIdx = order.indexOf(councilStage === 'idle' ? 'router' : councilStage as any);
                      const myIdx = order.indexOf(s.id as any);
                      const done = myIdx < curIdx;
                      const active = myIdx === curIdx;
                      return (
                        <div
                          key={s.id}
                          className={clsx(
                            'py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest',
                            done
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                              : active
                                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300 animate-pulse'
                                : 'bg-slate-950 border-slate-800 text-slate-600'
                          )}
                        >
                          {s.label}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-slate-500 text-xs font-bold">
                    <span className="ff-ai-dot" />
                    <span className="ff-ai-dot ff-ai-dot--2" />
                    <span className="ff-ai-dot ff-ai-dot--3" />
                    <span className="ml-2">идёт обсуждение…</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCouncilSubmit();
          }}
          className="p-5 md:p-8 bg-slate-950 border-t border-slate-800 flex gap-4"
        >
          <textarea
            rows={1}
            className="flex-1 bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-3xl outline-none text-white focus:border-indigo-500 transition-all resize-none"
            value={councilInput}
            onChange={(e) => setCouncilInput(e.target.value)}
            placeholder="Ваш вопрос экспертам..."
          />
          <button
            disabled={councilLoading || !councilInput.trim()}
            className="bg-indigo-600 p-4 md:p-6 rounded-3xl text-white hover:bg-indigo-700 transition-all shadow-lg active:scale-95 flex items-center justify-center min-w-[64px]"
          >
            {councilLoading ? <Loader2 className="animate-spin" /> : <Send size={26} />}
          </button>
        </form>
      </div>
    </div>
  );
}
