import React from 'react';
import { Dumbbell } from 'lucide-react';

export default function WorkoutsScreen() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="text-3xl font-black text-slate-100 mb-2 text-left">Тренировки</div>
      <div className="text-slate-400 mb-8 text-left">Раздел будет добавлен позже. Здесь появятся планы тренировок и журнал активности.</div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-10 text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-200 flex items-center justify-center mb-4">
          <Dumbbell className="w-8 h-8" />
        </div>
        <div className="text-slate-100 font-black text-xl">Скоро</div>
        <div className="text-slate-400 mt-2">Мы добавим умные планы и подбор упражнений под вашу цель.</div>
      </div>
    </div>
  );
}