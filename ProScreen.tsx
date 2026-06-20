import React from 'react';
import { CheckCircle, Crown } from 'lucide-react';

type ProScreenProps = {
  openPaywall: () => void;
};

const FEATURES = [
  { title: 'Безлимитный AI Анализ', desc: 'Узнайте КБЖУ любого блюда за секунду по фото' },
  { title: 'Персональный Коучинг', desc: 'Ежедневные советы на основе ваших данных' },
  { title: 'Пошаговые рецепты', desc: 'AI составит рецепт любого блюда прямо по вашему фото' },
  { title: 'Экспорт отчетов', desc: 'PDF-выгрузка для врача или фитнес-тренера' },
];

export default function ProScreen({ openPaywall }: ProScreenProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-6 md:space-y-12 py-6 md:py-10 animate-in zoom-in duration-700">
      <div className="text-center space-y-4 md:space-y-6">
        <div className="w-20 h-20 md:w-28 md:h-28 bg-gradient-to-br from-amber-400 to-orange-600 rounded-[2.2rem] md:rounded-[3rem] flex items-center justify-center text-white mx-auto shadow-[0_20px_50px_rgba(245,158,11,0.2)]">
          <Crown size={40} className="md:hidden" />
          <Crown size={56} className="hidden md:block" />
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-slate-50">FitFocus Pro</h1>
        <p className="text-slate-400 text-base md:text-xl font-medium">Все, что нужно для быстрого и здорового результата</p>
      </div>

      <button
        onClick={openPaywall}
        className="w-full py-4 md:py-8 bg-indigo-600 text-white rounded-[2rem] md:rounded-[3rem] font-black text-lg md:text-2xl shadow-[0_20px_50px_rgba(79,70,229,0.3)] hover:bg-indigo-700 transition-all hover:-translate-y-1 active:scale-95"
      >
        Выбрать тарифный план
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {FEATURES.map((f, i) => (
          <div key={i} className="bg-slate-900 p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-800 flex items-center gap-4 md:gap-8 shadow-sm group hover:border-indigo-500/20 transition-all text-left">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner shrink-0">
              <CheckCircle size={24} className="md:hidden" />
              <CheckCircle size={32} className="hidden md:block" />
            </div>
            <div>
              <h4 className="text-lg md:text-xl font-black text-slate-100 mb-1">{f.title}</h4>
              <p className="text-slate-500 font-medium text-sm md:text-base">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
