import React from 'react';
import { Award, ChevronLeft } from 'lucide-react';
import { CourseLesson, LessonQuizOption } from './types';

type LessonViewModalProps = {
  currentLesson: CourseLesson | null;
  isQuizActive: boolean;
  selectedQuizOption: LessonQuizOption | null;
  setIsLessonViewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsQuizActive: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedQuizOption: React.Dispatch<React.SetStateAction<LessonQuizOption | null>>;
  handleMarkLessonRead: () => void;
  handleQuizSubmit: () => void;
};

export default function LessonViewModal({
  currentLesson,
  isQuizActive,
  selectedQuizOption,
  setIsLessonViewOpen,
  setSelectedQuizOption,
  handleMarkLessonRead,
  handleQuizSubmit,
}: LessonViewModalProps) {
  if (!currentLesson) return null;

  return (
    <div className="fixed inset-0 bg-slate-950 z-[200] overflow-y-auto animate-in slide-in-from-right duration-500">
      <div className="max-w-3xl mx-auto px-6 py-12 pb-32 space-y-12">
        {!isQuizActive ? (
          <>
            <button onClick={() => setIsLessonViewOpen(false)} className="flex items-center gap-3 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-indigo-400 transition-colors bg-slate-900 px-6 py-3 rounded-full border border-slate-800">
              <ChevronLeft size={20} /> Назад
            </button>
            <header className="space-y-4 text-left">
              <div className="flex gap-2">
                {currentLesson.tags.map((t) => (
                  <span key={t} className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                    {t}
                  </span>
                ))}
              </div>
              <h1 className="text-5xl font-black text-slate-50 leading-tight">{currentLesson.title}</h1>
            </header>
            <div className="space-y-8 text-xl text-slate-400 leading-relaxed font-medium text-left">
              {currentLesson.content.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="bg-slate-900 p-10 rounded-[3rem] space-y-4 border border-slate-800 shadow-2xl text-left">
              <h3 className="text-2xl font-black text-slate-200">Главный вывод:</h3>
              <p className="text-xl font-bold text-indigo-400 italic">"{currentLesson.takeaway}"</p>
            </div>
            <button onClick={handleMarkLessonRead} className="w-full py-6 bg-slate-100 text-slate-950 rounded-[2.5rem] font-black text-lg shadow-2xl shadow-black/50 hover:bg-white transition-all">
              Прочитано
            </button>
          </>
        ) : (
          <div className="py-20 text-center space-y-12 animate-in zoom-in">
            <div className="w-24 h-24 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center text-indigo-400 mx-auto shadow-inner border border-indigo-500/20">
              <Award size={48} />
            </div>
            <h2 className="text-4xl font-black text-slate-100">{currentLesson.quiz?.question}</h2>
            <div className="grid gap-4">
              {currentLesson.quiz?.options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedQuizOption(o)}
                  className={`w-full p-6 rounded-[2rem] border-4 transition-all text-xl font-black ${selectedQuizOption?.id === o.id ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-500'}`}
                >
                  {o.text}
                </button>
              ))}
            </div>
            <button onClick={handleQuizSubmit} disabled={!selectedQuizOption} className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-lg disabled:opacity-20 transition-all shadow-xl shadow-indigo-900/40">
              Завершить урок
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
