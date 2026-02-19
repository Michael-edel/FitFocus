import React, { useEffect, useState } from 'react';
import type { AppLanguage, AppSettings, AppTheme, UserProfile } from './types';
import { Goal } from './types';
import { Check, Volume2, Music, Languages, Palette, AlertTriangle } from 'lucide-react';
import { calculateTDEE } from './profileMath';
import { MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS, DEFAULT_DEFICIT, DEFAULT_SURPLUS } from './constants';
import { clearAiCache } from './geminiService';

type Props = {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  user?: UserProfile | null;
  onChangeUser?: (next: UserProfile) => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
  onConnectAutosave?: () => Promise<boolean>;
  autosaveEnabled?: boolean;
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
  onExportBackup,
  onImportBackup,
  onConnectAutosave,
  autosaveEnabled,
}: Props) {
  const tdee = user ? Math.round(calculateTDEE({ ...user, adaptationMultiplier: user.adaptationMultiplier ?? 1 })) : null;
  const lossDef = user?.lossDeficit ?? DEFAULT_DEFICIT;
  const gainSur = user?.gainSurplus ?? DEFAULT_SURPLUS;

  const [ackLoss, setAckLoss] = useState(false);
  const [ackGain, setAckGain] = useState(false);
  const [cacheClearedTs, setCacheClearedTs] = useState<number | null>(null);
  const [cacheCleared, setCacheCleared] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

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

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8 text-left">
        <div className="text-3xl font-black text-slate-100">Настройки</div>
        <div className="text-slate-400 mt-2">Персонализируйте интерфейс. Часть функций будет добавлена позже.</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

            <button
              onClick={() => {
                // Server export (D1). Uses HttpOnly cookie session.
                window.open('/api/export', '_blank');
              }}
              className="w-full p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 hover:border-amber-400/30 transition-all text-left"
            >
              <div className="text-slate-100 font-black">Экспорт данных (сервер)</div>
              <div className="text-slate-400 text-sm mt-1">Профиль + история питания + AI-логи (если включены).</div>
            </button>

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