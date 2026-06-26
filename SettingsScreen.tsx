import React, { useEffect, useMemo, useState } from 'react';
import type { AppLanguage, AppSettings, AppTheme, UserProfile, ProgressPhoto, WearableProvider } from './types';
import { Goal } from './types';
import { Check, Volume2, Music, Languages, Palette, AlertTriangle, UserCircle2, LogOut, Trash2, Cloud, RefreshCw, Watch, Smartphone, Copy, KeyRound, Link2, Bell, BellOff, Send, Camera, Upload } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { calculateTDEE } from './profileMath';
import { formatBloodGlucose, getBloodGlucoseGuidance } from './profileMath';
import { MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS, DEFAULT_DEFICIT, DEFAULT_SURPLUS } from './constants';
import { clearAiCache } from './geminiService';
import ProfileDetailsSection from './components/ProfileDetailsSection';

const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 230;
const MIN_WEIGHT_KG = 25;
const MAX_WEIGHT_KG = 350;
const MIN_BMI = 12;
const MAX_BMI = 60;

type SyncState = 'idle' | 'saving' | 'saved' | 'error';

type SettingsUiState = {
  draftName: string;
  draftGoal: Goal;
  draftTargetWeight: string;
  draftAge: string;
  draftHeight: string;
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
  progressPhotoNote: string;
  ackLoss: boolean;
  ackGain: boolean;
};

const SETTINGS_UI_STORAGE_KEY = 'fitfocus.settings.ui.v1';

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
  onResetUiState?: () => void;
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

const wearableOptions: Array<{ value: WearableProvider; label: string; note: string }> = [
  { value: 'apple_health', label: 'Apple Health', note: 'iPhone / Apple Watch · HealthKit' },
  { value: 'google_fit', label: 'Google Fit', note: 'Android / Wear OS' },
  { value: 'fitbit', label: 'Fitbit', note: 'Часы и браслеты Fitbit' },
  { value: 'garmin', label: 'Garmin', note: 'Спортивные часы Garmin' },
  { value: 'manual', label: 'Ручной импорт', note: 'CSV / JSON из часов' },
] as const;

const wearableProviderLabel: Record<WearableProvider, string> = {
  apple_health: 'Apple Health',
  google_fit: 'Google Fit',
  fitbit: 'Fitbit',
  garmin: 'Garmin',
  manual: 'Ручной импорт',
};

const normalizeCommaList = (value: string) => value
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
  .filter((item, index, arr) => arr.indexOf(item) === index)
  .slice(0, 30);

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

const formatIsoSyncTs = (iso?: string | null) => {
  if (!iso) return 'Ещё не синхронизировано';
  try {
    return new Date(iso).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return 'Ещё не синхронизировано';
  }
};

const formatMobileTokenExpiry = (ts?: number | null) => {
  if (!ts) return 'Срок не указан';
  try {
    return new Date(ts).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return 'Срок не указан';
  }
};

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressProgressPhoto(file: File): Promise<{ photo: string; thumb: string }> {
  const img = await loadImageElement(file);
  const srcW = img.naturalWidth || img.width || 1;
  const srcH = img.naturalHeight || img.height || 1;

  const render = (maxSide: number, quality: number) => {
    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');
    ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  };

  return {
    photo: render(1024, 0.78),
    thumb: render(240, 0.8),
  };
}

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
  onResetUiState,
}: Props) {
  const tdee = user ? Math.round(calculateTDEE({ ...user, adaptationMultiplier: user.adaptationMultiplier ?? 1 })) : null;
  const lossDef = user?.lossDeficit ?? DEFAULT_DEFICIT;
  const gainSur = user?.gainSurplus ?? DEFAULT_SURPLUS;

  const [ackLoss, setAckLoss] = useState(false);
  const [ackGain, setAckGain] = useState(false);
  const [cacheClearedTs, setCacheClearedTs] = useState<number | null>(null);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [profileValidationError, setProfileValidationError] = useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [draftName, setDraftName] = useState('');
  const [draftGoal, setDraftGoal] = useState<Goal>(Goal.MAINTAIN);
  const [draftTargetWeight, setDraftTargetWeight] = useState('');
  const [draftAge, setDraftAge] = useState('');
  const [draftHeight, setDraftHeight] = useState('');
  const [draftAllergensText, setDraftAllergensText] = useState('');
  const [draftIntolerancesText, setDraftIntolerancesText] = useState('');
  const [draftExcludedFoodsText, setDraftExcludedFoodsText] = useState('');
  const [draftDietarySeverity, setDraftDietarySeverity] = useState<'strict' | 'avoid'>('strict');
  const [draftMedicalRestrictions, setDraftMedicalRestrictions] = useState('');
  const [draftBloodPressureSystolic, setDraftBloodPressureSystolic] = useState('');
  const [draftBloodPressureDiastolic, setDraftBloodPressureDiastolic] = useState('');
  const [draftRestingPulse, setDraftRestingPulse] = useState('');
  const [draftBloodGlucoseMmolL, setDraftBloodGlucoseMmolL] = useState('');
  const [draftWaistCm, setDraftWaistCm] = useState('');
  const [draftChestCm, setDraftChestCm] = useState('');
  const [draftHipsCm, setDraftHipsCm] = useState('');
  const [progressPhotoNote, setProgressPhotoNote] = useState('');
  const [progressPhotoBusy, setProgressPhotoBusy] = useState(false);
  const [progressPhotoError, setProgressPhotoError] = useState<string | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [wearableBusy, setWearableBusy] = useState<WearableProvider | 'disconnect' | null>(null);
  const [uiResetAt, setUiResetAt] = useState<number | null>(null);
  const [mobileTokenBusy, setMobileTokenBusy] = useState(false);
  const [mobileTokenValue, setMobileTokenValue] = useState('');
  const [mobileTokenExpiresAt, setMobileTokenExpiresAt] = useState<number | null>(null);
  const [mobileTokenError, setMobileTokenError] = useState<string | null>(null);
  const [mobileTokenCopiedAt, setMobileTokenCopiedAt] = useState<number | null>(null);
  const [bridgeSetupCopiedAt, setBridgeSetupCopiedAt] = useState<number | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushPublicKey, setPushPublicKey] = useState('');
  const [pushDeviceCount, setPushDeviceCount] = useState<number>(0);
  const [pushSubscriptionCount, setPushSubscriptionCount] = useState<number>(0);
  const [pushLastDeliveryError, setPushLastDeliveryError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  const progressPhotoInputRef = React.useRef<HTMLInputElement | null>(null);

  const latestMeasurement = useMemo(() => {
    const list = user?.measurementsHistory || [];
    return list.length ? list[0] : null;
  }, [user?.measurementsHistory]);

  const progressPhotos = user?.progressPhotos || [];
  const latestProgressPhoto = progressPhotos[0] || null;
  const settingsUiStorageKey = useMemo(
    () => `${SETTINGS_UI_STORAGE_KEY}:${user?.id ?? 'anon'}`,
    [user?.id],
  );
  const settingsUiSkipSaveRef = React.useRef(false);
  const resetUiState = () => {
    if (!user?.id) return;
    const keysToClear = [
      `fitfocus.settings.ui.v1:${user.id}`,
      `fitfocus.plan.ui.v1:${user.id}`,
      `fitfocus.plan.active-day.v1:${user.id}`,
      `fitfocus.progress.ui.v1:${user.id}`,
      `fitfocus.progress-archive.sections.v1:${user.id}`,
      `fitfocus.dashboard.new-weight.v1:${user.id}`,
    ];
    try {
      keysToClear.forEach((key) => localStorage.removeItem(key));
    } catch {
      // ignore
    }
    onResetUiState?.();
    setUiResetAt(Date.now());

    settingsUiSkipSaveRef.current = true;
    setDraftName(user.name || '');
    setDraftGoal(user.goal || Goal.MAINTAIN);
    setDraftTargetWeight(user.targetWeight ? String(user.targetWeight) : '');
    setDraftAge(user.age ? String(user.age) : '');
    setDraftHeight(user.height ? String(user.height) : '');
    setDraftAllergensText((user.dietary?.allergens || []).join(', '));
    setDraftIntolerancesText((user.dietary?.intolerances || []).join(', '));
    setDraftExcludedFoodsText((user.dietary?.excludedFoods || []).join(', '));
    setDraftDietarySeverity(user.dietary?.severity || 'strict');
    setDraftMedicalRestrictions(user.medicalRestrictions || '');
    setDraftBloodPressureSystolic(user.bloodPressureSystolic ? String(user.bloodPressureSystolic) : '');
    setDraftBloodPressureDiastolic(user.bloodPressureDiastolic ? String(user.bloodPressureDiastolic) : '');
    setDraftRestingPulse(user.restingPulse ? String(user.restingPulse) : '');
    setDraftBloodGlucoseMmolL(user.bloodGlucoseMmolL ? String(user.bloodGlucoseMmolL) : '');
    setDraftWaistCm(user.waistCm ? String(user.waistCm) : '');
    setDraftChestCm(user.chestCm ? String(user.chestCm) : '');
    setDraftHipsCm(user.hipsCm ? String(user.hipsCm) : '');
    setProgressPhotoNote('');
    setAckLoss(!!user.riskAcknowledgedLoss);
    setAckGain(!!user.riskAcknowledgedGain);
    setProfileDirty(false);
  };

  const profileSummary = useMemo(() => {
    if (!user) return null;
    return {
      name: (user.name || '').trim() || 'Пользователь',
      email: user.email || 'Без e-mail',
      targetWeight: Number(user.targetWeight || 0),
      bloodPressure: user.bloodPressureSystolic && user.bloodPressureDiastolic ? `${Math.round(Number(user.bloodPressureSystolic))}/${Math.round(Number(user.bloodPressureDiastolic))}` : '—',
      restingPulse: user.restingPulse ? `${Math.round(Number(user.restingPulse))}` : '—',
      bloodGlucose: formatBloodGlucose(user.bloodGlucoseMmolL),
      bloodGlucoseStatus: getBloodGlucoseGuidance(user.bloodGlucoseMmolL),
      bodyMeasurements: [
        user.waistCm ? `талия ${Math.round(Number(user.waistCm))} см` : null,
        user.chestCm ? `грудь ${Math.round(Number(user.chestCm))} см` : null,
        user.hipsCm ? `бедра ${Math.round(Number(user.hipsCm))} см` : null,
      ].filter(Boolean).join(' · ') || '—',
    };
  }, [user]);

  const wearableSummary = user?.wearableProvider && user.wearableEnabled !== false
    ? wearableProviderLabel[user.wearableProvider]
    : 'Не подключено';
  const bridgeBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://fitfocus.pages.dev';
  const bridgeSetupLink = useMemo(() => {
    if (!mobileTokenValue || !bridgeBaseUrl) return '';
    const params = new URLSearchParams({
      baseURL: bridgeBaseUrl,
      token: mobileTokenValue,
    });
    if (mobileTokenExpiresAt) {
      params.set('expiresAt', String(mobileTokenExpiresAt));
    }
    return `fitfocusbridge://setup?${params.toString()}`;
  }, [bridgeBaseUrl, mobileTokenExpiresAt, mobileTokenValue]);

  const syncWearableProvider = async (provider: WearableProvider) => {
    if (!user || !onPatchUser) return;
    const now = new Date().toISOString();
    setWearableBusy(provider);
    try {
      await onPatchUser({
        wearableProvider: provider,
        wearableEnabled: true,
        wearableConnectedAt: user.wearableConnectedAt || now,
        wearableLastSyncAt: now,
      });
    } finally {
      setWearableBusy(null);
    }
  };

  const disconnectWearable = async () => {
    if (!user || !onPatchUser) return;
    setWearableBusy('disconnect');
    try {
      await onPatchUser({
        wearableEnabled: false,
      });
    } finally {
      setWearableBusy(null);
    }
  };

  const generateMobileToken = async () => {
    if (!serverSession) return;
    setMobileTokenBusy(true);
    setMobileTokenError(null);
    setMobileTokenCopiedAt(null);
    setBridgeSetupCopiedAt(null);
    try {
      const response = await fetch('/api/mobile/token', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload.token !== 'string') {
        throw new Error(payload?.error === 'UNAUTH'
          ? 'Сначала войдите в аккаунт FitFocus.'
          : 'Не удалось создать мобильный токен.');
      }

      setMobileTokenValue(payload.token);
      setMobileTokenExpiresAt(typeof payload.expiresAt === 'number' ? payload.expiresAt : null);
      try {
        await navigator.clipboard.writeText(payload.token);
        setMobileTokenCopiedAt(Date.now());
      } catch {
        // clipboard is optional
      }
    } catch (error) {
      setMobileTokenError(error instanceof Error ? error.message : 'Не удалось создать мобильный токен');
    } finally {
      setMobileTokenBusy(false);
    }
  };

  const copyMobileToken = async () => {
    if (!mobileTokenValue) return;
    try {
      await navigator.clipboard.writeText(mobileTokenValue);
      setMobileTokenCopiedAt(Date.now());
    } catch {
      setMobileTokenError('Не удалось скопировать токен');
    }
  };

  const copyBridgeSetup = async () => {
    if (!bridgeSetupLink) return;
    try {
      await navigator.clipboard.writeText(bridgeSetupLink);
      setBridgeSetupCopiedAt(Date.now());
    } catch {
      setMobileTokenError('Не удалось скопировать ссылку для bridge');
    }
  };

  const getPushDeviceLabel = () => {
    if (typeof navigator === 'undefined') return 'Устройство';
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Браузер';
  };

  const getPushDeviceHelp = () => {
    const device = getPushDeviceLabel();
    if (device === 'Windows' || device === 'Mac' || device === 'Linux') {
      return 'На компьютере push работает в поддерживаемом браузере, если разрешены уведомления сайта и не отключены системные уведомления ОС.';
    }
    if (device === 'iPhone' || device === 'iPad') {
      return 'Для iPhone и iPad push-уведомления работают в установленном приложении FitFocus с домашнего экрана.';
    }
    if (device === 'Android') {
      return 'На Android push работает в браузере и в PWA-режиме, если разрешения включены.';
    }
    return 'Push работает в поддерживаемом браузере, если разрешены уведомления для сайта.';
  };

  const isPushSupported = () =>
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const readPushStatus = async () => {
    const response = await fetch('/api/push/status', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new Error('status');

    const configured = Boolean(payload.configured);
    const publicKey = String(payload.vapid_public_key || (import.meta as any)?.env?.VITE_PUSH_VAPID_PUBLIC_KEY || '');
    const subscriptions = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
    const lastDeliveryError = subscriptions.find((item: any) => typeof item?.last_error === 'string' && item.last_error.trim())?.last_error || null;
    setPushConfigured(configured);
    setPushPublicKey(publicKey);
    setPushSubscriptionCount(Number(payload.count || 0));
    setPushDeviceCount(subscriptions.length || Number(payload.count || 0));
    setPushLastDeliveryError(lastDeliveryError);
    return { configured, publicKey, lastDeliveryError };
  };

  const refreshPushStatus = async () => {
    if (!serverSession) return;
    const supported = isPushSupported();
    setPushSupported(supported);
    setPushPermission(supported ? Notification.permission : 'unsupported');

    if (!supported) {
      setPushSubscribed(false);
      setPushConfigured(false);
      setPushPublicKey('');
      setPushSubscriptionCount(0);
      setPushDeviceCount(0);
      setPushLastDeliveryError(null);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushSubscribed(Boolean(subscription));
    } catch {
      setPushSubscribed(false);
    }

    try {
      await readPushStatus();
    } catch {
      setPushConfigured(false);
      setPushPublicKey('');
      setPushSubscriptionCount(0);
      setPushDeviceCount(0);
      setPushLastDeliveryError(null);
    }
  };

  const subscribeToPush = async () => {
    if (!serverSession) {
      setPushError('Сначала войдите в аккаунт.');
      return;
    }
    if (!isPushSupported()) {
      setPushError('Этот браузер не поддерживает push-уведомления.');
      return;
    }
    let publicKey = pushPublicKey || (import.meta as any)?.env?.VITE_PUSH_VAPID_PUBLIC_KEY || '';
    try {
      const status = await readPushStatus();
      if (!status.configured) {
        setPushError('Push-сервер не настроен.');
        return;
      }
      publicKey = status.publicKey;
    } catch {
      if (!publicKey) {
        setPushError('Не удалось получить push-конфигурацию.');
        return;
      }
    }
    if (!publicKey) {
      setPushError('Не задан PUSH_VAPID_PUBLIC_KEY.');
      return;
    }

    setPushBusy(true);
    setPushError(null);
    setPushNotice(null);

    try {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== 'granted') {
        throw new Error('Разрешите уведомления в браузере.');
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          deviceLabel: getPushDeviceLabel(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Не удалось сохранить push-подписку.');
      }

      setPushSubscribed(true);
      setPushNotice(`Уведомления включены на устройстве ${payload?.deviceLabel || getPushDeviceLabel()}.`);
      await refreshPushStatus();
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Не удалось включить push-уведомления.');
    } finally {
      setPushBusy(false);
    }
  };

  const unsubscribeFromPush = async () => {
    if (!serverSession) return;
    if (!isPushSupported()) {
      setPushError('Этот браузер не поддерживает push-уведомления.');
      return;
    }

    setPushBusy(true);
    setPushError(null);
    setPushNotice(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setPushSubscribed(false);
        setPushNotice('Подписка на этом устройстве уже отключена.');
        await refreshPushStatus();
        return;
      }

      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          subscription: subscription.toJSON(),
        }),
      });

      await subscription.unsubscribe();
      setPushSubscribed(false);
      setPushNotice('Уведомления на этом устройстве отключены.');
      await refreshPushStatus();
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Не удалось отключить push-уведомления.');
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestPush = async () => {
    if (!serverSession) {
      setPushError('Сначала войдите в аккаунт.');
      return;
    }
    if (!isPushSupported()) {
      setPushError('Этот браузер не поддерживает push-уведомления.');
      return;
    }

    setPushBusy(true);
    setPushError(null);
    setPushNotice(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription?.endpoint || undefined,
          title: 'FitFocus',
          body: 'Тест push-уведомления: подписка активна.',
          url: '/',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Не удалось отправить тестовое уведомление.');
      }
      await refreshPushStatus();
      const sent = Number(payload?.sent || 0);
      const failed = Number(payload?.failed || 0);
      const removed = Number(payload?.removed || 0);
      const firstFailure = Array.isArray(payload?.failures) ? payload.failures.find((it: any) => it?.message) : null;
      const failureDetails = firstFailure?.message
        ? ` Причина: ${String(firstFailure.message).slice(0, 180)}${firstFailure.status ? ` (${firstFailure.status})` : ''}.`
        : '';
      if (sent > 0 && failed === 0) {
        setPushNotice(`Тест отправлен: ${sent} уведомлений.`);
      } else if (sent > 0) {
        setPushNotice(`Тест отправлен частично: доставлено ${sent}, ошибок ${failed}${removed > 0 ? `, удалено подписок ${removed}` : ''}.${failureDetails}`);
      } else if (failed > 0) {
        throw new Error(`Тест не доставлен: ошибок ${failed}${removed > 0 ? `, удалено подписок ${removed}` : ''}.${failureDetails}`);
      } else {
        setPushNotice('Тест отправлен: 0 уведомлений.');
      }
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Не удалось отправить push-тест.');
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    settingsUiSkipSaveRef.current = true;
    try {
      const raw = localStorage.getItem(settingsUiStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsUiState>;
        const fallbackName = user.name || '';
        const fallbackGoal = user.goal || Goal.MAINTAIN;
        const fallbackTargetWeight = user.targetWeight ? String(user.targetWeight) : '';
        const fallbackAge = user.age ? String(user.age) : '';
        const fallbackHeight = user.height ? String(user.height) : '';
        const fallbackAllergensText = (user.dietary?.allergens || []).join(', ');
        const fallbackIntolerancesText = (user.dietary?.intolerances || []).join(', ');
        const fallbackExcludedFoodsText = (user.dietary?.excludedFoods || []).join(', ');
        const fallbackDietarySeverity = user.dietary?.severity || 'strict';
        const fallbackMedicalRestrictions = user.medicalRestrictions || '';
        const fallbackSystolic = user.bloodPressureSystolic ? String(user.bloodPressureSystolic) : '';
        const fallbackDiastolic = user.bloodPressureDiastolic ? String(user.bloodPressureDiastolic) : '';
        const fallbackPulse = user.restingPulse ? String(user.restingPulse) : '';
        const hasGlucose = typeof user.bloodGlucoseMmolL === 'number' && user.bloodGlucoseMmolL > 0;
        const fallbackGlucose = hasGlucose ? String(user.bloodGlucoseMmolL) : '';
        const fallbackWaist = user.waistCm ? String(user.waistCm) : '';
        const fallbackChest = user.chestCm ? String(user.chestCm) : '';
        const fallbackHips = user.hipsCm ? String(user.hipsCm) : '';

        const nextDraftName = typeof parsed.draftName === 'string' ? parsed.draftName : fallbackName;
        const nextDraftGoal = parsed.draftGoal === Goal.LOSS || parsed.draftGoal === Goal.GAIN || parsed.draftGoal === Goal.MAINTAIN
          ? parsed.draftGoal
          : fallbackGoal;
        const nextDraftTargetWeight = typeof parsed.draftTargetWeight === 'string' ? parsed.draftTargetWeight : fallbackTargetWeight;
        const nextDraftAge = typeof parsed.draftAge === 'string' ? parsed.draftAge : fallbackAge;
        const nextDraftHeight = typeof parsed.draftHeight === 'string' ? parsed.draftHeight : fallbackHeight;
        const nextDraftAllergensText = typeof parsed.draftAllergensText === 'string' ? parsed.draftAllergensText : fallbackAllergensText;
        const nextDraftIntolerancesText = typeof parsed.draftIntolerancesText === 'string' ? parsed.draftIntolerancesText : fallbackIntolerancesText;
        const nextDraftExcludedFoodsText = typeof parsed.draftExcludedFoodsText === 'string' ? parsed.draftExcludedFoodsText : fallbackExcludedFoodsText;
        const nextDraftDietarySeverity = parsed.draftDietarySeverity === 'avoid' ? 'avoid' : fallbackDietarySeverity;
        const nextDraftMedicalRestrictions = typeof parsed.draftMedicalRestrictions === 'string' ? parsed.draftMedicalRestrictions : fallbackMedicalRestrictions;
        const nextDraftBloodPressureSystolic = typeof parsed.draftBloodPressureSystolic === 'string' ? parsed.draftBloodPressureSystolic : fallbackSystolic;
        const nextDraftBloodPressureDiastolic = typeof parsed.draftBloodPressureDiastolic === 'string' ? parsed.draftBloodPressureDiastolic : fallbackDiastolic;
        const nextDraftRestingPulse = typeof parsed.draftRestingPulse === 'string' ? parsed.draftRestingPulse : fallbackPulse;
        const nextDraftBloodGlucoseMmolL = hasGlucose && typeof parsed.draftBloodGlucoseMmolL === 'string'
          ? parsed.draftBloodGlucoseMmolL
          : fallbackGlucose;
        const nextDraftWaistCm = typeof parsed.draftWaistCm === 'string' ? parsed.draftWaistCm : fallbackWaist;
        const nextDraftChestCm = typeof parsed.draftChestCm === 'string' ? parsed.draftChestCm : fallbackChest;
        const nextDraftHipsCm = typeof parsed.draftHipsCm === 'string' ? parsed.draftHipsCm : fallbackHips;
        const nextProgressPhotoNote = typeof parsed.progressPhotoNote === 'string' ? parsed.progressPhotoNote : '';
        const nextAckLoss = typeof parsed.ackLoss === 'boolean' ? parsed.ackLoss : !!user.riskAcknowledgedLoss;
        const nextAckGain = typeof parsed.ackGain === 'boolean' ? parsed.ackGain : !!user.riskAcknowledgedGain;

        setDraftName(nextDraftName);
        setDraftGoal(nextDraftGoal);
        setDraftTargetWeight(nextDraftTargetWeight);
        setDraftAge(nextDraftAge);
        setDraftHeight(nextDraftHeight);
        setDraftAllergensText(nextDraftAllergensText);
        setDraftIntolerancesText(nextDraftIntolerancesText);
        setDraftExcludedFoodsText(nextDraftExcludedFoodsText);
        setDraftDietarySeverity(nextDraftDietarySeverity);
        setDraftMedicalRestrictions(nextDraftMedicalRestrictions);
        setDraftBloodPressureSystolic(nextDraftBloodPressureSystolic);
        setDraftBloodPressureDiastolic(nextDraftBloodPressureDiastolic);
        setDraftRestingPulse(nextDraftRestingPulse);
        setDraftBloodGlucoseMmolL(nextDraftBloodGlucoseMmolL);
        setDraftWaistCm(nextDraftWaistCm);
        setDraftChestCm(nextDraftChestCm);
        setDraftHipsCm(nextDraftHipsCm);
        setProgressPhotoNote(nextProgressPhotoNote);
        setAckLoss(nextAckLoss);
        setAckGain(nextAckGain);
        setProfileDirty(
          nextDraftName !== fallbackName ||
          nextDraftGoal !== fallbackGoal ||
          nextDraftTargetWeight !== fallbackTargetWeight ||
          nextDraftAge !== fallbackAge ||
          nextDraftHeight !== fallbackHeight ||
          nextDraftAllergensText !== fallbackAllergensText ||
          nextDraftIntolerancesText !== fallbackIntolerancesText ||
          nextDraftExcludedFoodsText !== fallbackExcludedFoodsText ||
          nextDraftDietarySeverity !== fallbackDietarySeverity ||
          nextDraftMedicalRestrictions !== fallbackMedicalRestrictions ||
          nextDraftBloodPressureSystolic !== fallbackSystolic ||
          nextDraftBloodPressureDiastolic !== fallbackDiastolic ||
          nextDraftRestingPulse !== fallbackPulse ||
          nextDraftBloodGlucoseMmolL !== fallbackGlucose ||
          nextDraftWaistCm !== fallbackWaist ||
          nextDraftChestCm !== fallbackChest ||
          nextDraftHipsCm !== fallbackHips ||
          nextProgressPhotoNote !== '',
        );
        return;
      }
    } catch {
      // fall through to user snapshot
    }

    setDraftName(user.name || '');
    setDraftGoal(user.goal || Goal.MAINTAIN);
    setDraftTargetWeight(user.targetWeight ? String(user.targetWeight) : '');
    setDraftAge(user.age ? String(user.age) : '');
    setDraftHeight(user.height ? String(user.height) : '');
    setDraftAllergensText((user.dietary?.allergens || []).join(', '));
    setDraftIntolerancesText((user.dietary?.intolerances || []).join(', '));
    setDraftExcludedFoodsText((user.dietary?.excludedFoods || []).join(', '));
    setDraftDietarySeverity(user.dietary?.severity || 'strict');
    setDraftMedicalRestrictions(user.medicalRestrictions || '');
    setDraftBloodPressureSystolic(user.bloodPressureSystolic ? String(user.bloodPressureSystolic) : '');
    setDraftBloodPressureDiastolic(user.bloodPressureDiastolic ? String(user.bloodPressureDiastolic) : '');
    setDraftRestingPulse(user.restingPulse ? String(user.restingPulse) : '');
    setDraftBloodGlucoseMmolL(typeof user.bloodGlucoseMmolL === 'number' && user.bloodGlucoseMmolL > 0 ? String(user.bloodGlucoseMmolL) : '');
    setDraftWaistCm(user.waistCm ? String(user.waistCm) : '');
    setDraftChestCm(user.chestCm ? String(user.chestCm) : '');
    setDraftHipsCm(user.hipsCm ? String(user.hipsCm) : '');
    setProgressPhotoNote('');
    setAckLoss(!!user.riskAcknowledgedLoss);
    setAckGain(!!user.riskAcknowledgedGain);
    setProfileDirty(false);
  }, [settingsUiStorageKey, user?.id, user?.name, user?.goal, user?.targetWeight, user?.age, user?.height, user?.bloodPressureSystolic, user?.bloodPressureDiastolic, user?.restingPulse, user?.bloodGlucoseMmolL, user?.waistCm, user?.chestCm, user?.hipsCm, user?.riskAcknowledgedLoss, user?.riskAcknowledgedGain]);

  const onPickImport = () => fileInputRef.current?.click();

  const onImportFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImportBackup) return;
    onImportBackup(file);
  };

  useEffect(() => {
    setCacheCleared(false);
  }, [user?.id]);

  useEffect(() => {
    if (settingsUiSkipSaveRef.current) {
      settingsUiSkipSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(settingsUiStorageKey, JSON.stringify({
        draftName,
        draftGoal,
        draftTargetWeight,
        draftAge,
        draftHeight,
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
        progressPhotoNote,
        ackLoss,
        ackGain,
      }));
    } catch {
      // Ignore storage failures and keep the form usable.
    }
  }, [
    ackGain,
    ackLoss,
    draftAge,
    draftAllergensText,
    draftBloodPressureDiastolic,
    draftBloodPressureSystolic,
    draftBloodGlucoseMmolL,
    draftDietarySeverity,
    draftChestCm,
    draftExcludedFoodsText,
    draftGoal,
    draftHeight,
    draftHipsCm,
    draftIntolerancesText,
    draftName,
    draftMedicalRestrictions,
    draftRestingPulse,
    draftTargetWeight,
    draftWaistCm,
    progressPhotoNote,
    settingsUiStorageKey,
  ]);

  useEffect(() => {
    if (!uiResetAt) return;
    const id = window.setTimeout(() => setUiResetAt(null), 3000);
    return () => window.clearTimeout(id);
  }, [uiResetAt]);

  useEffect(() => {
    if (!serverSession) {
      setPushSupported(false);
      setPushPermission('unsupported');
      setPushSubscribed(false);
      setPushConfigured(false);
      setPushPublicKey('');
      setPushDeviceCount(0);
      setPushSubscriptionCount(0);
      return;
    }
    void refreshPushStatus();
  }, [serverSession, user?.id]);

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
    const parsedBloodGlucoseMmolL = Number(draftBloodGlucoseMmolL || 0);
    const nextBloodGlucoseMmolL = Number.isFinite(parsedBloodGlucoseMmolL) && parsedBloodGlucoseMmolL > 0
      ? Number(parsedBloodGlucoseMmolL.toFixed(1))
      : null;
    const nextDietary = {
      allergens: normalizeCommaList(draftAllergensText),
      intolerances: normalizeCommaList(draftIntolerancesText),
      excludedFoods: normalizeCommaList(draftExcludedFoodsText),
      severity: draftDietarySeverity,
      notes: user.dietary?.notes || '',
    };
    const parsedWaistCm = Number(draftWaistCm || 0);
    const parsedChestCm = Number(draftChestCm || 0);
    const parsedHipsCm = Number(draftHipsCm || 0);
    const measurementTimestamp = new Date().toISOString();
    if (Number.isFinite(parsedTargetWeight) && parsedTargetWeight > 0 && (parsedTargetWeight < MIN_WEIGHT_KG || parsedTargetWeight > MAX_WEIGHT_KG)) {
      setProfileValidationError(`Желаемый вес должен быть в диапазоне ${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG} кг.`);
      return;
    }
    if (Number.isFinite(parsedHeight) && parsedHeight > 0 && (parsedHeight < MIN_HEIGHT_CM || parsedHeight > MAX_HEIGHT_CM)) {
      setProfileValidationError(`Рост должен быть в диапазоне ${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM} см.`);
      return;
    }
    if (Number.isFinite(parsedTargetWeight) && parsedTargetWeight > 0 && Number.isFinite(parsedHeight) && parsedHeight > 0) {
      const bmi = parsedTargetWeight / Math.pow(parsedHeight / 100, 2);
      if (bmi < MIN_BMI || bmi > MAX_BMI) {
        setProfileValidationError('Проверьте сочетание желаемого веса и роста: оно выглядит нереалистично.');
        return;
      }
    }

    const hasMeasurement =
      (Number.isFinite(parsedBloodPressureSystolic) && parsedBloodPressureSystolic > 0) ||
      (Number.isFinite(parsedBloodPressureDiastolic) && parsedBloodPressureDiastolic > 0) ||
      (Number.isFinite(parsedRestingPulse) && parsedRestingPulse > 0) ||
      (Number.isFinite(parsedBloodGlucoseMmolL) && parsedBloodGlucoseMmolL > 0) ||
      (Number.isFinite(parsedWaistCm) && parsedWaistCm > 0) ||
      (Number.isFinite(parsedChestCm) && parsedChestCm > 0) ||
      (Number.isFinite(parsedHipsCm) && parsedHipsCm > 0);

    const patch: Partial<UserProfile> = {
      name: safeName,
      goal: draftGoal,
      targetWeight: Number.isFinite(parsedTargetWeight) && parsedTargetWeight > 0 ? parsedTargetWeight : user.targetWeight,
      age: Number.isFinite(parsedAge) && parsedAge > 0 ? Math.round(parsedAge) : user.age,
      height: Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : user.height,
      bloodPressureSystolic: Number.isFinite(parsedBloodPressureSystolic) && parsedBloodPressureSystolic > 0 ? Math.round(parsedBloodPressureSystolic) : user.bloodPressureSystolic,
      bloodPressureDiastolic: Number.isFinite(parsedBloodPressureDiastolic) && parsedBloodPressureDiastolic > 0 ? Math.round(parsedBloodPressureDiastolic) : user.bloodPressureDiastolic,
      bloodPressureMeasuredAt: Number.isFinite(parsedBloodPressureSystolic) && parsedBloodPressureSystolic > 0 && Number.isFinite(parsedBloodPressureDiastolic) && parsedBloodPressureDiastolic > 0 ? measurementTimestamp : user.bloodPressureMeasuredAt,
      bloodGlucoseMmolL: nextBloodGlucoseMmolL as any,
      bloodGlucoseMeasuredAt: (nextBloodGlucoseMmolL !== null ? measurementTimestamp : null) as any,
      waistCm: Number.isFinite(parsedWaistCm) && parsedWaistCm > 0 ? Math.round(parsedWaistCm) : user.waistCm,
      chestCm: Number.isFinite(parsedChestCm) && parsedChestCm > 0 ? Math.round(parsedChestCm) : user.chestCm,
      hipsCm: Number.isFinite(parsedHipsCm) && parsedHipsCm > 0 ? Math.round(parsedHipsCm) : user.hipsCm,
      bodyMeasurementsMeasuredAt: (Number.isFinite(parsedWaistCm) && parsedWaistCm > 0) || (Number.isFinite(parsedChestCm) && parsedChestCm > 0) || (Number.isFinite(parsedHipsCm) && parsedHipsCm > 0) ? measurementTimestamp : user.bodyMeasurementsMeasuredAt,
      restingPulse: Number.isFinite(parsedRestingPulse) && parsedRestingPulse > 0 ? Math.round(parsedRestingPulse) : user.restingPulse,
      restingPulseMeasuredAt: Number.isFinite(parsedRestingPulse) && parsedRestingPulse > 0 ? measurementTimestamp : user.restingPulseMeasuredAt,
      medicalRestrictions: draftMedicalRestrictions.trim(),
      dietary: nextDietary,
      profileDetailsCompleted: true,
    };

    if (hasMeasurement) {
      const history = user.measurementsHistory || [];
      const entry = {
        date: measurementTimestamp,
        weight: user.weight,
        bloodPressureSystolic: Number.isFinite(parsedBloodPressureSystolic) && parsedBloodPressureSystolic > 0 ? Math.round(parsedBloodPressureSystolic) : undefined,
        bloodPressureDiastolic: Number.isFinite(parsedBloodPressureDiastolic) && parsedBloodPressureDiastolic > 0 ? Math.round(parsedBloodPressureDiastolic) : undefined,
        bloodGlucoseMmolL: nextBloodGlucoseMmolL === null ? undefined : nextBloodGlucoseMmolL,
        waistCm: Number.isFinite(parsedWaistCm) && parsedWaistCm > 0 ? Math.round(parsedWaistCm) : undefined,
        chestCm: Number.isFinite(parsedChestCm) && parsedChestCm > 0 ? Math.round(parsedChestCm) : undefined,
        hipsCm: Number.isFinite(parsedHipsCm) && parsedHipsCm > 0 ? Math.round(parsedHipsCm) : undefined,
        restingPulse: Number.isFinite(parsedRestingPulse) && parsedRestingPulse > 0 ? Math.round(parsedRestingPulse) : undefined,
      };
      patch.measurementsHistory = [entry, ...history].slice(0, 30);
    }

    if (serverSession && onPatchUser) {
      await onPatchUser(patch);
    } else if (onChangeUser) {
      onChangeUser({ ...user, ...patch });
    }
    setProfileValidationError(null);
    setProfileDirty(false);
  };

  const saveProgressPhotos = async (nextPhotos: ProgressPhoto[]) => {
    if (!user) return;
    const patch: Partial<UserProfile> = { progressPhotos: nextPhotos.slice(0, 12) };
    if (serverSession && onPatchUser) {
      await onPatchUser(patch);
    } else if (onChangeUser) {
      onChangeUser({ ...user, ...patch });
    }
  };

  const addProgressPhoto = async (file: File) => {
    if (!user) return;
    setProgressPhotoBusy(true);
    setProgressPhotoError(null);
    try {
      const { photo, thumb } = await compressProgressPhoto(file);
      const next: ProgressPhoto[] = [
        {
          date: new Date().toISOString(),
          photo,
          thumb,
          note: progressPhotoNote.trim() || undefined,
        },
        ...(user.progressPhotos || []),
      ].slice(0, 12);
      await saveProgressPhotos(next);
      setProgressPhotoNote('');
      if (progressPhotoInputRef.current) progressPhotoInputRef.current.value = '';
    } catch (e: any) {
      setProgressPhotoError(e?.message || 'Не удалось добавить фото');
    } finally {
      setProgressPhotoBusy(false);
    }
  };

  const removeProgressPhoto = async (index: number) => {
    if (!user) return;
    const next = (user.progressPhotos || []).filter((_, i) => i !== index);
    await saveProgressPhotos(next);
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
                <div className="mb-3 rounded-[1.1rem] border border-slate-800 bg-slate-950/45 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-slate-100 font-black">Выйти из аккаунта</div>
                      <div className="text-slate-400 text-xs mt-1">Завершить текущую сессию и вернуться на экран входа.</div>
                    </div>
                    <button
                      onClick={() => void onServerLogout?.()}
                      className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-[1rem] border border-slate-800 bg-slate-950/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all disabled:opacity-50"
                      disabled={!onServerLogout}
                      aria-label="Выйти из аккаунта"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {latestMeasurement && (
                  <div className="mb-3 rounded-[1rem] border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                    <div className="font-black text-slate-200 uppercase tracking-widest text-[10px]">Последний замер</div>
                    <div className="mt-1">
                      {latestMeasurement.bloodPressureSystolic && latestMeasurement.bloodPressureDiastolic
                        ? `${latestMeasurement.bloodPressureSystolic}/${latestMeasurement.bloodPressureDiastolic} мм рт. ст.`
                        : 'Давление не указано'}
                      {latestMeasurement.restingPulse ? ` · Пульс ${latestMeasurement.restingPulse} уд/мин` : ''}
                      {typeof latestMeasurement.bloodGlucoseMmolL === 'number' ? ` · Сахар ${formatBloodGlucose(latestMeasurement.bloodGlucoseMmolL)}` : ''}
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
                        onChange={(e) => { setDraftTargetWeight(e.target.value); setProfileDirty(true); setProfileValidationError(null); }}
                        inputMode="decimal"
                        min={MIN_WEIGHT_KG}
                        max={MAX_WEIGHT_KG}
                        step="0.1"
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
                        onChange={(e) => { setDraftHeight(e.target.value); setProfileDirty(true); setProfileValidationError(null); }}
                        inputMode="numeric"
                        min={MIN_HEIGHT_CM}
                        max={MAX_HEIGHT_CM}
                        className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                        placeholder="см"
                      />
                    </label>
                  </div>

                  <ProfileDetailsSection
                    draftAllergensText={draftAllergensText}
                    draftIntolerancesText={draftIntolerancesText}
                    draftExcludedFoodsText={draftExcludedFoodsText}
                    draftDietarySeverity={draftDietarySeverity}
                    draftMedicalRestrictions={draftMedicalRestrictions}
                    draftBloodPressureSystolic={draftBloodPressureSystolic}
                    draftBloodPressureDiastolic={draftBloodPressureDiastolic}
                    draftRestingPulse={draftRestingPulse}
                    draftBloodGlucoseMmolL={draftBloodGlucoseMmolL}
                    draftWaistCm={draftWaistCm}
                    draftChestCm={draftChestCm}
                    draftHipsCm={draftHipsCm}
                    profileDirty={profileDirty}
                    profileValidationError={profileValidationError}
                    profileSummary={profileSummary}
                    onProfileSave={saveProfileDraft}
                    onAllergensChange={(value) => { setDraftAllergensText(value); setProfileDirty(true); }}
                    onIntolerancesChange={(value) => { setDraftIntolerancesText(value); setProfileDirty(true); }}
                    onExcludedFoodsChange={(value) => { setDraftExcludedFoodsText(value); setProfileDirty(true); }}
                    onDietarySeverityChange={(value) => { setDraftDietarySeverity(value); setProfileDirty(true); }}
                    onMedicalRestrictionsChange={(value) => { setDraftMedicalRestrictions(value); setProfileDirty(true); }}
                    onBloodPressureSystolicChange={(value) => { setDraftBloodPressureSystolic(value); setProfileDirty(true); }}
                    onBloodPressureDiastolicChange={(value) => { setDraftBloodPressureDiastolic(value); setProfileDirty(true); }}
                    onRestingPulseChange={(value) => { setDraftRestingPulse(value); setProfileDirty(true); }}
                    onBloodGlucoseChange={(value) => { setDraftBloodGlucoseMmolL(value); setProfileDirty(true); }}
                    onWaistChange={(value) => { setDraftWaistCm(value); setProfileDirty(true); }}
                    onChestChange={(value) => { setDraftChestCm(value); setProfileDirty(true); }}
                    onHipsChange={(value) => { setDraftHipsCm(value); setProfileDirty(true); }}
                  />
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">Фото прогресса</div>
                    <div className="text-slate-100 font-black">История визуальных замеров</div>
                    <div className="text-slate-500 text-sm mt-2">Загружайте фото с телефона или камеры. Мы храним миниатюры, чтобы не забивать память.</div>
                  </div>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center border bg-indigo-500/10 border-indigo-500/30 text-indigo-300">
                    <Camera className="w-5 h-5" />
                  </div>
                </div>

                <input
                  ref={progressPhotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void addProgressPhoto(file);
                  }}
                />

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <input
                    value={progressPhotoNote}
                    onChange={(e) => setProgressPhotoNote(e.target.value)}
                    className="w-full px-4 py-3 rounded-[1rem] bg-slate-950/60 border border-slate-700 text-slate-100 font-bold"
                    placeholder="Подпись к фото: например, месяц 1"
                  />
                  <button
                    type="button"
                    onClick={() => progressPhotoInputRef.current?.click()}
                    disabled={progressPhotoBusy}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[1rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {progressPhotoBusy ? 'Загрузка…' : 'Добавить фото'}
                  </button>
                </div>

                {progressPhotoError && (
                  <div className="mt-3 rounded-[1rem] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 font-semibold">
                    {progressPhotoError}
                  </div>
                )}

                {latestProgressPhoto && (
                  <div className="mt-4 rounded-[1rem] border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Последнее фото</div>
                    <div className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-3 items-center">
                      <img src={latestProgressPhoto.thumb} alt="Последнее фото прогресса" className="w-[72px] h-[72px] rounded-[1rem] object-cover border border-slate-800" />
                      <div className="min-w-0">
                        <div className="text-slate-100 font-black truncate">{latestProgressPhoto.note || 'Без подписи'}</div>
                        <div className="text-slate-500 text-xs mt-1">{new Date(latestProgressPhoto.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Галерея ({progressPhotos.length})</div>
                  {progressPhotos.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {progressPhotos.slice(0, 8).map((photo, index) => (
                        <div key={`${photo.date}-${index}`} className="relative group rounded-[1rem] overflow-hidden border border-slate-800 bg-slate-950">
                          <img src={photo.thumb} alt={photo.note || `Фото прогресса ${index + 1}`} className="w-full aspect-square object-cover" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                            <div className="text-[10px] font-black text-white truncate">{photo.note || 'Фото прогресса'}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeProgressPhoto(index)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all w-8 h-8 rounded-full bg-black/70 border border-white/10 text-white flex items-center justify-center"
                            aria-label="Удалить фото"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[1rem] border border-dashed border-slate-800 bg-slate-950/30 px-4 py-6 text-slate-500 text-sm">
                      Пока нет фото прогресса. Добавьте первое, чтобы начать визуальный архив.
                    </div>
                  )}
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

              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">Push-уведомления</div>
                    <div className="text-slate-100 font-black">
                      {pushPermission === 'granted'
                        ? 'Разрешение выдано'
                        : pushPermission === 'denied'
                          ? 'Уведомления заблокированы'
                          : pushSupported
                            ? 'Можно включить уведомления'
                            : 'Этот браузер не поддерживает push'}
                    </div>
                    <div className="text-slate-500 text-sm mt-2">
                      {pushConfigured
                        ? 'Уведомления приходят на это устройство и на все остальные устройства аккаунта, где пользователь включил push.'
                        : 'Push-сервер ещё не настроен: нужны VAPID ключи в переменных Cloudflare.'}
                    </div>
                  </div>
                  <div className={["w-11 h-11 rounded-2xl flex items-center justify-center border",
                    pushPermission === 'denied'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : pushSubscribed
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                  ].join(' ')}>
                    <Bell className="w-5 h-5" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Разрешение</div>
                    <div className="mt-2 text-slate-100 font-black text-sm">{pushPermission}</div>
                  </div>
                  <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Устройства</div>
                    <div className="mt-2 text-slate-100 font-black text-sm tabular-nums">{pushDeviceCount}</div>
                  </div>
                  <div className="rounded-[1.1rem] border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Подписок</div>
                    <div className="mt-2 text-slate-100 font-black text-sm tabular-nums">{pushSubscriptionCount}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 mt-4">
                  <div className="rounded-[1rem] border border-slate-800 bg-slate-950/60 p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Это устройство</div>
                    <div className="mt-2 text-slate-100 font-black">{getPushDeviceLabel()}</div>
                    <div className="mt-2 text-xs text-slate-500 leading-5">
                      {getPushDeviceHelp()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 min-w-[220px]">
                    <button
                      type="button"
                      onClick={() => void subscribeToPush()}
                      disabled={pushBusy || !pushSupported || !pushConfigured || pushPermission === 'denied' || !serverSession}
                      className="inline-flex items-center justify-center gap-2 px-4 py-4 rounded-[1rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all disabled:opacity-50"
                    >
                      <Bell className="w-4 h-4" />
                      {pushBusy ? 'Обновляем…' : pushSubscribed ? 'Переподключить push' : 'Включить push'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendTestPush()}
                      disabled={pushBusy || !pushSupported || !serverSession}
                      className="inline-flex items-center justify-center gap-2 px-4 py-4 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:border-indigo-500/30 text-slate-100 font-black transition-all disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      Отправить тест
                    </button>
                    <button
                      type="button"
                      onClick={() => void unsubscribeFromPush()}
                      disabled={pushBusy || !pushSupported || !pushSubscribed || !serverSession}
                      className="inline-flex items-center justify-center gap-2 px-4 py-4 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:border-rose-500/30 text-slate-200 font-black transition-all disabled:opacity-50"
                    >
                      <BellOff className="w-4 h-4" />
                      Отключить на этом устройстве
                    </button>
                  </div>
                </div>

                {pushNotice && (
                  <div className="mt-3 rounded-[1rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    {pushNotice}
                  </div>
                )}

                {pushError && (
                  <div className="mt-3 rounded-[1rem] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {pushError}
                  </div>
                )}

                {pushLastDeliveryError && (
                  <div className="mt-3 rounded-[1rem] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Последняя ошибка доставки: {pushLastDeliveryError}
                  </div>
                )}
              </div>

              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">Смарт-часы</div>
                    <div className="text-slate-100 font-black">{wearableSummary}</div>
                    <div className="text-slate-500 text-sm mt-2">
                      {user?.wearableProvider && user.wearableEnabled !== false
                        ? (user.wearableProvider === 'apple_health'
                            ? 'Apple Health подключён. iPhone-клиент может отправлять HealthKit-снимки в FitFocus через /api/wearable/sync.'
                            : 'Источник подключён и может передавать шаги, сон и пульс.')
                        : 'Выберите Apple Health, Google Fit, Fitbit или Garmin для синхронизации.'}
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center border bg-sky-500/10 border-sky-500/30 text-sky-300">
                    <Watch className="w-5 h-5" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 mt-4">
                  {wearableOptions.map((option) => {
                    const selected = user?.wearableProvider === option.value && user.wearableEnabled !== false;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void syncWearableProvider(option.value)}
                        disabled={!onPatchUser || wearableBusy !== null}
                        className={[
                          'w-full rounded-[1.25rem] border px-4 py-4 text-left transition-all',
                          selected ? 'border-sky-500/40 bg-sky-500/10' : 'border-slate-800 bg-slate-950/30 hover:border-slate-700',
                          wearableBusy !== null ? 'opacity-60 cursor-wait' : '',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-slate-100 font-black">{option.label}</div>
                            <div className="text-slate-500 text-sm mt-1">{option.note}</div>
                          </div>
                          <div className={[
                            'text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border',
                            selected ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-900 text-slate-500',
                          ].join(' ')}>
                            {selected ? 'подключено' : 'выбрать'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-[1.25rem] border border-slate-800 bg-slate-950/35 p-4 mt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">iPhone bridge</div>
                      <div className="mt-1 text-slate-100 font-black">Apple Health как мост для Mi Band и Apple Watch</div>
                      <div className="mt-2 text-sm text-slate-400">
                        Если Mi Fitness или Apple Watch уже пишут шаги, сон и пульс в Apple Health, iPhone-бридж заберёт эти данные и отправит их в FitFocus.
                      </div>
                    </div>
                    <div className="w-11 h-11 rounded-2xl border border-sky-500/20 bg-sky-500/10 flex items-center justify-center text-sky-300">
                      <Smartphone className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
                    <div className="rounded-[1rem] border border-slate-800 bg-slate-950/60 p-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Base URL для bridge</div>
                      <div className="mt-2 text-slate-100 font-black break-all">{bridgeBaseUrl}</div>
                      <div className="mt-2 text-xs text-slate-500">Скопируйте этот адрес в iPhone bridge, чтобы отправлять HealthKit-снимки прямо в текущий FitFocus-стенд.</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void generateMobileToken()}
                      disabled={!serverSession || mobileTokenBusy}
                      className="inline-flex items-center justify-center gap-2 px-4 py-4 rounded-[1rem] bg-sky-600 hover:bg-sky-500 text-white font-black transition-all disabled:opacity-50"
                    >
                      <KeyRound className="w-4 h-4" />
                      {mobileTokenBusy ? 'Генерируем…' : 'Сгенерировать token'}
                    </button>
                  </div>

                  {mobileTokenError && (
                    <div className="mt-3 rounded-[1rem] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {mobileTokenError}
                    </div>
                  )}

                  {mobileTokenValue && (
                    <div className="mt-3 rounded-[1rem] border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mobile token</div>
                          <div className="mt-2 text-sm text-slate-100 break-all font-mono">{mobileTokenValue}</div>
                          <div className="mt-2 text-xs text-slate-500">Срок: {formatMobileTokenExpiry(mobileTokenExpiresAt)}</div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => void copyMobileToken()}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-[0.85rem] border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-200 font-black transition-all"
                          >
                            <Copy className="w-4 h-4" />
                            {mobileTokenCopiedAt ? 'Скопировано' : 'Копировать'}
                          </button>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">
                            {mobileTokenCopiedAt ? 'Токен уже в буфере' : 'Вставьте в bridge на iPhone'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                {bridgeSetupLink && (
                  <div className="mt-3 rounded-[1rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-200/80">One-tap setup</div>
                          <div className="mt-1 text-slate-100 font-black">Откройте bridge одной ссылкой</div>
                          <div className="mt-2 text-sm text-emerald-100/80">
                            Эта ссылка подставит base URL и token в iPhone bridge автоматически. После копирования отправьте её на iPhone и откройте в приложении FitFocus Bridge.
                          </div>
                        </div>
                        <div className="w-11 h-11 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 flex items-center justify-center text-emerald-200">
                          <Link2 className="w-5 h-5" />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3 items-start">
                        <div className="rounded-[1rem] border border-emerald-500/20 bg-slate-950/60 p-4 flex items-center justify-center">
                          <div className="rounded-[0.85rem] bg-white p-3">
                            <QRCodeSVG
                              value={bridgeSetupLink}
                              size={156}
                              level="M"
                              includeMargin
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-[0.9rem] border border-emerald-500/20 bg-slate-950/50 px-3 py-2 text-xs font-mono text-emerald-100 break-all">
                            {bridgeSetupLink}
                          </div>
                          <div className="text-xs text-emerald-100/75 leading-5">
                            Наведите камеру iPhone на QR-код или откройте ссылку вручную. Bridge подставит URL и token автоматически.
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void copyBridgeSetup()}
                          className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black transition-all"
                        >
                          <Copy className="w-4 h-4" />
                          {bridgeSetupCopiedAt ? 'Ссылка скопирована' : 'Копировать setup link'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyMobileToken()}
                          className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] border border-emerald-500/20 bg-slate-950/40 hover:bg-slate-900 text-emerald-100 font-black transition-all"
                        >
                          <KeyRound className="w-4 h-4" />
                          Копировать token отдельно
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <div className="rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Последний sync</div>
                    <div className="mt-2 text-slate-100 font-black text-sm">{formatIsoSyncTs(user?.wearableLastSyncAt)}</div>
                  </div>
                  <div className="rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Шаги</div>
                    <div className="mt-2 text-slate-100 font-black text-sm tabular-nums">{typeof user?.wearableStepsToday === 'number' ? user.wearableStepsToday.toLocaleString('ru-RU') : '—'}</div>
                  </div>
                  <div className="rounded-[1.25rem] border border-slate-800 bg-slate-950/40 p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Сон</div>
                    <div className="mt-2 text-slate-100 font-black text-sm tabular-nums">{typeof user?.wearableSleepHoursLastNight === 'number' ? `${user.wearableSleepHoursLastNight.toFixed(1)} ч` : '—'}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onSyncNow?.()}
                    disabled={!serverSession || !onSyncNow}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] bg-sky-600 hover:bg-sky-500 text-white font-black transition-all disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Синхронизировать
                  </button>
                  <button
                    type="button"
                    onClick={() => void disconnectWearable()}
                    disabled={!user?.wearableProvider || wearableBusy !== null}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-[1rem] border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-300 font-black transition-all disabled:opacity-50"
                  >
                    Отключить часы
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

        <Card title="Сервис" icon={<RefreshCw className="w-4 h-4" />}>
          <div className="space-y-4 text-left">
            <div className="text-slate-400 text-sm font-semibold">
              Здесь собраны действия обслуживания: AI-кэш, UI-состояние и резервные копии.
              {autosaveEnabled ? (
                <span className="text-emerald-200 font-bold"> Автосейв включён.</span>
              ) : (
                <span className="text-slate-500"> Автосейв не включён.</span>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                onClick={onClearAiCache}
                className="w-full p-4 rounded-[1.25rem] border border-slate-800 bg-slate-950/30 hover:border-indigo-500/30 transition-all text-left"
              >
                <div className="text-slate-100 font-black">Сбросить AI-кэш</div>
                <div className="text-slate-400 text-sm mt-1">Очистит кэш ответов, статусы и паузу Gemini.</div>
              </button>

              <button
                type="button"
                onClick={resetUiState}
                className="w-full p-4 rounded-[1.25rem] border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all text-left"
              >
                <div className="text-amber-100 font-black">Сбросить UI</div>
                <div className="text-amber-200/80 text-sm mt-1">Вернёт экраны к стандартному виду без удаления профиля.</div>
              </button>
            </div>

            {cacheCleared && (
              <div className="text-emerald-200 text-sm font-bold">
                Кэш сброшен.
              </div>
            )}

            {uiResetAt && (
              <div className="text-emerald-200 text-sm font-bold">
                UI сброшен. Все экраны вернулись к стандартному виду.
              </div>
            )}

            <div className="text-slate-400 text-sm font-semibold pt-2 border-t border-slate-800/70">
              Для тестов и переноса между браузерами экспортируйте/импортируйте данные в JSON.
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
