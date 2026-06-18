import React, { useEffect, useMemo, useState } from 'react';
import type { AppLanguage, AppSettings, AppTheme, UserProfile } from './types';
import { Goal } from './types';
import { Check, Volume2, Music, Languages, Palette, AlertTriangle, UserCircle2, LogOut, Trash2, Cloud, RefreshCw, Save } from 'lucide-react';
import { calculateTDEE } from './profileMath';
import { MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS, DEFAULT_DEFICIT, DEFAULT_SURPLUS } from './constants';
import { clearAiCache } from './geminiService';

type SyncState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  serverSession?: boolean;
  onServerLogout?: () => Promise<void> | void;
  onDeleteAccount?: () => Promise<void> | void;

  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  user?: UserProfile | null;
  onChangeUser?: (next: UserProfile) => void;
  onPatchUser?: (patch: Partial<UserProfile>) => Promise<void> | void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
  onConnectAutosave?: () => Promise<boolean>;
  autosaveEnabled?: boolean;
  syncState?: SyncState;
  lastProfileSyncAt?: number | null;
  onSyncNow?: () => Promise<void> | void;
  onReloadFromCloud?: () => Promise<void> | void;
};

const Card: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-6 shadow-sm">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center">
        {icon}
      </div>
      <div className="text-slate-100 font-black">{title}</div>
    </div>
    {children}
  </div>
);

const Option: React.FC<{
  label: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ label, description, selected, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={[
      "w-full text-left p-4 rounded-[1.25rem] border transition-all",
      disabled ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-500/30",
      selected ? "border-indigo-500/40 bg-indigo-500/10" : "border-slate-800 bg-slate-950/30",
    ].join(' ')}
  >
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-slate-100 font-bold">{label}</div>
        {description && <div className="text-slate-400 text-sm mt-1">{description}</div>}
      </div>
      {selected && <Check className="w-5 h-5 text-indigo-300 mt-0.5" />}
    </div>
  </button>
);


const goalOptions = [
  { value: Goal.LOSS, label: 'Снижение веса' },
  { value: Goal.MAINTAIN, label: 'Поддержание' },
  { value: Goal.GAIN, label: 'Набор массы' },
] as const;

const syncStateLabel = (state: SyncState | undefined) => {
  switch (state) {
    case 'saving':
      return 'Сохраняем изменения…';
    case 'saved':
      return 'Облачный профиль синхронизирован';
    case 'error':
      return 'Ошибка синхронизации — изменения остались локально';
    default:
      return 'Локальные изменения ждут синхронизации';
  }
};

const formatSyncTs = (ts?: number | null) => {
  if (!ts) return 'Ещё не синхронизировано';
  try {
    return new Date(ts).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return 'Ещё не синхронизировано';
  }
};

const Toggle: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}> = ({ label, description, checked, disabled, onToggle, icon }) => (
  <div className="flex items-center justify-between gap-4 p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30">
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-2xl bg-slate-800/60 text-slate-200 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-slate-100 font-bold">{label}</div>
        {description && <div className="text-slate-400 text-sm mt-1">{description}</div>}
      </div>
    </div>
    <button
      onClick={onToggle}
      disabled={disabled}
      className={[
        "w-14 h-8 rounded-full border transition-all relative",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-500/30",
        checked ? "bg-indigo-600/70 border-indigo-500/40" : "bg-slate-900 border-slate-700",
      ].join(' ')}
      title={disabled ? "Скоро" : undefined}
    >
      <span
        className={[
          "absolute top-1 w-6 h-6 rounded-full bg-white/90 transition-all",
          checked ? "left-7" : "left-1",
        ].join(' ')}
      />
    </button>
  </div>
);

export default function SettingsScreen({
  settings,
  onChange,
  user,
  onChangeUser,
  onPatchUser,
  onExportBackup,
  onImportBackup,
  onConnectAutosave,
  autosaveEnabled,
  serverSession,
  onServerLogout,
  onDeleteAccount,
  syncState,
  lastProfileSyncAt,
  onSyncNow,
  onReloadFromCloud,
}: Props) {
  const tdee = user ? Math.round(calculateTDEE({ ...user, adaptationMultiplier: user.adaptationMultiplier ?? 1 })) : null;
  const lossDef = user?.lossDeficit ?? DEFAULT_DEFICIT;
  const gainSur = user?.gainSurplus ?? DEFAULT_SURPLUS;

  const [ackLoss, setAckLoss] = useState(false);
  const [ackGain, setAckGain] = useState(false);
  const [cacheClearedTs, setCacheClearedTs] = useState<number | null>(null);
  const [cacheCleared, setCacheCleared] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [draftName, setDraftName] = useState('');
  const [draftGoal, setDraftGoal] = useState<Goal>(Goal.MAINTAIN);
  const [draftTargetWeight, setDraftTargetWeight] = useState('');
  const [draftAge, setDraftAge] = useState('');
  const [draftHeight, setDraftHeight] = useState('');
  const [draftBloodPressureSystolic, setDraftBloodPressureSystolic] = useState('');
  const [draftBloodPressureDiastolic, setDraftBloodPressureDiastolic] = useState('');
  const [draftRestingPulse, setDraftRestingPulse] = useState('');
  const [profileDirty, setProfileDirty] = useState(false);

  const latestMeasurement = useMemo(() => {
    const list = user?.measurementsHistory || [];
    return list.length ? list[0] : null;
  }, [user?.measurementsHistory]);

  const profileSummary = useMemo(() => {
    if (!user) return null;
    return {
      name: (user.name || '').trim() || 'Пользователь',
      email: user.email || 'Без e-mail',
      targetWeight: Number(user.targetWeight || 0),
      bloodPressure: user.bloodPressureSystolic && user.bloodPressureDiastolic ? `${Math.round(Number(user.bloodPressureSystolic))}/${Math.round(Number(user.bloodPressureDiastolic))}` : '—',
      restingPulse: user.restingPulse ? `${Math.round(Number(user.restingPulse))}` : '—',
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setDraftName(user.name || '');
    setDraftGoal(user.goal || Goal.MAINTAIN);
    setDraftTargetWeight(user.targetWeight ? String(user.targetWeight) : '');
    setDraftAge(user.age ? String(user.age) : '');
    setDraftHeight(user.height ? String(user.height) : '');
    setDraftBloodPressureSystolic(user.bloodPressureSystolic ? String(user.bloodPressureSystolic) : '');
    setDraftBloodPressureDiastolic(user.bloodPressureDiastolic ? String(user.bloodPressureDiastolic) : '');
    setDraftRestingPulse(user.restingPulse ? String(user.restingPulse) : '');
    setProfileDirty(false);
  }, [user?.id, user?.name, user?.goal, user?.targetWeight, user?.age, user?.height, user?.bloodPressureSystolic, user?.bloodPressureDiastolic, user?.restingPulse]);

  const onPickImport = () => fileInputRef.current?.click();

  const onImportFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImportBackup) return;
    onImportBackup(file);
  };

  useEffect(() => {
    setAckLoss(!!user?.riskAcknowledgedLoss);
    setAckGain(!!user?.riskAcknowledgedGain);
    setCacheCleared(false);
  }, [user?.id]);

  const lossTooAggressive = user?.goal === Goal.LOSS && tdee && lossDef > Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3));
  const gainTooAggressive = user?.goal === Goal.GAIN && tdee && gainSur > AGGRESSIVE_SURPLUS;

  const setTheme = (t: AppTheme) => onChange({ ...settings, theme: t });
  const setLang = (l: AppLanguage) => onChange({ ...settings, language: l });

  const onClearAiCache = () => {
    try {
      clearAiCache();
      setCacheClearedTs(Date.now());
      setCacheCleared(true);
    } catch {
      // no-op
    }
  };

  const saveProfileDraft = async () => {
    if (!user) return;
    const safeName = draftName.trim() || user.name || 'Пользователь';
    const parsedTargetWeight = Number(draftTargetWeight || 0);
    const parsedAge = Number(draftAge || 0);
    const parsedHeight = Number(draftHeight || 0);
    const parsedBloodPressureSystolic = Number(draftBloodPressureSystolic || 0);
    const parsedBloodPressureDiastolic = Number(draftBloodPressureDiastolic || 0);
    const parsedRestingPulse = Number(draftRestingPulse || 0);
    const bloodPressureMeasuredAt = new Date().toISOString();
    const hasMeasurement =
      (Number.isFinite(parsedBloodPressureSystolic) && parsedBloodPressureSystolic > 0) ||
      (Number.isFinite(parsedBloodPressureDiastolic) && parsedBloodPressureDiastolic > 0) ||
      (Number.isFinite(parsedRestingPulse) && parsedRestingPulse > 0);

    const patch: Partial<UserProfile> = {
      name: safeName,
      goal: draftGoal,
      targetWeight: Number.isFinite(parsedTargetWeight) && parsedTargetWeight > 0 ? parsedTargetWeight : user.targetWeight,
      age: Number.isFinite(parsedAge) && parsedAge > 0 ? Math.round(parsedAge) : user.age,
      height: Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : user.height,
      bloodPressureSystolic: Number.isFinite(parsedBloodPressureSystolic) && parsedBloodPressureSystolic > 0 ? Math.round(parsedBloodPressureSystolic) : user.bloodPressureSystolic,
      bloodPressureDiastolic: Number.isFinite(parsedBloodPressureDiastolic) && parsedBloodPressureDiastolic > 0 ? Math.round(parsedBloodPressureDiastolic) : user.bloodPressureDiastolic,
      bloodPressureMeasuredAt: Number.isFinite(parsedBloodPressureSystolic) && parsedBloodPressureSystolic > 0 && Number.isFinite(parsedBloodPressureDiastolic) && parsedBloodPressureDiastolic > 0 ? bloodPressureMeasuredAt : user.bloodPressureMeasuredAt,
      restingPulse: Number.isFinite(parsedRestingPulse) && parsedRestingPulse > 0 ? Math.round(parsedRestingPulse) : user.restingPulse,
      restingPulseMeasuredAt: Number.isFinite(parsedRestingPulse) && parsedRestingPulse > 0 ? bloodPressureMeasuredAt : user.restingPulseMeasuredAt,
    };

    if (hasMeasurement) {
      const history = user.measurementsHistory || [];
      const entry = {
        date: bloodPressureMeasuredAt,
        weight: user.weight,
        bloodPressureSystolic: Number.isFinite(parsedBloodPressureSystolic) && parsedBloodPressureSystolic > 0 ? Math.round(parsedBloodPressureSystolic) : undefined,
        bloodPressureDiastolic: Number.isFinite(parsedBloodPressureDiastolic) && parsedBloodPressureDiastolic > 0 ? Math.round(parsedBloodPressureDiastolic) : undefined,
        restingPulse: Number.isFinite(parsedRestingPulse) && parsedRestingPulse > 0 ? Math.round(parsedRestingPulse) : undefined,
      };
      patch.measurementsHistory = [entry, ...history].slice(0, 30);
    }

    if (serverSession && onPatchUser) {
      await onPatchUser(patch);
    } else if (onChangeUser) {
      onChangeUser({ ...user, ...patch });
    }
    setProfileDirty(false);
  };

  const syncDescription = syncStateLabel(syncState);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8 text-left">
        <div className="text-3xl font-black text-slate-100">Настройки</div>
        <div className="text-slate-400 mt-2">Персонализируйте интерфейс. Часть функций будет добавлена позже.</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {user && onChangeUser && (
          <Card title="Профиль и аккаунт" icon={<UserCircle2 className="w-5 h-5" />}>
            <div className="space-y-4 text-left">
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/30 p-4">
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Профиль</div>
                {latestMeasurement && (
                  <div className="mb-3 rounded-[1rem] border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                    <div className="font-black text-slate-200 uppercase tracking-widest text-[10px]">Последний замер</div>
                    <div className="mt-1">
                      {latestMeasurement.bloodPressureSystolic && latestMeasurement.bloodPressureDiastolic
                        ? `${latestMeasurement.bloodPressureSystolic}/${latestMeasurement.bloodPressureDiastolic} мм рт. ст.`
                        : 'Давление не указано'}
                      {latestMeasurement.restingPulse ? ` · Пульс ${latestMeasurement.restingPulse} уд/мин` : ''}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3">
                  <label className="space-y-1">
                    <div className="text-sm text-slate-400 font-semibold">Имя</div>
                    <input
                      value={draftName}
                      onChange={(e) => { setDraftName(e.target.value); setProfileDirty(true); }}
                      className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                      placeholder="Как к вам обращаться"
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="text-sm text-slate-400 font-semibold">Цель</div>
                    <select
                      value={draftGoal}
                      onChange={(e) => { setDraftGoal(e.target.value as Goal); setProfileDirty(true); }}
                      className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                    >
                      {goalOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="space-y-1 min-w-0">
                      <div className="text-sm text-slate-400 font-semibold">Желаемый вес</div>
                      <input
                        value={draftTargetWeight}
                        onChange={(e) => { setDraftTargetWeight(e.target.value); setProfileDirty(true); }}
                        inputMode="decimal"
                        className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                        placeholder="кг"
                      />
                    </label>
                    <label className="space-y-1 min-w-0">
                      <div className="text-sm text-slate-400 font-semibold">Возраст</div>
                      <input
                        value={draftAge}
                        onChange={(e) => { setDraftAge(e.target.value); setProfileDirty(true); }}
                        inputMode="numeric"
                        className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                        placeholder="лет"
                      />
                    </label>
                    <label className="space-y-1 min-w-0">
                      <div className="text-sm text-slate-400 font-semibold">Рост</div>
                      <input
                        value={draftHeight}
                        onChange={(e) => { setDraftHeight(e.target.value); setProfileDirty(true); }}
                        inputMode="numeric"
                      className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                      placeholder="см"
                    />
                  </label>
                </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="space-y-1 min-w-0">
                      <div className="text-sm text-slate-400 font-semibold">Давление, верхнее</div>
                      <input
                        value={draftBloodPressureSystolic}
                        onChange={(e) => { setDraftBloodPressureSystolic(e.target.value); setProfileDirty(true); }}
                        inputMode="numeric"
                        className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                        placeholder="120"
                      />
                    </label>
                    <label className="space-y-1 min-w-0">
                      <div className="text-sm text-slate-400 font-semibold">Давление, нижнее</div>
                      <input
                        value={draftBloodPressureDiastolic}
                        onChange={(e) => { setDraftBloodPressureDiastolic(e.target.value); setProfileDirty(true); }}
                        inputMode="numeric"
                        className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                        placeholder="80"
                      />
                    </label>
                    <label className="space-y-1 min-w-0">
                      <div className="text-sm text-slate-400 font-semibold">Пульс покоя</div>
                      <input
                        value={draftRestingPulse}
                        onChange={(e) => { setDraftRestingPulse(e.target.value); setProfileDirty(true); }}
                        inputMode="numeric"
                        className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                        placeholder="60"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={saveProfileDraft}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all disabled:opacity-50"
                    disabled={!profileDirty}
                  >
                    <Save className="w-4 h-4" />
                    Сохранить профиль
                  </button>
                  <div className="text-sm text-slate-400 space-y-1">
                    {profileSummary?.email}
                    <div className="text-slate-500 text-xs">Давление: {profileSummary?.bloodPressure} · Пульс: {profileSummary?.restingPulse} уд/мин</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">Cloud + Sync</div>
                    <div className="text-slate-100 font-black">{syncDescription}</div>
                    <div className="text-slate-400 text-sm mt-1">Последняя синхронизация: {formatSyncTs(lastProfileSyncAt)}</div>
                    <div className="text-slate-500 text-sm mt-2">Профиль хранится локально для мгновенного отклика и в облаке для доступа с других устройств.</div>
                  </div>
                  <div className={["w-11 h-11 rounded-2xl flex items-center justify-center border", syncState === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : syncState === 'saved' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'].join(' ')}>
                    <Cloud className="w-5 h-5" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={() => void onSyncNow?.()}
                    className="w-full p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 hover:border-indigo-500/30 transition-all text-left disabled:opacity-50"
                    disabled={!serverSession || !onSyncNow}
                  >
                    <div className="text-slate-100 font-black">Синхронизировать сейчас</div>
                    <div className="text-slate-400 text-sm mt-1">Принудительно отправить профиль и локальные данные в облако.</div>
                  </button>

                  <button
                    onClick={() => void onReloadFromCloud?.()}
                    className="w-full p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 hover:border-indigo-500/30 transition-all text-left disabled:opacity-50"
                    disabled={!serverSession || !onReloadFromCloud}
                  >
                    <div className="text-slate-100 font-black">Перезагрузить из облака</div>
                    <div className="text-slate-400 text-sm mt-1">Подтянуть актуальные данные профиля с сервера и обновить это устройство.</div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => void onServerLogout?.()}
                  className="w-full p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 hover:border-indigo-500/30 transition-all text-left disabled:opacity-50 flex items-center justify-between gap-3"
                  disabled={!onServerLogout}
                >
                  <div>
                    <div className="text-slate-100 font-black">Выйти из аккаунта</div>
                    <div className="text-slate-400 text-sm mt-1">Завершить текущую сессию и вернуться на экран входа.</div>
                  </div>
                  <LogOut className="w-5 h-5 text-slate-300" />
                </button>

                <button
                  onClick={() => void onDeleteAccount?.()}
                  className="w-full p-4 rounded-[1.25rem] border border-rose-500/30 bg-rose-500/10 hover:border-rose-400/40 transition-all text-left disabled:opacity-50 flex items-center justify-between gap-3"
                  disabled={!serverSession || !onDeleteAccount}
                >
                  <div>
                    <div className="text-rose-100 font-black">Удалить аккаунт</div>
                    <div className="text-rose-200/80 text-sm mt-1">Полностью удалить облачный профиль и выйти из приложения.</div>
                  </div>
                  <Trash2 className="w-5 h-5 text-rose-200" />
                </button>
              </div>
            </div>
          </Card>
        )}
        <Card title="Тема" icon={<Palette className="w-5 h-5" />}>
          <div className="space-y-3">
            <Option
              label="Тёмная"
              description="Оптимально для вечернего использования"
              selected={settings.theme === 'dark'}
              onClick={() => setTheme('dark')}
            />
            <Option
              label="Светлая"
              description="Чистая медицинская тема для дневного света"
              selected={settings.theme === 'light'}
              onClick={() => setTheme('light')}
            />
            <Option
              label="Violet AI"
              description="Более AI-first: фиолетовый акцент и холодные подсветки"
              selected={settings.theme === 'violet'}
              onClick={() => setTheme('violet')}
            />
            <Option
              label="Calm"
              description="Wellness: мягкие бирюзовые акценты, спокойный контраст"
              selected={settings.theme === 'calm'}
              onClick={() => setTheme('calm')}
            />
            <Option
              label="Premium"
              description="Navy + Gold: премиальный контраст и золотой акцент"
              selected={settings.theme === 'premium'}
              onClick={() => setTheme('premium')}
            />
          </div>
        </Card>

        <Card title="Язык" icon={<Languages className="w-5 h-5" />}>
          <div className="space-y-3">
            <Option
              label="Русский"
              description="Текущий язык интерфейса"
              selected={settings.language === 'ru'}
              onClick={() => setLang('ru')}
            />
          </div>
        </Card>

        <Card title="Звук" icon={<Volume2 className="w-5 h-5" />}>
          <div className="space-y-3">
            <Toggle
              label="Звуковые эффекты"
              description="Будет добавлено позже"
              checked={settings.soundEnabled}
              disabled
              onToggle={() => onChange({ ...settings, soundEnabled: !settings.soundEnabled })}
              icon={<Volume2 className="w-4 h-4" />}
            />
            <Toggle
              label="Музыка"
              description="Будет добавлено позже"
              checked={settings.musicEnabled}
              disabled
              onToggle={() => onChange({ ...settings, musicEnabled: !settings.musicEnabled })}
              icon={<Music className="w-4 h-4" />}
            />
          </div>
        </Card>

        {user && onChangeUser && (
          <Card title="Интенсивность цели" icon={<span className="font-black">±</span>}>
            <div className="space-y-3 text-left">
              <div className="text-slate-300 text-sm font-semibold">
                Эта настройка влияет на прогнозы, KPI и Weekly Intelligence.
              </div>

              {user.goal === Goal.MAINTAIN && (
                <div className="p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 text-slate-400 text-sm font-semibold">
                  Для цели «Поддержание» смещение калорий не применяется.
                </div>
              )}

              {user.goal === Goal.LOSS && (
                <div className="space-y-3">
                  <div className="text-slate-100 font-black">Дефицит (ккал/день)</div>
                  <div className="flex flex-wrap gap-2">
                    {[250, 400, 500, 650, 750].map(v => (
                      <button
                        key={v}
                        onClick={() => {
                          const limit = tdee ? Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3)) : AGGRESSIVE_DEFICIT;
                          const isAgg = v > limit;
                          if (isAgg && !ackLoss) return;
                          onChangeUser({ ...user, lossDeficit: v, riskAcknowledgedLoss: isAgg ? true : user.riskAcknowledgedLoss });
                        }}
                        className={[
                          "px-4 py-2 rounded-full text-xs font-black border transition-all",
                          Number(user.lossDeficit ?? 500) === v ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-200" : "bg-slate-950/30 border-slate-800 text-slate-200 hover:border-indigo-500/30"
                        ].join(' ')}
                      >
                        −{v}
                      </button>
                    ))}
                  </div>

                  {lossTooAggressive && (
                    <div className="p-4 rounded-[1.25rem] border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm font-semibold">
                      Слишком агрессивный дефицит может ухудшать сон/настроение и повышать риск срывов. Рекомендуем держаться в пределах ≤30% от TDEE.
                    </div>
                  )}

                  {lossTooAggressive && (
                    <label className="flex items-start gap-2 p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ackLoss}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setAckLoss(next);
                          if (next) onChangeUser({ ...user, riskAcknowledgedLoss: true });
                        }}
                        className="mt-0.5"
                      />
                      <div className="text-slate-300 text-sm font-semibold leading-snug">
                        Я понимаю риски и разрешаю установить агрессивный дефицит.
                      </div>
                    </label>
                  )}

                  <div className="flex items-center gap-3 p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30">
                    <div className="text-slate-400 text-sm font-semibold">Точное значение</div>
                    <input
                      value={String(user.lossDeficit ?? 500)}
                      onChange={(e) => {
                        const raw = Number(e.target.value || 0);
                        const n = Math.max(MIN_DEFICIT, Math.min(MAX_DEFICIT, raw));
                        const limit = tdee ? Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3)) : AGGRESSIVE_DEFICIT;
                        const isAgg = n > limit;
                        if (isAgg && !ackLoss) return;
                        onChangeUser({ ...user, lossDeficit: isFinite(n) ? n : (user.lossDeficit ?? DEFAULT_DEFICIT), riskAcknowledgedLoss: isAgg ? true : user.riskAcknowledgedLoss });
                      }}
                      inputMode="numeric"
                      className="ml-auto w-28 px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-700 text-slate-100 font-black tabular-nums"
                    />
                  </div>
                </div>
              )}

              {user.goal === Goal.GAIN && (
                <div className="space-y-3">
                  <div className="text-slate-100 font-black">Профицит (ккал/день)</div>
                  <div className="flex flex-wrap gap-2">
                    {[150, 250, 300, 400, 500].map(v => (
                      <button
                        key={v}
                        onClick={() => {
                          const limit = AGGRESSIVE_SURPLUS;
                          const isAgg = v > limit;
                          if (isAgg && !ackGain) return;
                          onChangeUser({ ...user, gainSurplus: v, riskAcknowledgedGain: isAgg ? true : user.riskAcknowledgedGain });
                        }}
                        className={[
                          "px-4 py-2 rounded-full text-xs font-black border transition-all",
                          Number(user.gainSurplus ?? 300) === v ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-200" : "bg-slate-950/30 border-slate-800 text-slate-200 hover:border-indigo-500/30"
                        ].join(' ')}
                      >
                        +{v}
                      </button>
                    ))}
                  </div>

                  {gainTooAggressive && (
                    <div className="p-4 rounded-[1.25rem] border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm font-semibold">
                      Слишком высокий профицит часто ведёт к набору жира. Для большинства пользователей лучше держаться в умеренном диапазоне.
                    </div>
                  )}

                  {gainTooAggressive && (
                    <label className="flex items-start gap-2 p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ackGain}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setAckGain(next);
                          if (next) onChangeUser({ ...user, riskAcknowledgedGain: true });
                        }}
                        className="mt-0.5"
                      />
                      <div className="text-slate-300 text-sm font-semibold leading-snug">
                        Я понимаю риски и разрешаю установить высокий профицит.
                      </div>
                    </label>
                  )}

                  <div className="flex items-center gap-3 p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30">
                    <div className="text-slate-400 text-sm font-semibold">Точное значение</div>
                    <input
                      value={String(user.gainSurplus ?? 300)}
                      onChange={(e) => {
                        const raw = Number(e.target.value || 0);
                        const n = Math.max(MIN_SURPLUS, Math.min(MAX_SURPLUS, raw));
                        const limit = AGGRESSIVE_SURPLUS;
                        const isAgg = n > limit;
                        if (isAgg && !ackGain) return;
                        onChangeUser({ ...user, gainSurplus: isFinite(n) ? n : (user.gainSurplus ?? DEFAULT_SURPLUS), riskAcknowledgedGain: isAgg ? true : user.riskAcknowledgedGain });
                      }}
                      inputMode="numeric"
                      className="ml-auto w-28 px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-700 text-slate-100 font-black tabular-nums"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card title="AI и кэш" icon={<span className="font-black">AI</span>}>
          <div className="space-y-3 text-left">
            <div className="text-slate-400 text-sm font-semibold">
              Если Gemini временно недоступен или квота исчерпана, приложение использует кэш и локальные подсказки.
            </div>

            <button
              onClick={onClearAiCache}
              className="w-full p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 hover:border-indigo-500/30 transition-all text-left"
            >
              <div className="text-slate-100 font-black">Сбросить AI-кэш</div>
              <div className="text-slate-400 text-sm mt-1">Очистит кэш ответов, статусы и паузу Gemini.</div>
            </button>

            {cacheCleared && (
              <div className="text-emerald-200 text-sm font-bold">
                Кэш сброшен.
              </div>
            )}
          </div>
        </Card>

        <Card title="Резервная копия (JSON)" icon={<span className="font-black">⤓</span>}>
          <div className="space-y-3 text-left">
            <div className="text-slate-400 text-sm font-semibold">
              Для тестов и переноса между браузерами экспортируйте/импортируйте данные в JSON.
              {autosaveEnabled ? (
                <span className="text-emerald-200 font-bold"> Автосейв включён.</span>
              ) : (
                <span className="text-slate-500"> Автосейв не включён.</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={onExportBackup}
                disabled={!onExportBackup}
                className="w-full p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 hover:border-indigo-500/30 transition-all text-left disabled:opacity-50"
              >
                <div className="text-slate-100 font-black">Экспорт JSON</div>
                <div className="text-slate-400 text-sm mt-1">Скачает fitfocus-backup.json</div>
              </button>

              <button
                onClick={onPickImport}
                disabled={!onImportBackup}
                className="w-full p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 hover:border-indigo-500/30 transition-all text-left disabled:opacity-50"
              >
                <div className="text-slate-100 font-black">Импорт JSON</div>
                <div className="text-slate-400 text-sm mt-1">Восстановить из файла</div>
              </button>
            </div>

            <button
              onClick={async () => {
                if (!onConnectAutosave) return;
                await onConnectAutosave();
              }}
              disabled={!onConnectAutosave}
              className="w-full p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 hover:border-indigo-500/30 transition-all text-left disabled:opacity-50"
            >
              <div className="text-slate-100 font-black">Подключить автосейв (JSON файл)</div>
              <div className="text-slate-400 text-sm mt-1">Chrome/Edge: выберите место для файла, дальше данные пишутся автоматически.</div>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportFileChange}
            />
          </div>
        </Card>

        <Card title="О приложении" icon={<span className="font-black">FF</span>}>
          <div className="text-slate-300 leading-relaxed text-left">
            FitFocus — персональная AI-экосистема для управления питанием, привычками и прогрессом.
            <div className="text-slate-500 mt-2 text-sm">
              Настройки и тестовые данные сохраняются локально на устройстве.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
