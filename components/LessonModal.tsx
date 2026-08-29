import React from 'react';
import { Award, ChevronLeft } from 'lucide-react';
import { useModalDismissGestures } from '../useModalDismissGestures';
import type { CourseLesson, LessonQuizOption } from '../types';

type LessonModalProps = {
  lesson: CourseLesson | null;
  isQuizActive: boolean;
  selectedQuizOption: LessonQuizOption | null;
  onClose: () => void;
  onSelectOption: (opt: LessonQuizOption) => void;
  onQuizSubmit: () => void;
  onMarkRead: () => void;
};

export default function LessonModal({
  lesson,
  isQuizActive,
  selectedQuizOption,
  onClose,
  onSelectOption,
  onQuizSubmit,
  onMarkRead,
}: LessonModalProps) {
  const dismissGestures = useModalDismissGestures(onClose);
  if (!lesson) return null;

  return (
    <div className="fixed inset-0 bg-slate-950 z-[200] overflow-y-auto animate-in slide-in-from-right duration-500">
      <div className="max-w-3xl mx-auto px-6 py-12 pb-32 space-y-12 touch-pan-y" {...dismissGestures}>
        {!isQuizActive ? (
          <>
            <button
              onClick={onClose}
              className="flex items-center gap-3 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-indigo-400 transition-colors bg-slate-900 px-6 py-3 rounded-full border border-slate-800"
            >
              <ChevronLeft size={20} /> Назад
            </button>

            <header className="space-y-4 text-left">
              <div className="flex gap-2">
                {(lesson.tags || []).map((t) => (
                  <span
                    key={t}
                    className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-500/20"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <h1 className="text-5xl font-black text-slate-50 leading-tight">{lesson.title}</h1>
            </header>

            <div className="space-y-8 text-xl text-slate-400 leading-relaxed font-medium text-left">
              {(lesson.content || []).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <div className="bg-slate-900 p-10 rounded-[3rem] space-y-4 border border-slate-800 shadow-2xl text-left">
              <h3 className="text-2xl font-black text-slate-200">Главный вывод:</h3>
              <p className="text-xl font-bold text-indigo-400 italic">
                &quot;{lesson.takeaway}&quot;
              </p>
            </div>

            <button
              onClick={onMarkRead}
              className="w-full py-6 bg-slate-100 text-slate-950 rounded-[2.5rem] font-black text-lg shadow-2xl shadow-black/50 hover:bg-white transition-all"
            >
              Прочитано
            </button>
          </>
        ) : (
          <div className="py-20 text-center space-y-12 animate-in zoom-in">
            <div className="w-24 h-24 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center text-indigo-400 mx-auto shadow-inner border border-indigo-500/20">
              <Award size={48} />
            </div>

            <h2 className="text-4xl font-black text-slate-100">{lesson.quiz?.question}</h2>

            <div className="grid gap-4">
              {(lesson.quiz?.options || []).map((o) => (
                <button
                  key={o.id}
                  onClick={() => onSelectOption(o)}
                  className={`w-full p-6 rounded-[2rem] border-4 transition-all text-xl font-black ${
                    selectedQuizOption?.id === o.id
                      ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-500'
                  }`}
                >
                  {o.text}
                </button>
              ))}
            </div>

            <button
              onClick={onQuizSubmit}
              disabled={!selectedQuizOption}
              className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-lg disabled:opacity-20 transition-all shadow-xl shadow-indigo-900/40"
            >
              Завершить урок
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
