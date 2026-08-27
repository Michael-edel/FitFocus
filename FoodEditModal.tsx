import { X } from 'lucide-react';
import { MealType } from './types';
import type { FoodCorrectionDraft } from './foodCorrection';

type FoodEditModalProps = {
  draft: FoodCorrectionDraft;
  onChange: (next: FoodCorrectionDraft) => void;
  onClose: () => void;
  onSave: () => void;
};

const toLocalDateTimeInput = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromLocalDateTimeInput = (value: string) => new Date(value).toISOString();

export default function FoodEditModal({ draft, onChange, onClose, onSave }: FoodEditModalProps) {
  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-950/95 border border-slate-800 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-lg font-bold text-white">Корректировать блюдо</div>
            <div className="text-xs text-slate-500 font-bold mt-1">Исправьте распознавание, КБЖУ, состав и приём пищи.</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800/60">
            <X className="w-5 h-5 text-slate-200" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm text-slate-300 mb-1">Название</div>
            <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} className="w-full rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-violet-600/40" placeholder="Например: манты свинина/говядина с манго-чили соусом" />
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <input
              type="checkbox"
              checked={draft.nonFood}
              onChange={(event) => {
                const nonFood = event.target.checked;
                onChange({ ...draft, nonFood, ...(nonFood ? { calories: '0', protein: '0', fat: '0', carbs: '0', ingredientsText: '' } : {}) });
              }}
              className="mt-1 h-5 w-5 rounded-md accent-amber-400"
            />
            <span>
              <span className="block text-sm font-black text-amber-100">Это не еда</span>
              <span className="block text-xs font-medium text-amber-100/70 mt-1">Фото останется в дневнике как исправленная запись, но КБЖУ будут обнулены и не попадут в дневной итог. Если снимаете галочку, заполните КБЖУ или состав вручную.</span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm text-slate-300 mb-1">Приём пищи</div>
              <select value={draft.mealType} onChange={(event) => onChange({ ...draft, mealType: event.target.value as MealType })} className="w-full rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-violet-600/40">
                <option value="breakfast">Завтрак</option><option value="lunch">Обед</option><option value="dinner">Ужин</option><option value="snack">Перекус</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-300 mb-1">Дата и время</div>
              <input type="datetime-local" value={toLocalDateTimeInput(draft.timestamp)} onChange={(event) => onChange({ ...draft, timestamp: fromLocalDateTimeInput(event.target.value) })} className="w-full rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-violet-600/40" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['calories', 'Ккал'],
              ['protein', 'Белки, г'],
              ['fat', 'Жиры, г'],
              ['carbs', 'Углеводы, г'],
            ] as const).map(([field, label]) => (
              <div key={field}>
                <div className="text-sm text-slate-300 mb-1">{label}</div>
                <input inputMode="decimal" value={draft[field]} disabled={draft.nonFood} onChange={(event) => onChange({ ...draft, [field]: event.target.value })} className="w-full rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-violet-600/40 disabled:opacity-45" />
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-1"><div className="text-sm text-slate-300">Состав</div><div className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Название | % | примечание</div></div>
            <textarea value={draft.ingredientsText} disabled={draft.nonFood} onChange={(event) => onChange({ ...draft, ingredientsText: event.target.value })} className="w-full min-h-[128px] rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-violet-600/40 font-mono text-sm disabled:opacity-45" placeholder={'Тесто (мука пшеничная, вода, соль) | 40\nФарш свинина/говядина | 35 | смешанный фарш\nЛук репчатый | 15\nМанго-чили соус | 10 | соус с упаковки'} />
          </div>

          <div>
            <div className="text-sm text-slate-300 mb-1">Заметки</div>
            <textarea value={draft.notesText} onChange={(event) => onChange({ ...draft, notesText: event.target.value })} className="w-full min-h-[86px] rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-violet-600/40 text-sm" placeholder={'Фарш уточнён вручную: свинина + говядина.\nСоус уточнён по фото упаковки.'} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-2xl bg-slate-800/60 text-slate-100 border border-slate-700 hover:bg-slate-700/60">Отмена</button>
            <button onClick={onSave} className="px-4 py-2 rounded-2xl bg-violet-600 text-white hover:bg-violet-500">Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
}
