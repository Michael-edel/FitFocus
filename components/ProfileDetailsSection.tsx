import React from 'react';
import { Save } from 'lucide-react';

type ProfileSummary = {
  email: string;
  bloodPressure: string;
  restingPulse: string;
  bloodGlucose: string;
  bloodGlucoseStatus: string;
  bodyMeasurements: string;
};

type Props = {
  draftAllergensText: string;
  draftIntolerancesText: string;
  draftExcludedFoodsText: string;
  draftDietarySeverity: 'strict' | 'avoid';
  draftMedicalRestrictions: string;
  draftBloodPressureSystolic: string;
  draftBloodPressureDiastolic: string;
  draftRestingPulse: string;
  draftBloodGlucoseMmolL: string;
  draftWaistCm: string;
  draftChestCm: string;
  draftHipsCm: string;
  profileDirty: boolean;
  profileValidationError: string | null;
  profileSummary?: ProfileSummary | null;
  onProfileSave: () => void | Promise<void>;
  onAllergensChange: (value: string) => void;
  onIntolerancesChange: (value: string) => void;
  onExcludedFoodsChange: (value: string) => void;
  onDietarySeverityChange: (value: 'strict' | 'avoid') => void;
  onMedicalRestrictionsChange: (value: string) => void;
  onBloodPressureSystolicChange: (value: string) => void;
  onBloodPressureDiastolicChange: (value: string) => void;
  onRestingPulseChange: (value: string) => void;
  onBloodGlucoseChange: (value: string) => void;
  onWaistChange: (value: string) => void;
  onChestChange: (value: string) => void;
  onHipsChange: (value: string) => void;
};

export default function ProfileDetailsSection({
  draftAllergensText,
  draftIntolerancesText,
  draftExcludedFoodsText,
  draftDietarySeverity,
  draftMedicalRestrictions,
  draftBloodPressureSystolic,
  draftBloodPressureDiastolic,
  draftRestingPulse,
  draftBloodGlucoseMmolL,
  draftWaistCm,
  draftChestCm,
  draftHipsCm,
  profileDirty,
  profileValidationError,
  profileSummary,
  onProfileSave,
  onAllergensChange,
  onIntolerancesChange,
  onExcludedFoodsChange,
  onDietarySeverityChange,
  onMedicalRestrictionsChange,
  onBloodPressureSystolicChange,
  onBloodPressureDiastolicChange,
  onRestingPulseChange,
  onBloodGlucoseChange,
  onWaistChange,
  onChestChange,
  onHipsChange,
}: Props) {
  const allergenTags = ['орехи', 'молоко/лактоза', 'яйца', 'рыба/морепродукты', 'глютен', 'соя', 'арахис', 'кунжут'];

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/30 p-4">
        <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Дополнительные данные</div>
        <div className="space-y-3">
          <div className="space-y-2 rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Питание и ограничения</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1 min-w-0">
                <div className="text-sm text-slate-400 font-semibold">Аллергены</div>
                <input
                  value={draftAllergensText}
                  onChange={(e) => onAllergensChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                  placeholder="орехи, лактоза, яйца"
                />
              </label>
              <label className="space-y-1 min-w-0">
                <div className="text-sm text-slate-400 font-semibold">Непереносимость / избегать</div>
                <input
                  value={draftIntolerancesText}
                  onChange={(e) => onIntolerancesChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                  placeholder="лук, чеснок, острое"
                />
              </label>
              <label className="space-y-1 min-w-0">
                <div className="text-sm text-slate-400 font-semibold">Не ем совсем</div>
                <input
                  value={draftExcludedFoodsText}
                  onChange={(e) => onExcludedFoodsChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                  placeholder="свинина, грибы"
                />
              </label>
              <label className="space-y-1 min-w-0">
                <div className="text-sm text-slate-400 font-semibold">Строгость</div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'strict' as const, label: 'Строго' },
                    { id: 'avoid' as const, label: 'По возможности' },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onDietarySeverityChange(opt.id)}
                      className={[
                        'px-3 py-3 rounded-[1rem] border text-xs font-black transition-all',
                        draftDietarySeverity === opt.id ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {allergenTags.map((tag) => {
                const selected = draftAllergensText.split(',').map((value) => value.trim()).filter(Boolean).includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const next = new Set(draftAllergensText.split(',').map((value) => value.trim()).filter(Boolean));
                      if (next.has(tag)) next.delete(tag);
                      else next.add(tag);
                      onAllergensChange(Array.from(next).join(', '));
                    }}
                    className={[
                      'px-3 py-2 rounded-full border text-xs font-black transition-all',
                      selected ? 'bg-rose-500/10 border-rose-400/40 text-rose-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700',
                    ].join(' ')}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <label className="space-y-1 min-w-0 block">
              <div className="text-sm text-slate-400 font-semibold">Медицинские ограничения</div>
              <textarea
                value={draftMedicalRestrictions}
                onChange={(e) => onMedicalRestrictionsChange(e.target.value)}
                className="w-full min-h-[96px] px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold resize-y"
                placeholder="например: гипертония 1 степени, травма колена"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 min-w-0">
              <div className="text-sm text-slate-400 font-semibold">Давление, верхнее</div>
              <input
                value={draftBloodPressureSystolic}
                onChange={(e) => onBloodPressureSystolicChange(e.target.value)}
                inputMode="numeric"
                className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                placeholder="120"
              />
            </label>
            <label className="space-y-1 min-w-0">
              <div className="text-sm text-slate-400 font-semibold">Давление, нижнее</div>
              <input
                value={draftBloodPressureDiastolic}
                onChange={(e) => onBloodPressureDiastolicChange(e.target.value)}
                inputMode="numeric"
                className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                placeholder="80"
              />
            </label>
            <label className="space-y-1 min-w-0">
              <div className="text-sm text-slate-400 font-semibold">Пульс покоя</div>
              <input
                value={draftRestingPulse}
                onChange={(e) => onRestingPulseChange(e.target.value)}
                inputMode="numeric"
                className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                placeholder="60"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 min-w-0">
              <div className="text-sm text-slate-400 font-semibold">Сахар крови</div>
              <input
                value={draftBloodGlucoseMmolL}
                onChange={(e) => onBloodGlucoseChange(e.target.value)}
                inputMode="decimal"
                step="0.1"
                className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                placeholder="5.4 ммоль/л"
              />
            </label>
            <div className="rounded-[1rem] border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400 flex items-center">
              Если значение не введено, сахар не используется в формулах и попадает только в дневник замеров.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 min-w-0">
              <div className="text-sm text-slate-400 font-semibold">Талия</div>
              <input
                value={draftWaistCm}
                onChange={(e) => onWaistChange(e.target.value)}
                inputMode="numeric"
                className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                placeholder="см"
              />
            </label>
            <label className="space-y-1 min-w-0">
              <div className="text-sm text-slate-400 font-semibold">Грудь</div>
              <input
                value={draftChestCm}
                onChange={(e) => onChestChange(e.target.value)}
                inputMode="numeric"
                className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                placeholder="см"
              />
            </label>
            <label className="space-y-1 min-w-0">
              <div className="text-sm text-slate-400 font-semibold">Бедра</div>
              <input
                value={draftHipsCm}
                onChange={(e) => onHipsChange(e.target.value)}
                inputMode="numeric"
                className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                placeholder="см"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={onProfileSave}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all disabled:opacity-50"
            disabled={!profileDirty}
          >
            <Save className="w-4 h-4" />
            Сохранить профиль
          </button>
          {profileValidationError && (
            <div className="w-full rounded-[1rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 font-semibold">
              {profileValidationError}
            </div>
          )}
          <div className="text-sm text-slate-400 space-y-1">
            {profileSummary?.email}
            <div className="text-slate-500 text-xs">Давление: {profileSummary?.bloodPressure} · Пульс: {profileSummary?.restingPulse} уд/мин</div>
            <div className="text-slate-500 text-xs">Сахар: {profileSummary?.bloodGlucose} · {profileSummary?.bloodGlucoseStatus}</div>
            <div className="text-slate-500 text-xs">Обхваты: {profileSummary?.bodyMeasurements}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
