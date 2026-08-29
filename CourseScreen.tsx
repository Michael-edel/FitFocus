import React from 'react';
import { CheckCircle } from 'lucide-react';
import type { CourseLesson, UserProfile } from './types';

type CourseScreenProps = {
  currentUser: UserProfile | null;
  courseLibrary: CourseLesson[] | null;
  lessons: CourseLesson[];
  setCurrentLesson: React.Dispatch<React.SetStateAction<CourseLesson | null>>;
  setIsLessonViewOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function CourseScreen({
  currentUser,
  courseLibrary,
  lessons,
  setCurrentLesson,
  setIsLessonViewOpen,
}: CourseScreenProps) {
  if (!courseLibrary) {
    return (
      <div className="space-y-10 animate-in fade-in duration-700">
        <div className="p-8 rounded-[2rem] bg-slate-900 border border-slate-800 text-slate-400 font-medium">Загружаю курс...</div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header className="flex items-center justify-between text-left">
        <div className="text-left">
          <h1 className="text-4xl font-black text-slate-100 mb-2">Обучение</h1>
          <p className="text-slate-400 font-medium">Ваш навигатор в мире нутрициологии</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Пройдено</p>
            <p className="text-2xl font-black text-slate-100 tabular-nums">
              {currentUser?.courseProgress?.completedLessonIds.length || 0} <span className="text-sm text-slate-600">/ {lessons.length}</span>
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-12">
        {[1, 2, 3, 4].map((weekNum) => (
          <div key={weekNum} className="space-y-6">
            <div className="flex items-center gap-6">
              <h2 className="text-2xl font-black text-slate-200">Неделя {weekNum}</h2>
              <div className="h-1 bg-slate-800 flex-1 rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                  style={{
                    width: `${(lessons.filter((l) => l.week === weekNum && currentUser?.courseProgress?.completedLessonIds.includes(l.id)).length / lessons.filter((l) => l.week === weekNum).length) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
              {lessons.filter((l) => l.week === weekNum).map((lesson) => {
                const done = currentUser?.courseProgress?.completedLessonIds.includes(lesson.id);
                return (
                  <button
                    key={lesson.id}
                    onClick={() => {
                      setCurrentLesson(lesson);
                      setIsLessonViewOpen(true);
                    }}
                    className={`p-8 rounded-[2.5rem] text-left border transition-all relative group ${done ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900 border-slate-800 shadow-xl hover:border-indigo-500/30'}`}
                  >
                    {done && <CheckCircle size={24} className="absolute top-8 right-8 text-emerald-500" />}
                    <span className={`text-[10px] font-black uppercase tracking-widest block mb-4 ${done ? 'text-emerald-500' : 'text-slate-600'}`}>
                      Урок {lesson.id.split('_')[0].replace('l', '')}
                    </span>
                    <h4 className={`text-xl font-black leading-tight mb-2 ${done ? 'text-emerald-100' : 'text-slate-100'}`}>{lesson.title}</h4>
                    <p className={`text-xs font-bold tabular-nums ${done ? 'text-emerald-500/60' : 'text-slate-500'}`}>{Math.ceil(lesson.readTimeSec / 60)} минут чтения</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
