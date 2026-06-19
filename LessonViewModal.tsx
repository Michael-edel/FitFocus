import React from 'react';
import { Award, ChevronLeft } from 'lucide-react';
import { CourseLesson, LessonQuizOption } from './types';
import { useModalDismissGestures } from './useModalDismissGestures';

type LessonViewModalProps = {
  currentLesson: CourseLesson | null;
  isQuizActive: boolean;
  selectedQuizOption: LessonQuizOption | null;
  onClose: () => void;
  setSelectedQuizOption: React.Dispatch<React.SetStateAction<LessonQuizOption | null>>;
  handleMarkLessonRead: () => void;
  handleStartLessonQuiz: () => void;
  handleQuizSubmit: () => void;
};

export default function LessonViewModal({
  currentLesson,
  isQuizActive,
  selectedQuizOption,
  onClose,
  setSelectedQuizOption,
  handleMarkLessonRead,
  handleStartLessonQuiz,
  handleQuizSubmit,
}: LessonViewModalProps) {
  const dismissGestures = useModalDismissGestures(onClose);
  if (!currentLesson) return null;

  return (
    <div className="fixed inset-0 z-[2400] bg-slate-950/92 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-[3rem] border border-white/10 bg-slate-950 shadow-2xl shadow-black/70 flex flex-col touch-pan-y" {...dismissGestures}>
        <div className="px-5 md:px-8 py-4 border-b border-white/10 flex items-center justify-between gap-4 bg-slate-950/95">
          <button
            onClick={onClose}
            className="flex items-center gap-3 text-slate-300 font-black text-xs uppercase tracking-widest hover:text-indigo-300 transition-colors bg-slate-900 px-5 py-3 rounded-full border border-slate-800"
          >
            <ChevronLeft size={20} /> Назад
          </button>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Урок {currentLesson.id.replace(/^l/, '').split('_')[0]}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 md:px-10 py-8 md:py-10">
          {!isQuizActive ? (
            <div className="space-y-10">
              <header className="space-y-4 text-left">
                <div className="flex gap-2 flex-wrap">
                  {currentLesson.tags.map((t) => (
                    <span key={t} className="px-3 py-1 bg-indigo-500/10 text-indigo-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                      {t}
                    </span>
                  ))}
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-slate-50 leading-tight">{currentLesson.title}</h1>
              </header>

              <div className="space-y-8 text-lg md:text-xl text-slate-300 leading-relaxed font-medium text-left">
                {currentLesson.content.map((p, i) => <p key={i}>{p}</p>)}
              </div>

              <div className="bg-slate-900/95 p-8 md:p-10 rounded-[2.5rem] space-y-4 border border-slate-800 shadow-2xl text-left">
                <h3 className="text-2xl font-black text-slate-100">Главный вывод:</h3>
                <p className="text-xl font-bold text-indigo-300 italic">"{currentLesson.takeaway}"</p>
              </div>

              <button
                onClick={handleMarkLessonRead}
                className="w-full py-5 md:py-6 bg-slate-100 text-slate-950 rounded-[2.5rem] font-black text-lg shadow-2xl shadow-black/50 hover:bg-white transition-all"
              >
                Прочитано
              </button>
              {currentLesson.quiz ? (
                <button
                  onClick={handleStartLessonQuiz}
                  className="w-full py-5 md:py-6 bg-indigo-600/15 text-indigo-200 rounded-[2.5rem] font-black text-lg border border-indigo-500/20 hover:border-indigo-500/35 transition-all"
                >
                  Пройти тест
                </button>
              ) : null}
            </div>
          ) : (
            <div className="py-10 md:py-16 text-center space-y-10 md:space-y-12 animate-in zoom-in">
              <div className="w-24 h-24 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center text-indigo-300 mx-auto shadow-inner border border-indigo-500/20">
                <Award size={48} />
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-slate-100">{currentLesson.quiz?.question}</h2>
              <div className="grid gap-4">
                {currentLesson.quiz?.options.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setSelectedQuizOption(o)}
                    className={`w-full p-5 md:p-6 rounded-[2rem] border-4 transition-all text-lg md:text-xl font-black ${selectedQuizOption?.id === o.id ? 'bg-indigo-500/10 border-indigo-500 text-indigo-300' : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'}`}
                  >
                    {o.text}
                  </button>
                ))}
              </div>
              <button
                onClick={handleQuizSubmit}
                disabled={!selectedQuizOption}
                className="w-full py-5 md:py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-lg disabled:opacity-20 transition-all shadow-xl shadow-indigo-900/40"
              >
                Завершить урок
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
