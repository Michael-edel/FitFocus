import React from 'react';
import { X } from 'lucide-react';
import { FamilyMenuPrefs, UserProfile } from './types';

type FamilyMenuPrefsModalProps = {
  allUsers: UserProfile[];
  familyMenuPrefs: FamilyMenuPrefs;
  setFamilyMenuPrefs: React.Dispatch<React.SetStateAction<FamilyMenuPrefs>>;
  onClose: () => void;
  onGenerate: () => void;
};

export default function FamilyMenuPrefsModal({
  allUsers,
  familyMenuPrefs,
  setFamilyMenuPrefs,
  onClose,
  onGenerate,
}: FamilyMenuPrefsModalProps) {
  return (
    <div className="fixed inset-0 z-[2100] bg-slate-950/70 backdrop-blur-xl grid place-items-center p-4">
      <div className="w-full max-w-2xl rounded-[2.5rem] border border-slate-800 bg-slate-950/90 shadow-2xl shadow-black/60 p-6 text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Семейное меню</p>
            <h3 className="mt-1 text-2xl font-black text-white">Вопросы перед генерацией</h3>
            <p className="mt-2 text-sm text-slate-400 font-semibold">Данные о росте/весе/цели берём из профилей регистрации. Здесь — только параметры готовки.</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-[1.2rem] border border-slate-800 bg-slate-950 hover:border-indigo-500/30 transition-all grid place-items-center text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Сколько членов семьи учитывать?</p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {allUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-2 p-3 rounded-[1.4rem] bg-slate-950/40 border border-slate-800 text-slate-200 font-bold">
                  <input
                    type="checkbox"
                    checked={familyMenuPrefs.includeIds.includes(u.id)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFamilyMenuPrefs((prev) => {
                        const set = new Set(prev.includeIds);
                        if (checked) set.add(u.id);
                        else set.delete(u.id);
                        return { ...prev, includeIds: Array.from(set) };
                      });
                    }}
                  />
                  <span>
                    {u.name} <span className="text-slate-500 font-black">({u.age} лет)</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 font-semibold">
              Дети: {allUsers.filter((u) => familyMenuPrefs.includeIds.includes(u.id) && u.age < 18).map((u) => `${u.name} (${u.age})`).join(', ') || 'нет'}
            </p>
          </div>

          <div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Готовите 1 раз в день или каждый приём?</p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              <button
                onClick={() => setFamilyMenuPrefs((prev) => ({ ...prev, cookingMode: 'all_meals' }))}
                className={`p-3 rounded-[1.4rem] border font-black text-sm ${familyMenuPrefs.cookingMode === 'all_meals' ? 'border-indigo-500/40 bg-indigo-600/15 text-indigo-200' : 'border-slate-800 bg-slate-950/40 text-slate-200 hover:border-indigo-500/30'}`}
              >
                Каждый приём пищи
              </button>
              <button
                onClick={() => setFamilyMenuPrefs((prev) => ({ ...prev, cookingMode: 'once_per_day' }))}
                className={`p-3 rounded-[1.4rem] border font-black text-sm ${familyMenuPrefs.cookingMode === 'once_per_day' ? 'border-indigo-500/40 bg-indigo-600/15 text-indigo-200' : 'border-slate-800 bg-slate-950/40 text-slate-200 hover:border-indigo-500/30'}`}
              >
                1 раз в день (ужин + остатки)
              </button>
            </div>
          </div>

          <div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Нужно ли учитывать бюджет?</p>
            <div className="mt-3 flex flex-col md:flex-row gap-2">
              <input
                value={familyMenuPrefs.budgetPerWeek}
                onChange={(e) => setFamilyMenuPrefs((prev) => ({ ...prev, budgetPerWeek: e.target.value.replace(/[^0-9]/g, '') }))}
                placeholder="Напр. 40000"
                className="flex-1 px-4 py-3 rounded-[1.4rem] bg-slate-950 border border-slate-800 text-slate-100 font-bold outline-none focus:border-indigo-500/40"
              />
              <select
                value={familyMenuPrefs.currency}
                onChange={(e) => setFamilyMenuPrefs((prev) => ({ ...prev, currency: e.target.value }))}
                className="px-4 py-3 rounded-[1.4rem] bg-slate-950 border border-slate-800 text-slate-100 font-bold outline-none focus:border-indigo-500/40"
              >
                <option value="KZT">KZT</option>
                <option value="RUB">RUB</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <p className="mt-2 text-xs text-slate-500 font-semibold">Оставьте пустым, если бюджет не важен.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-2">
          <button
            onClick={() => {
              onClose();
              onGenerate();
            }}
            disabled={!familyMenuPrefs.includeIds.length}
            className="w-full py-4 rounded-[2rem] font-black text-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-900/40 hover:from-indigo-500 hover:to-violet-500 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            Сгенерировать меню
          </button>
          <button onClick={onClose} className="w-full py-4 rounded-[2rem] font-black text-sm text-slate-200 border border-slate-800 bg-slate-950 hover:border-indigo-500/30 transition-all">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
