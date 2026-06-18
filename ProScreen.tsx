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
    <div className="max-w-4xl mx-auto space-y-12 py-10 animate-in zoom-in duration-700">
      <div className="text-center space-y-6">
        <div className="w-28 h-28 bg-gradient-to-br from-amber-400 to-orange-600 rounded-[3rem] flex items-center justify-center text-white mx-auto shadow-[0_20px_50px_rgba(245,158,11,0.2)]">
          <Crown size={56} />
        </div>
        <h1 className="text-5xl font-black text-slate-50">FitFocus Pro</h1>
        <p className="text-slate-400 text-xl font-medium">Все, что нужно для быстрого и здорового результата</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {FEATURES.map((f, i) => (
          <div key={i} className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 flex items-center gap-8 shadow-sm group hover:border-indigo-500/20 transition-all text-left">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner shrink-0">
              <CheckCircle size={32} />
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-100 mb-1">{f.title}</h4>
              <p className="text-slate-500 font-medium">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={openPaywall}
        className="w-full py-8 bg-indigo-600 text-white rounded-[3rem] font-black text-2xl shadow-[0_20px_50px_rgba(79,70,229,0.3)] hover:bg-indigo-700 transition-all hover:-translate-y-1 active:scale-95"
      >
        Выбрать тарифный план
      </button>
    </div>
  );
}
