import { ChevronDown, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { MealType } from './types';
import type { FoodCorrectionDraft } from './foodCorrection';

type FoodEditModalProps = {
  draft: FoodCorrectionDraft;
  onChange: (next: FoodCorrectionDraft) => void;
  onClose: () => void;
  onSave: () => Promise<boolean>;
  mode?: 'manual' | 'photo' | 'edit';
  photo?: string;
};

const inputClass = 'w-full min-w-0 min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-base text-slate-100 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:opacity-50';
const labelClass = 'block space-y-1 text-sm text-slate-300';
const invalidNumber = (raw: string) => {
  const value = raw.trim().replace(',', '.');
  return value !== '' && (!/^\d+(\.\d+)?$/.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 10)));
};

const toLocalDateTimeInput = (iso: string) => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromLocalDateTimeInput = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
};

export default function FoodEditModal({ draft, onChange, onClose, onSave, mode = 'edit', photo }: FoodEditModalProps) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const caloriesRef = useRef<HTMLInputElement | null>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const title = mode === 'photo' ? 'Подтвердите запись по фото' : mode === 'manual' ? 'Добавить блюдо вручную' : 'Корректировать блюдо';
  const saveLabel = mode === 'photo' ? 'Подтвердить и записать' : mode === 'manual' ? 'Добавить в дневник' : 'Сохранить';
  const update = (key: keyof FoodCorrectionDraft, value: string) => {
    setSaveError(null);
    onChange({ ...draft, [key]: value });
  };
  const openDetails = () => {
    if (detailsRef.current) detailsRef.current.open = true;
  };

  const saveChanges = async () => {
    if (savingRef.current) return;
    if (mode !== 'edit' && !draft.name.trim()) {
      setSaveError('Введите название блюда.');
      nameRef.current?.focus();
      return;
    }
    if (mode !== 'edit' && (!draft.calories.trim() || invalidNumber(draft.calories))) {
      setSaveError('Укажите калорийность порции, например 250.');
      caloriesRef.current?.focus();
      return;
    }
    if (!draft.timestamp) {
      setSaveError('Укажите дату и время.');
      openDetails();
      dateRef.current?.focus();
      return;
    }
    if (mode !== 'edit' && [draft.protein, draft.fat, draft.carbs, draft.portionGrams ?? ''].some(invalidNumber)) {
      setSaveError('Проверьте вес порции и БЖУ. Значения должны быть неотрицательными.');
      openDetails();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await onSave();
      if (!saved) setSaveError('Не удалось сохранить изменения. Черновик остался в форме. Попробуйте ещё раз.');
    } catch {
      setSaveError('Не удалось сохранить изменения. Черновик остался в форме. Попробуйте ещё раз.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const portionInput = (
    <label className={labelClass}>
      <span>Вес порции, г (если известен)</span>
      <input inputMode="decimal" value={draft.portionGrams ?? ''} disabled={draft.nonFood || saving} onChange={event => update('portionGrams', event.target.value)} className={inputClass} />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center bg-black/70 sm:items-center sm:p-3">
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        noValidate
        onSubmit={event => { event.preventDefault(); void saveChanges(); }}
        onKeyDown={event => { if (event.key === 'Escape' && !savingRef.current) { event.stopPropagation(); onClose(); } }}
        className="ff-food-editor flex w-full max-w-xl max-h-[min(100dvh,42rem)] flex-col overflow-hidden rounded-t-3xl border border-slate-800 shadow-2xl sm:max-h-[min(calc(100dvh-1.5rem),42rem)] sm:rounded-3xl"
      >
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
          <div className="mb-3 flex items-start gap-3">
            {photo && <img src={photo} alt="" className="size-12 shrink-0 rounded-xl object-cover" />}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg leading-tight font-bold text-slate-50">{title}</h2>
              {mode === 'photo' && <p className="mt-1 text-xs text-slate-400">Калории и БЖУ рассчитаны по фото.</p>}
            </div>
            <button type="button" aria-label="Закрыть" onClick={onClose} disabled={saving} className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-300 hover:bg-slate-800 disabled:opacity-50">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3">
            <label className={labelClass}>
              <span>Название</span>
              <input ref={nameRef} aria-label="Название" value={draft.name} disabled={saving} onChange={event => update('name', event.target.value)} className={inputClass} placeholder="Например, овсянка" />
            </label>

            {mode === 'edit' && <label className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
              <input type="checkbox" checked={draft.nonFood} disabled={saving}
                onChange={event => {
                  const nonFood = event.target.checked;
                  onChange({ ...draft, nonFood, ...(nonFood ? { calories: '0', protein: '0', fat: '0', carbs: '0', ingredientsText: '' } : {}) });
                }} />
              <span><strong>Это не еда</strong><br />Запись не учитывается в дневном итоге.</span>
            </label>}

            <label className={labelClass}>
              <span>Ккал</span>
              <input ref={caloriesRef} aria-label="Ккал" inputMode="decimal" value={draft.calories} disabled={draft.nonFood || saving} onChange={event => update('calories', event.target.value)} className={inputClass} />
            </label>
            {mode === 'photo' && portionInput}

            <details ref={detailsRef} open={mode === 'edit' || undefined} className="rounded-xl border border-slate-800">
              <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-slate-200">Детали записи</summary>
              <div className="space-y-3 p-3 pt-0">
                {mode !== 'photo' && portionInput}
                <div className="grid gap-3 min-[480px]:grid-cols-2">
                  <label className={labelClass}>
                    <span>Приём пищи</span>
                    <span className="relative block">
                      <select value={draft.mealType} disabled={saving} onChange={event => onChange({ ...draft, mealType: event.target.value as MealType })} className={`${inputClass} appearance-none pr-9`}>
                        <option value="breakfast">Завтрак</option>
                        <option value="lunch">Обед</option>
                        <option value="dinner">Ужин</option>
                        <option value="snack">Перекус</option>
                      </select>
                      <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-3.5" />
                    </span>
                  </label>
                  <label className={labelClass}>
                    <span>Дата и время</span>
                    <input ref={dateRef} type="datetime-local" value={toLocalDateTimeInput(draft.timestamp)} disabled={saving} onChange={event => update('timestamp', fromLocalDateTimeInput(event.target.value))} className={inputClass} />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3">
                  {([['protein', 'Белки, г'], ['fat', 'Жиры, г'], ['carbs', 'Углеводы, г']] as const).map(([field, label]) => (
                    <label key={field} className={labelClass}>
                      <span>{label}</span>
                      <input aria-label={label} inputMode="decimal" value={draft[field]} disabled={draft.nonFood || saving} onChange={event => update(field, event.target.value)} className={inputClass} />
                    </label>
                  ))}
                </div>

                {mode !== 'manual' && <label className={labelClass}>
                  <span>Состав</span>
                  <textarea value={draft.ingredientsText} disabled={draft.nonFood || saving} onChange={event => update('ingredientsText', event.target.value)} className={`${inputClass} min-h-24`} placeholder="Ингредиент | доля в % | примечание" />
                </label>}
                <label className={labelClass}>
                  <span>Заметки</span>
                  <textarea value={draft.notesText} disabled={saving} onChange={event => update('notesText', event.target.value)} className={`${inputClass} min-h-20`} />
                </label>
              </div>
            </details>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-800 px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:px-5">
          {saveError && <p role="alert" className="mb-2 text-sm font-semibold text-rose-400">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-xl border border-slate-700 px-3 text-sm font-semibold text-slate-100 disabled:opacity-50">Отмена</button>
            <button type="submit" disabled={saving} aria-busy={saving} className="min-h-11 flex-1 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50">{saving ? 'Сохраняем…' : saveLabel}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
