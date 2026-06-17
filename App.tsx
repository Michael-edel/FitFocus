import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import CameraCapture from './ui/components/CameraCapture';
import clsx from 'clsx';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from 'recharts';
import { 
  Activity, 
  Utensils, 
  Camera, 
  Plus,
  Search,
  Settings,
  ChefHat,
  Dumbbell,
  Heart,
  Sparkles,
  ChevronRight,
  Scale,
  TrendingUp,
  CheckCircle2,
  X,
  Award,
  BookOpen,
  Droplets,
  Footprints,
  Leaf,
  Moon,
  Flame,
  LogIn,
  Loader2,
  CheckCircle,
  ChevronLeft,
  Crown,
  Download,
  CheckSquare,
  Users,
  BrainCircuit,
  Brain,
  ShieldCheck,
  MoreHorizontal,
  AlertTriangle,
  Info,
  RefreshCcw,
  Trash2,
  MessageSquareText,
  Send,
  MessageCircle,
  ChevronDown,
  History
} from 'lucide-react';
// FIX: Added getWeeklyIntelligenceInterpretation to the import list from geminiService
import { analyzeFoodPhoto, getCoachAdvice, generatePersonalPlan, generatePlateauExplanation, readAiStatus, AiLastStatus, allowAiRetryNow, getLastAiAction, setLastAiAction, getWeeklyIntelligenceInterpretation, callAiCouncil, generateWeeklyMenu, generateFamilyWeeklyMenu } from './geminiService';
import { analyzeImageQuality } from './services/imageQuality';
import { computeConfidence, confidenceLabel, shouldShowImprove, shouldSuggestPortionAdjust } from './services/aiConfidence';
import { analyzeFoodPhotoEnhanced } from './geminiService';
import { COURSE_LIBRARY } from './lessons';
import { Gender, Goal, UserProfile, FoodItem, FoodEntry, MealType, ActivityLevel, CoachTask, UserHabit, CourseLesson, UsageStats, LessonQuizOption, FoodInsight, AppSettings, FavoriteRecipe, TariffPlan, AIPlan, AppTheme, CouncilResponse } from './types';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS } from './constants';
import { calculateBMR, calculateTDEE, calculateDailyTargets } from './profileMath';
import { toggleHabit, calculateStreak, getTodayKey } from './habits';
import { addWeight, weightDelta } from './weight';
import { createTask } from './coach';
import { detectPlateau } from './plateau';
import { generateWeeklyIntelligence } from './weeklyIntelligence';
import { ensureWeeklyReportWithAI, loadWeeklyReports, WeeklyStoredReport } from './weeklyAutoEngine';
import { WeightTrendChart, HabitStreaksCard } from './charts';
import FoodInsightCard from './FoodInsightCard';
import ShoppingListCard from './ShoppingListCard';
import PlansScreen from './PlansScreen';
import { usePaywall } from './usePaywall';
import { setDevPlanOverride } from './money';
import SettingsScreen from './SettingsScreen';
import AdminScreen from './AdminScreen';
import {
  applyBackupPayload,
  createBackupPayload,
  downloadJson,
  getSavedBackupHandle,
  chooseAndSaveBackupHandle,
  supportsFileSystemAccessApi,
  writeBackupToHandle,
} from './backup';
import RecipesScreen from './RecipesScreen';
import WorkoutsScreen from './WorkoutsScreen';

// Compile-time fallbacks injected by Vite (see vite.config.ts)
declare const __VITE_GOOGLE_CLIENT_ID_LOCAL__: string | undefined;
declare const __VITE_GOOGLE_CLIENT_ID_PROD__: string | undefined;



// --- Google Sign-In (GIS) helper (client-side only) ---
declare global {
  interface Window {
    google?: any;
  }
}

// NOTE:
// Не держим client_id как top-level const.
// При HMR/fast-refresh или при старте dev-сервера до появления env
// могло "залипнуть" состояние с ошибкой. Читаем env внутри эффекта.
const getGoogleClientId = () => {
  // Vite normally provides import.meta.env, but in some setups (custom index.html/importmaps/CSP)
  // it may be empty. So we support a compile-time fallback via __VITE_* constants injected
  // in vite.config.ts.
  const envAny = (import.meta as any)?.env || {};
  const local =
    envAny.VITE_GOOGLE_CLIENT_ID_LOCAL ||
    __VITE_GOOGLE_CLIENT_ID_LOCAL__ ||
    "";
  const prod =
    envAny.VITE_GOOGLE_CLIENT_ID_PROD ||
    __VITE_GOOGLE_CLIENT_ID_PROD__ ||
    "";

  // Auto-pick based on origin so the same bundle works in dev and prod.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const isLocal =
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1") ||
    origin.startsWith("http://0.0.0.0");

  const picked = (isLocal ? local : prod).trim();
  if (!picked || picked.includes('CHANGE_ME')) return '';
  return picked;
};
function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window"));
    if (window.google?.accounts?.id) return resolve();

    const existing = document.querySelector('script[data-gis="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS load error")));
      return;
    }

    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.dataset.gis = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS load error"));
    document.head.appendChild(s);
  });
}

function GoogleSignInButton({ inviteCode }: { onAuthed: () => void; inviteCode?: string; width?: number; size?: "large" | "medium" | "small"; text?: "signin_with" | "continue_with" }) {
  // Why this approach:
  // Google Identity Services now relies on FedCM in Chromium and is not supported/reliable in all browsers.
  // Some users will have FedCM disabled by corporate policies, flags, privacy extensions, etc.
  // That produces "identity-credentials-get" errors and lost sign-ins.
  // To work for *all* clients with no browser tweaking, we use a backend-driven OAuth2 redirect flow.
  const [err, setErr] = React.useState<string | null>(null);

  const handleClick = React.useCallback(() => {
    setErr(null);
    const params = new URLSearchParams();
    if (inviteCode) params.set("invite", inviteCode);
    params.set("redirect", window.location.origin);
    window.location.href = `/api/auth/google/start?${params.toString()}`;
  }, [inviteCode]);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-2 rounded-full px-4 py-2 border border-white/15 bg-white/5 hover:bg-white/10 active:bg-white/15 text-sm text-white/90"
      >
        <img src="/google-g.svg" alt="Google" className="w-4 h-4" />
        <span>Google профиль</span>
      </button>

      {err ? <div className="text-xs text-red-400 text-center max-w-[340px]">{err}</div> : null}
    </div>
  );
}
// --- end Google Sign-In helper ---


// NOTE: PDF генерация вынесена в ./pdf (см. pdf/font.ts). Это решает "кракозябры" (кириллица) и упрощает поддержку.

type FastLogItem = Omit<FoodItem, 'id' | 'timestamp'>;

const MAX_DIARY_ITEMS = 500;
const MAX_HISTORY_ITEMS = 500;

/**
 * Безопасное сохранение в localStorage с обработкой переполнения
 */
const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    enqueueRemoteKVWrite(key, value);
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('LocalStorage quota exceeded. Consider clearing old data.');
    } else {
      console.warn('LocalStorage write failed:', e);
    }
  }
};

// --- Server-driven persistence (D1 remote) ---
// We keep localStorage as a fast cache, but D1 is the source-of-truth.
// Any key under fitfocus_data_* is mirrored to /api/state.
type KVItem = { key: string; value: string };
const __kvQueue: KVItem[] = [];
let __kvTimer: number | null = null;

function enqueueRemoteKVWrite(key: string, value: string) {
  if (!key.startsWith('fitfocus_data_') && !key.startsWith('fitfocus_council_history_')) return;
  __kvQueue.push({ key, value });

  if (__kvTimer != null) return;
  __kvTimer = window.setTimeout(async () => {
    __kvTimer = null;
    const batch = __kvQueue.splice(0, __kvQueue.length);
    if (!batch.length) return;
    try {
      await fetch('/api/state', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batch }),
      });
    } catch {
      // ignore network errors; will retry on next write
    }
  }, 400);
}


// Try to free localStorage space if quota is exceeded (remove heavy fields, keep newest history)
const evictLargeLocalStorage = () => {
  try {
    const keys = Object.keys(localStorage);

    // 1) Trim council chat history
    for (const k of keys) {
      if (!k.startsWith('fitfocus_council_history_')) continue;
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(arr) && arr.length > 30) {
          localStorage.setItem(k, JSON.stringify(arr.slice(-30)));
        }
      } catch {
        // ignore
      }
    }

    // 2) Remove full-size photos from diary (keep thumbnail only)
    for (const k of keys) {
      if (!k.startsWith('fitfocus_data_') || !k.endsWith('_diary')) continue;
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (!Array.isArray(arr)) continue;
        let changed = false;
        const next = arr.map((it: any) => {
          if (!it || typeof it !== 'object') return it;
          const copy = { ...it };
          if (typeof copy.photo === 'string' && copy.photo.length > 0) {
            delete copy.photo;
            changed = true;
          }
          if (typeof copy.photoThumb === 'string' && copy.photoThumb.length > 120_000) {
            // thumbnails should be small; if not, drop it
            delete copy.photoThumb;
            changed = true;
          }
          return copy;
        });
        if (changed) {
          localStorage.setItem(k, JSON.stringify(next));
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
};



// --- Image helpers: resize/crop/compress food photos to reduce storage ---

type CompressedPhoto = { dataUrl: string; thumbUrl: string; base64: string };

const loadImageElement = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
};

const compressFoodPhoto = async (
  file: File,
  opts?: { maxSide?: number; quality?: number; thumbSize?: number }
): Promise<CompressedPhoto> => {
  // iOS часто отдаёт HEIC/HEIF. Конвертируем в JPEG в браузере, чтобы дальше работать через canvas.
  const lowerName = (file?.name || '').toLowerCase();
  const isHeic = (file?.type || '').includes('heic') || (file?.type || '').includes('heif') || lowerName.endsWith('.heic') || lowerName.endsWith('.heif');
  if (isHeic) {
    try {
      const mod: any = await import('heic2any');
      const heic2any = mod?.default ?? mod;
      const converted: any = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      const blob: Blob = Array.isArray(converted) ? converted[0] : converted;
      const nextName = lowerName.replace(/\.(heic|heif)$/i, '.jpg') || 'photo.jpg';
      file = new File([blob], nextName, { type: 'image/jpeg' });
    } catch (e) {
      // Если конвертация недоступна, подскажем пользователю альтернативу.
      alert('Фото в формате HEIC/HEIF. Пожалуйста, выберите JPG/PNG или нажмите «Снять» (камера), чтобы приложение само сделало JPEG.');
      throw e;
    }
  }
  const maxSide = opts?.maxSide ?? 768;
  const quality = opts?.quality ?? 0.72;
  const thumbSize = opts?.thumbSize ?? 140;

  // Prefer createImageBitmap (fast), but fallback for environments where it fails (some Android tablets / WebViews)
  let w0 = 0;
  let h0 = 0;
  const canvasSrc = document.createElement('canvas');
  const ctxSrc = canvasSrc.getContext('2d');
  if (!ctxSrc) throw new Error('No canvas context');

  try {
    const bitmap = await createImageBitmap(file);
    w0 = bitmap.width;
    h0 = bitmap.height;
    canvasSrc.width = w0;
    canvasSrc.height = h0;
    ctxSrc.drawImage(bitmap, 0, 0);
    // @ts-ignore - close exists in modern browsers
    bitmap.close?.();
  } catch {
    const img = await loadImageElement(file);
    w0 = img.naturalWidth || img.width;
    h0 = img.naturalHeight || img.height;
    canvasSrc.width = w0;
    canvasSrc.height = h0;
    ctxSrc.drawImage(img, 0, 0);
  }

  // Resize keeping aspect
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  ctx.drawImage(canvasSrc, 0, 0, w0, h0, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);

  // Thumb: center-crop square from the resized image
  const thumb = document.createElement('canvas');
  thumb.width = thumbSize;
  thumb.height = thumbSize;
  const tctx = thumb.getContext('2d');
  if (!tctx) throw new Error('No canvas context');
  const side = Math.min(w, h);
  const sx = Math.floor((w - side) / 2);
  const sy = Math.floor((h - side) / 2);
  tctx.drawImage(canvas, sx, sy, side, side, 0, 0, thumbSize, thumbSize);
  const thumbUrl = thumb.toDataURL('image/jpeg', Math.min(0.8, quality + 0.08));

  const base64 = dataUrl.split(',')[1] || '';
  return { dataUrl, thumbUrl, base64 };
};


const pickLessonForToday = (user: UserProfile): CourseLesson => {
  const completedIds = user.courseProgress?.completedLessonIds || [];
  const nextLesson = COURSE_LIBRARY.find(l => !completedIds.includes(l.id));
  return nextLesson || COURSE_LIBRARY[0];
};

const PREMIUM_GATES = {
  aiFoodPhotoPerDay: { free: 3, pro: Infinity, family: Infinity },
  aiCoachAdvicePerDay: { free: 3, pro: Infinity, family: Infinity },
  familyMenuGenerationsPerWeek: { free: 1, pro: 10, family: 100 },
  weeklyReview: { free: false, pro: true, family: true },
  metabolicAdaptation: { free: false, pro: true, family: true }
};

const INITIAL_HABITS: UserHabit[] = [
  { id: 'h_water', title: 'Пить воду', goal: 8, current: 0, unit: 'ст.', streak: 0, lastCompletedDate: null },
  { id: 'h_steps', title: '10,000 шагов', goal: 10000, current: 0, unit: 'шаг', streak: 0, lastCompletedDate: null },
  { id: 'h_veg', title: 'Здоровый завтрак', goal: 1, current: 0, unit: 'порц.', streak: 0, lastCompletedDate: null },
  { id: 'h_sleep', title: 'Сон 8 часов', goal: 8, current: 0, unit: 'ч.', streak: 0, lastCompletedDate: null }
];

function getDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

function formatTime(tsIso: string): string {
  const d = new Date(tsIso);
  if (Number.isNaN(d.getTime())) return tsIso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function last7DayKeys(anchor: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - i);
    keys.push(getDayKey(d));
  }
  return keys;
}

const MacroBar: React.FC<{ label: string; current: number; target: number; color: string; unit?: string }> = React.memo(({ label, current, target, color, unit = 'г' }) => {
  const progress = Math.min(100, (current / (target || 1)) * 100);

  return (
    <div className="space-y-2 text-left">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-200 tabular-nums">{Math.round(current)} / {target} {unit}</span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full transition-all duration-1000 ease-out rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]" style={{ width: `${progress}%`, backgroundColor: color }} />
      </div>
    </div>
  );
});


type FoodDiaryGroupedProps = {
  items: FoodEntry[];
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  bulkMoveTo: (mealType: MealType) => void;
  bulkDelete: () => void;
  deleteEntry: (id: string) => void;
  deletePhoto: (id: string) => void;
  openInsight: (item: FoodEntry) => void;
  openEdit: (item: FoodEntry) => void;
  formatTime: (t: number) => string;
  mealTypeLabel: (m: MealType) => string;
};


const FoodDiaryGrouped: React.FC<FoodDiaryGroupedProps> = ({
  items,
  selectedIds,
  toggleSelected,
  bulkMoveTo,
  bulkDelete,
  deleteEntry,
  deletePhoto,
  openInsight,
  openEdit,
  formatTime,
  mealTypeLabel,
}) => {
  const [mobileActionsFor, setMobileActionsFor] = React.useState<string | null>(null);
  const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

  const groups = order
    .map((mt) => {
      const groupItems = items.filter((x) => x.mealType === mt);
      if (!groupItems.length) return null;
      const calories = groupItems.reduce((s, x) => s + (x.calories || 0), 0);
      return { mt, title: mealTypeLabel(mt), calories, groupItems };
    })
    .filter(Boolean) as Array<{ mt: MealType; title: string; calories: number; groupItems: FoodEntry[] }>;

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.mt} className="rounded-[2rem] md:rounded-[3rem] border border-slate-800 bg-slate-900/60 shadow-xl overflow-hidden">
          <div className="px-5 py-5 md:px-8 md:py-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h3 className="text-2xl md:text-3xl font-black text-slate-100">{g.title}</h3>
              <span className="text-sm font-black text-slate-500 tabular-nums">{Math.round(g.calories)} ккал</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                disabled={!selectedIds.size}
                onClick={() => bulkMoveTo(g.mt)}
                className="min-h-[40px] text-[10px] px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 font-black tracking-widest uppercase hover:bg-indigo-500/15 transition disabled:opacity-40"
                title="Перенести выбранные в этот прием пищи"
              >
                → {g.title}
              </button>

              <button
                disabled={!selectedIds.size}
                onClick={bulkDelete}
                className="min-h-[40px] text-[10px] px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-200 font-black tracking-widest uppercase hover:bg-rose-500/15 transition disabled:opacity-40"
                title="Удалить выбранные"
              >
                Удалить выбранные
              </button>
            </div>
          </div>

          <div className="p-3 md:p-6 space-y-3 md:space-y-4">
            {g.groupItems.map((item) => {
              const hasPhoto = !!(item.photoThumb || item.photo);
              const mobileOpen = mobileActionsFor === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (hasPhoto && item.insight) openInsight(item);
                  }}
                  role="button"
                  className="bg-slate-900 p-3 md:p-6 rounded-[1.8rem] md:rounded-[2.5rem] border border-slate-800 shadow-xl hover:border-slate-700 transition-all cursor-pointer"
                >
                  <div className="flex items-start gap-3 md:gap-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelected(item.id);
                      }}
                      className="mt-10 md:mt-5 h-6 w-6 rounded-md accent-indigo-400 shrink-0"
                      title="Выбрать"
                    />

                    <div className="w-16 h-16 md:w-24 md:h-24 bg-slate-950 rounded-[1rem] md:rounded-2xl flex items-center justify-center text-indigo-400 shadow-inner border border-slate-800/50 overflow-hidden shrink-0">
                      {hasPhoto ? (
                        <img src={(item.photoThumb || item.photo)!} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <Utensils size={28} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 text-left">
                          <h4 className="text-xl md:text-xl font-black text-slate-100 leading-tight truncate">{item.name}</h4>
                          <p className="mt-1.5 text-[10px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest tabular-nums">
                            {formatTime(item.timestamp)} · {mealTypeLabel(item.mealType)}
                          </p>
                          <p className="mt-1.5 text-sm md:text-base font-black text-slate-300 tabular-nums">
                            Б:{Math.round(item.protein)} · Ж:{Math.round(item.fat)} · У:{Math.round(item.carbs)}
                          </p>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMobileActionsFor((prev) => (prev === item.id ? null : item.id));
                            }}
                            className="md:hidden w-10 h-10 rounded-full border border-slate-700 bg-slate-950/80 text-slate-300 flex items-center justify-center"
                            aria-label="Действия"
                          >
                            <MoreHorizontal size={18} />
                          </button>

                          <div className="text-right tabular-nums">
                            <div className="text-3xl md:text-3xl font-black text-slate-50 leading-none">{Math.round(item.calories)}</div>
                            <div className="text-sm md:text-xs font-bold text-slate-500 mt-1">Ккал</div>
                          </div>
                        </div>
                      </div>

                      <div className="hidden md:flex items-center gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="min-h-[36px] text-[10px] px-3 py-1 rounded-full bg-slate-950/60 border border-slate-700/50 text-slate-200 font-black tracking-widest uppercase hover:bg-slate-900 transition"
                          title="Корректировать данные"
                        >
                          Правка
                        </button>

                        {hasPhoto && (
                          <button
                            type="button"
                            onClick={() => deletePhoto(item.id)}
                            title="Удалить только фото"
                            className="min-h-[36px] text-[10px] px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-200 font-black tracking-widest uppercase hover:bg-amber-500/15 transition flex items-center gap-2"
                          >
                            <Trash2 size={14} />
                            Фото
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => deleteEntry(item.id)}
                          title="Удалить запись (фото и данные)"
                          className="min-h-[36px] text-[10px] px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-200 font-black tracking-widest uppercase hover:bg-rose-500/15 transition flex items-center gap-2"
                        >
                          <Trash2 size={14} />
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>

                  {mobileOpen && (
                    <div className="md:hidden mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileActionsFor(null);
                          openEdit(item);
                        }}
                        className="min-h-[44px] px-4 rounded-[1.1rem] bg-slate-950/60 border border-slate-700/50 text-slate-200 font-black tracking-widest uppercase text-[11px]"
                      >
                        Правка
                      </button>
                      {hasPhoto && (
                        <button
                          type="button"
                          onClick={() => {
                            setMobileActionsFor(null);
                            deletePhoto(item.id);
                          }}
                          className="min-h-[44px] px-4 rounded-[1.1rem] bg-amber-500/10 border border-amber-500/20 text-amber-200 font-black tracking-widest uppercase text-[11px]"
                        >
                          Удалить фото
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMobileActionsFor(null);
                          deleteEntry(item.id);
                        }}
                        className="min-h-[44px] px-4 rounded-[1.1rem] bg-rose-500/10 border border-rose-500/20 text-rose-200 font-black tracking-widest uppercase text-[11px]"
                      >
                        Удалить запись
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!groups.length && (
        <div className="p-20 text-center text-slate-600 bg-slate-900 rounded-[3rem] border-2 border-dashed border-slate-800 flex flex-col items-center gap-4 shadow-inner">
          <Utensils size={48} className="opacity-20" />
          <p className="font-bold">Вы еще ничего не ели сегодня</p>
        </div>
      )}
    </div>
  );
};



const App: React.FC = () => {

  // --- Cloud Family (B2C) state ---
  const [cloudFamily, setCloudFamily] = useState<any | null>(null);
  const [cloudFamilyMembers, setCloudFamilyMembers] = useState<any[]>([]);
  const [cloudFamilyLoading, setCloudFamilyLoading] = useState(false);
  const [cloudFamilyError, setCloudFamilyError] = useState<string | null>(null);

  const [familyInviteCode, setFamilyInviteCode] = useState<string>('');
  const [familyJoinCode, setFamilyJoinCode] = useState<string>('');
  const [familyNameDraft, setFamilyNameDraft] = useState<string>('Моя семья');

  const [planScope, setPlanScope] = useState<'personal' | 'family'>('personal');
  const [familyShopping, setFamilyShopping] = useState<{ week_start: string; items: {name:string; grams:number}[] } | null>(null);
  const [familyShoppingLoading, setFamilyShoppingLoading] = useState(false);

  const weekStartISO = useCallback((d = new Date()) => {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = date.getUTCDay();
    const diff = (day === 0 ? -6 : 1 - day); // Monday start
    date.setUTCDate(date.getUTCDate() + diff);
    return date.toISOString().slice(0, 10);
  }, []);

  const formatGramsPretty = useCallback((grams: number) => {
    const g = Math.max(0, Math.round(Number(grams || 0)));
    if (g >= 1000) return `${(g / 1000).toFixed(1)} кг`;
    return `${g} г`;
  }, []);

  const parseMealParts = useCallback((text: string) => {
    const raw = String(text || '').trim();
    if (!raw) return [] as { name: string; qty?: string }[];

    // Split by "+" (used in AI menu), also tolerate ";" as delimiter
    const parts = raw
      .split(/\s*\+\s*|\s*;\s*/g)
      .map(s => s.trim())
      .filter(Boolean);

    // Example supported formats:
    // "Куриная грудка (150г)" / "Гречка 70 г" / "Яйца (3 шт)" / "Молоко - 200 мл"
    const rx = /^(.+?)(?:\s*[—–-]\s*|\s*\()?(\d+(?:[\.,]\d+)?)\s*(кг|г|гр|мл|л|шт|порц|порции|порция)?\s*\)?\s*$/i;

    return parts.map((p) => {
      const mm = p.match(rx);
      if (!mm) return { name: p } as any;
      const name = (mm[1] || '').trim();
      const num = (mm[2] || '').replace(',', '.').trim();
      const unitRaw = (mm[3] || '').trim().toLowerCase();

      const unit =
        unitRaw === 'гр' ? 'г' :
        unitRaw;

      const qty = unit ? `${num} ${unit}` : num;
      return { name: name || p, qty };
    });
  }, []);

  const MealParts = ({ value }: { value: string }) => {
    const parts = parseMealParts(value);
    const hasQty = parts.some(p => !!p.qty);
    const hasMulti = parts.length > 1;

    if (!value) return <span className="text-slate-500">—</span>;

    // If it's a single plain string without qty, keep the compact one-line view
    if (!hasQty && !hasMulti) return <span>{value}</span>;

    return (
      <div className="mt-1 space-y-1">
        {parts.map((p, idx) => (
          <div key={idx} className="flex items-start justify-between gap-3">
            <span className="text-slate-200">{p.name}</span>
            {p.qty ? <span className="text-slate-400 tabular-nums whitespace-nowrap">{p.qty}</span> : null}
          </div>
        ))}
      </div>
    );
  };

  const loadCloudFamily = useCallback(async () => {
    try {
      setCloudFamilyLoading(true);
      setCloudFamilyError(null);
      const res = await fetch('/api/family', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось загрузить семью');
      setCloudFamily(data.family || null);
      setCloudFamilyMembers(Array.isArray(data.members) ? data.members : []);
      // Auto switch scope if user is in a family
      if (data.family && planScope !== 'family') {
        // keep user's choice, but first time default to family for visibility
        setPlanScope('family');
      }
    } catch (e: any) {
      setCloudFamilyError(e?.message || 'Ошибка');
      setCloudFamily(null);
      setCloudFamilyMembers([]);
    } finally {
      setCloudFamilyLoading(false);
    }
  }, [planScope]);

  const loadFamilyShopping = useCallback(async () => {
    if (!cloudFamily?.id) return;
    try {
      setFamilyShoppingLoading(true);
      const week = weekStartISO();
      const res = await fetch(`/api/shopping/list?week=${encodeURIComponent(week)}&family_id=${encodeURIComponent(cloudFamily.id)}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить список покупок семьи');
      setFamilyShopping({ week_start: data.week_start, items: data.items || [] });
    } catch (e) {
      setFamilyShopping(null);
    } finally {
      setFamilyShoppingLoading(false);
    }
  }, [cloudFamily?.id, weekStartISO]);

  const createFamilyCloud = useCallback(async () => {
    const name = (familyNameDraft || 'Моя семья').trim().slice(0, 60);
    const res = await fetch('/api/family', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось создать семью');
    await loadCloudFamily();
  }, [familyNameDraft, loadCloudFamily]);

  const makeInviteCode = useCallback(async () => {
    const res = await fetch('/api/family/invite', { method: 'POST', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось создать приглашение');
    setFamilyInviteCode(String(data.code || ''));
    return String(data.code || '');
  }, []);

  const joinFamilyCloud = useCallback(async () => {
    const code = (familyJoinCode || '').trim();
    if (!code) return;
    const res = await fetch('/api/family/join', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось присоединиться');
    setFamilyJoinCode('');
    await loadCloudFamily();
  }, [familyJoinCode, loadCloudFamily]);

  const updateMyFamilyGoal = useCallback(async (goal: 'LOSS' | 'MAINTAIN') => {
    const res = await fetch('/api/family/member', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось обновить цель');
    await loadCloudFamily();
  }, [loadCloudFamily]);

  const generateFamilyMenuNow = useCallback(async () => {
    if (!cloudFamily?.id) return;
    const week = weekStartISO();
    const res = await fetch(`/api/family/menu/generate?week=${encodeURIComponent(week)}`, { method: 'POST', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Не удалось сгенерировать семейное меню');
    await loadFamilyShopping();
  }, [cloudFamily?.id, weekStartISO, loadFamilyShopping]);

  const mealTypeLabel = (t?: MealType) => {
    if (t === 'breakfast') return 'Завтрак';
    if (t === 'lunch') return 'Обед';
    if (t === 'dinner') return 'Ужин';
    if (t === 'snack') return 'Перекус';
    return 'Приём пищи';
  };

  const inferMealType = (iso: string): MealType => {
    const h = new Date(iso).getHours();
    if (h >= 5 && h < 11) return 'breakfast';
    if (h >= 11 && h < 16) return 'lunch';
    if (h >= 16 && h < 22) return 'dinner';
    return 'snack';
  };

  const toLocalDT = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fromLocalDT = (local: string) => {
    const d = new Date(local);
    return d.toISOString();
  };


  const [authState, setAuthState] = useState<'loading' | 'auth_choice' | 'register' | 'app'>('loading');
  const [inviteCode, setInviteCode] = useState<string>(() => localStorage.getItem('fitfocus_invite_code') || '');
  const [requireInvite, setRequireInvite] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteChecking, setInviteChecking] = useState<boolean>(false);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [profileSyncState, setProfileSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastProfileSyncAt, setLastProfileSyncAt] = useState<number | null>(null);

  const [googleMe, setGoogleMe] = useState<
  null | { sub?: string; email?: string }
>(null);
  const isAdmin = !!googleMe?.roles?.includes('admin');

  // --- Local JSON backup (hybrid approach):
  // - keep normal localStorage flow (fast)
  // - allow export/import JSON to переносить данные между браузерами
  // - optional auto-save to a user-selected JSON file (Chromium)
  const backupHandleRef = useRef<any>(null);
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);

  useEffect(() => {
    // restore previously выбранный файл для автосейва (если браузер поддерживает)
    (async () => {
      try {
        const h = await getSavedBackupHandle();
        if (h) {
          backupHandleRef.current = h;
          setAutosaveEnabled(true);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (!autosaveEnabled) return;
    const tick = async () => {
      const handle = backupHandleRef.current;
      if (!handle) return;
      const payload = createBackupPayload();
      const jsonText = JSON.stringify(payload);
      await writeBackupToHandle(handle, jsonText);
    };
    // every 20s is enough for local testing; avoids wiring into every setItem.
    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, [autosaveEnabled]);

  const onExportBackup = useCallback(() => {
    const payload = createBackupPayload();
    const jsonText = JSON.stringify(payload, null, 2);
    downloadJson('fitfocus-backup.json', jsonText);
  }, []);

  const onImportBackup = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.version !== 1 || typeof parsed.localStorage !== 'object') {
        alert('Файл не похож на резервную копию FitFocus.');
        return;
      }
      applyBackupPayload(parsed);
      // reload to re-read all cached state from localStorage
      window.location.reload();
    } catch {
      alert('Не удалось прочитать JSON.');
    }
  }, []);

  const onConnectAutosave = useCallback(async () => {
    if (!supportsFileSystemAccessApi()) {
      alert('Автосейв в файл поддерживается только в Chrome/Edge (File System Access API). Используйте Экспорт JSON.');
      return false;
    }
    const h = await chooseAndSaveBackupHandle();
    if (!h) return false;
    backupHandleRef.current = h;
    setAutosaveEnabled(true);
    // write immediately
    const payload = createBackupPayload();
    await writeBackupToHandle(h, JSON.stringify(payload, null, 2));
    return true;
  }, []);

  // ---- Weekly menus (personal + family) ----
  const handleGenerateWeeklyMenu = useCallback(async () => {
    if (!currentUser?.aiPlan) return;
    setWeeklyMenuError(null);
    setWeeklyMenuLoading(true);
    try {
      const weeklyMenu = await generateWeeklyMenu(currentUser, currentUser.aiPlan);
      const updatedUser: UserProfile = { ...currentUser, aiPlan: { ...currentUser.aiPlan, weeklyMenu } };
      setCurrentUser(updatedUser);
      setAllUsers(prev => {
        const next = prev.map(u => (u.id === updatedUser.id ? updatedUser : u));
        safeSetItem('fitfocus_all_users', JSON.stringify(next));
        return next;
      });
    } catch (e: any) {
      setWeeklyMenuError(e?.message || 'Не удалось сгенерировать меню на неделю.');
    } finally {
      setWeeklyMenuLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    // 1) load prefs from saved menu
    const saved = currentUser.aiPlan?.familyWeeklyMenu?.prefs;
    // 2) or from localStorage
    let ls: any = null;
    try { ls = JSON.parse(localStorage.getItem(`fitfocus_family_menu_prefs_${currentUser.id}`) || 'null'); } catch {}
    const fromStore = ls && typeof ls === 'object' ? ls : null;
    const baseInclude = (saved?.includeIds?.length ? saved.includeIds : (fromStore?.includeIds?.length ? fromStore.includeIds : []));
    const includeIds = baseInclude.length ? baseInclude : allUsers.map(u => u.id);
    setFamilyMenuPrefs(prev => ({
      ...prev,
      includeIds,
      cookingMode: (saved?.cookingMode || fromStore?.cookingMode || prev.cookingMode) as any,
      budgetPerWeek: String(saved?.budgetPerWeek ?? fromStore?.budgetPerWeek ?? prev.budgetPerWeek ?? ''),
      currency: String(saved?.currency ?? fromStore?.currency ?? prev.currency ?? 'KZT'),
    }));
  }, [currentUser?.id, allUsers]);

  const persistFamilyMenuPrefs = useCallback((prefs: { includeIds: string[]; cookingMode: 'all_meals' | 'once_per_day'; budgetPerWeek: string; currency: string }) => {
    if (!currentUser) return;
    try {
      localStorage.setItem(`fitfocus_family_menu_prefs_${currentUser.id}`, JSON.stringify({
        includeIds: prefs.includeIds,
        cookingMode: prefs.cookingMode,
        budgetPerWeek: prefs.budgetPerWeek ? Number(prefs.budgetPerWeek) : undefined,
        currency: prefs.currency
      }));
    } catch {}
  }, [currentUser]);

  const deleteUserProfile = useCallback((userId: string) => {
    // 1) Удаляем все данные пользователя из localStorage
    const prefix = `fitfocus_data_${userId}_`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) localStorage.removeItem(k);
    }

    // 2) Удаляем из списка профилей
    setAllUsers(prev => {
      const next = prev.filter(u => u.id !== userId);
      localStorage.setItem('fitfocus_all_users', JSON.stringify(next));
      return next;
    });

    // 3) Если удалили "последнего" или текущего — сбрасываем
    const lastId = localStorage.getItem('fitfocus_last_user_id');
    if (lastId === userId) localStorage.removeItem('fitfocus_last_user_id');

    if (currentUser?.id === userId) {
      setCurrentUser(null);
      setAuthState('auth_choice');
    }
  }, [currentUser]);
  
  const [foodDiary, setFoodDiary] = useState<FoodItem[]>([]);
  const [insightModal, setInsightModal] = useState<null | { id: string; photo: string; name: string; insight: FoodInsight }>(null);
  const [editFoodModal, setEditFoodModal] = useState<null | { id: string; name: string; mealType: MealType; timestamp: string }>(null);
  const insightEntry = useMemo(() => (insightModal ? foodDiary.find(it => it.id === insightModal.id) ?? null : null), [insightModal, foodDiary]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'council' | 'plan' | 'nutrition' | 'recipes' | 'workouts' | 'course' | 'family' | 'settings' | 'pro' | 'admin'>('dashboard');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const sidebarTabs = [
    { id: 'dashboard', icon: Activity, label: 'Обзор' },
    { id: 'council', icon: MessageSquareText, label: 'AI Совет' },
    { id: 'plan', icon: Sparkles, label: 'План' },
    { id: 'nutrition', icon: Utensils, label: 'Питание' },
    { id: 'recipes', icon: ChefHat, label: 'Рецепты' },
    { id: 'workouts', icon: Dumbbell, label: 'Зал' },
    { id: 'course', icon: BookOpen, label: 'Курс' },
    { id: 'family', icon: Users, label: 'Семья' },
    ...(isAdmin ? [{ id: 'admin', icon: ShieldCheck, label: 'Админ' }] : []),
    { id: 'pro', icon: Crown, label: 'Тарифы', color: 'text-amber-500' },
    { id: 'settings', icon: Settings, label: 'Настройки' }
  ] as const;
  const mobilePrimaryTabIds = ['dashboard', 'council', 'plan', 'nutrition'] as const;
  const mobilePrimaryTabs = sidebarTabs.filter(tab => mobilePrimaryTabIds.includes(tab.id as any));
  const mobileMoreTabs = sidebarTabs.filter(tab => !mobilePrimaryTabIds.includes(tab.id as any));


  // Load Cloud Family context when opening Family / Plan (so users can see family mode immediately)
  useEffect(() => {
    setMobileMoreOpen(false);
    if (activeTab === 'family' || activeTab === 'plan') {
      void loadCloudFamily();
    }
  }, [activeTab, loadCloudFamily]);

  // If plan is in family scope, keep family shopping list fresh
  useEffect(() => {
    if (planScope === 'family' && cloudFamily?.id) {
      void loadFamilyShopping();
    }
  }, [planScope, cloudFamily?.id, loadFamilyShopping]);

  // AI Council (Orchestrator v2)
  const [councilInput, setCouncilInput] = useState('');
  const [councilLoading, setCouncilLoading] = useState(false);
  const [councilResponse, setCouncilResponse] = useState<CouncilResponse | null>(null);
  const [showCouncilThoughts, setShowCouncilThoughts] = useState(false);
  const [councilStage, setCouncilStage] = useState<'idle' | 'router' | 'experts' | 'review' | 'chairman'>('idle');
  type CouncilChatMsg = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; response?: CouncilResponse };
  const [councilMessages, setCouncilMessages] = useState<CouncilChatMsg[]>([]);
  const [expandedCouncilThoughtIds, setExpandedCouncilThoughtIds] = useState<Record<string, boolean>>({});
  const councilScrollRef = useRef<HTMLDivElement | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [newWeight, setNewWeight] = useState<string>('');
  
  const [currentLesson, setCurrentLesson] = useState<CourseLesson | null>(null);
  const [isLessonViewOpen, setIsLessonViewOpen] = useState(false);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [selectedQuizOption, setSelectedQuizOption] = useState<LessonQuizOption | null>(null);

  // Metabolic Adaptation States
  const [adaptLoading, setAdaptLoading] = useState(false);
  const [adaptNote, setAdaptNote] = useState<string>('');
  const [refeedDate, setRefeedDate] = useState<string | null>(null);

  const [adaptExpanded, setAdaptExpanded] = useState(false);
  const [adaptRead, setAdaptRead] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const kRead = `ff_adapt_read_${currentUser.id}`;
    const kExp = `ff_adapt_expanded_${currentUser.id}`;
    try {
      setAdaptRead(localStorage.getItem(kRead) === '1');
      setAdaptExpanded(localStorage.getItem(kExp) === '1');
    } catch {}
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const kRead = `ff_adapt_read_${currentUser.id}`;
    const kExp = `ff_adapt_expanded_${currentUser.id}`;
    try {
      localStorage.setItem(kRead, adaptRead ? '1' : '0');
      localStorage.setItem(kExp, adaptExpanded ? '1' : '0');
    } catch {}
  }, [adaptRead, adaptExpanded, currentUser?.id]);

  // Weekly Reports History
  const [weeklyReports, setWeeklyReports] = useState<WeeklyStoredReport[]>([]);

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem('ff_settings');
      if (raw) return JSON.parse(raw);
    } catch {}
    return { theme: 'dark', language: 'ru', soundEnabled: false, musicEnabled: false };
  });

  useEffect(() => {
    try { localStorage.setItem('ff_settings', JSON.stringify(settings)); } catch {}
  }, [settings]);

  // AI Council: load/save chat history per user (localStorage)
  useEffect(() => {
    if (!currentUser) return;
    const key = `fitfocus_council_history_${currentUser.id}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCouncilMessages(parsed);
      } else {
        setCouncilMessages([]);
      }
    } catch {
      setCouncilMessages([]);
    }
    setExpandedCouncilThoughtIds({});
    setCouncilResponse(null);
    setCouncilStage('idle');
  }, [currentUser?.id]);

  useEffect(() => {
    // keep view pinned to the bottom during conversation
    if (!councilScrollRef.current) return;
    councilScrollRef.current.scrollTop = councilScrollRef.current.scrollHeight;
  }, [councilMessages.length, councilLoading, activeTab]);

  const persistCouncilHistory = useCallback((msgs: CouncilChatMsg[]) => {
    if (!currentUser) return;
    const key = `fitfocus_council_history_${currentUser.id}`;
    try { localStorage.setItem(key, JSON.stringify(msgs.slice(-50))); } catch {}
  }, [currentUser?.id]);

  // AI status badge (shows when AI is live/cache/fallback or cooling down due to quota)
  const [aiStatus, setAiStatus] = useState<AiLastStatus | null>(() => {
    try { return readAiStatus(); } catch { return null; }
  });

  const [lastAiAction, setLastAiActionState] = useState(() => {
    try { return getLastAiAction(); } catch { return null; }
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      try { setAiStatus(readAiStatus()); } catch {}
      try { setLastAiActionState(getLastAiAction()); } catch {}
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  // Apply theme to document root (works for Vite/PWA and AI Studio preview)
  useEffect(() => {
    const root = document.documentElement;
    // store theme in a data-attribute for CSS variables
    root.dataset.ffTheme = settings.theme;
    // Tailwind dark-mode class: enabled for all themes except 'light'
    const isDark = settings.theme !== 'light';
    root.classList.toggle('dark', isDark);
  }, [settings.theme]);

  // Favorite recipes
  const [favoriteRecipes, setFavoriteRecipes] = useState<FavoriteRecipe[]>(() => {
    try {
      const raw = localStorage.getItem('ff_fav_recipes');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  const persistFavorites = useCallback((next: FavoriteRecipe[]) => {
    setFavoriteRecipes(next);
    try { localStorage.setItem('ff_fav_recipes', JSON.stringify(next)); } catch {}
  }, []);

  const addFavoriteRecipe = useCallback((fav: FavoriteRecipe) => {
    persistFavorites([fav, ...favoriteRecipes].slice(0, 100));
  }, [favoriteRecipes, persistFavorites]);

  const removeFavoriteRecipe = useCallback((id: string) => {
    persistFavorites(favoriteRecipes.filter(r => r.id !== id));
  }, [favoriteRecipes, persistFavorites]);

  const clearFavoriteRecipes = useCallback(() => {
    persistFavorites([]);
  }, [persistFavorites]);

  const paywall = usePaywall(currentUser?.plan || 'free');
  const [pdfIncludeMealLog, setPdfIncludeMealLog] = useState(false);

  const [coachCard, setCoachCard] = useState<{ title: string; advice: string; bullets: string[] } | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const [habits, setHabits] = useState<UserHabit[]>(INITIAL_HABITS);
  const [foodHistory, setFoodHistory] = useState<FastLogItem[]>([]);
  const [foodFavorites, setFoodFavorites] = useState<FastLogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

const [selectedFoodIds, setSelectedFoodIds] = useState<Set<string>>(new Set());

const toggleFoodSelected = (id: string) => {
  setSelectedFoodIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const clearFoodSelection = () => setSelectedFoodIds(new Set());

const bulkUpdateMealType = (mealType: MealType) => {
  if (!selectedFoodIds.size) return;
  setFoodDiary((prev) =>
    prev.map((x) => (selectedFoodIds.has(x.id) ? { ...x, mealType } : x))
  );
  clearFoodSelection();
};

const bulkRemoveSelectedFoods = () => {
  if (!selectedFoodIds.size) return;
  const ids = Array.from(selectedFoodIds);
  ids.forEach((id) => deleteFoodEntry(id));
  clearFoodSelection();
};

const openEditFood = (item: FoodEntry) => {
  setEditFoodModal({
    id: item.id,
    name: item.name,
    calories: item.calories,
    protein: item.protein,
    fat: item.fat,
    carbs: item.carbs,
    mealType: item.mealType,
  });
};
  const [showSearchResults, setShowSearchResults] = useState(false);

  const [regData, setRegData] = useState({
    name: '',
    gender: Gender.MALE,
    weight: 70,
    height: 170,
    age: 25,
    activityLevel: ActivityLevel.MODERATELY_ACTIVE,
    goal: Goal.LOSS,
    targetWeight: 65,
    dietary: { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict' as const, notes: '' },
    plan: 'free' as TariffPlan,
    lossDeficit: DEFAULT_DEFICIT,
    gainSurplus: DEFAULT_SURPLUS,
    riskAckLoss: false,
    riskAckGain: false
  });

  const [onboardingMode, setOnboardingMode] = useState<'mvp' | 'investor'>('mvp');
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);
  const [isActivatingPlan, setIsActivatingPlan] = useState(false);
  const [activationStep, setActivationStep] = useState(0);
  const activationTimerRef = useRef<number | null>(null);
  const activationIntervalRef = useRef<number | null>(null);

  const [planIntroOpen, setPlanIntroOpen] = useState(false);
  const [weeklyMenuLoading, setWeeklyMenuLoading] = useState(false);
  const [weeklyMenuError, setWeeklyMenuError] = useState<string | null>(null);
  const [planTaskDone, setPlanTaskDone] = useState<Record<string, boolean>>({});
  const [planWeekExpanded, setPlanWeekExpanded] = useState<Record<string, boolean>>({});
  const [planRulesExpanded, setPlanRulesExpanded] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) {
      setPlanTaskDone({});
      return;
    }
    try {
      const raw = localStorage.getItem(`fitfocus_plan_task_done_${currentUser.id}`);
      setPlanTaskDone(raw ? JSON.parse(raw) : {});
    } catch {
      setPlanTaskDone({});
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    safeSetItem(`fitfocus_plan_task_done_${currentUser.id}`, JSON.stringify(planTaskDone));
  }, [currentUser?.id, planTaskDone]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    (currentUser?.aiPlan?.weeklyMenu?.days ?? []).forEach((day, idx) => {
      next[day.day] = idx < 2;
    });
    setPlanWeekExpanded(next);
  }, [currentUser?.aiPlan?.weeklyMenu?.weekStart, currentUser?.aiPlan?.weeklyMenu?.days?.length]);
  const [familyMenuLoading, setFamilyMenuLoading] = useState(false);
  const [familyMenuError, setFamilyMenuError] = useState<string | null>(null);
  const [familyMenuPrefsOpen, setFamilyMenuPrefsOpen] = useState(false);

  const collectFamilyRestrictions = (member: any): string[] => {
    const dietary = member?.dietary || {};
    return [
      ...(Array.isArray(dietary.allergens) ? dietary.allergens : []),
      ...(Array.isArray(dietary.intolerances) ? dietary.intolerances : []),
      ...(Array.isArray(dietary.excludedFoods) ? dietary.excludedFoods : []),
      ...String(member?.exclusions || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ]
      .map((x) => String(x).trim())
      .filter(Boolean);
  };

  const formatFamilyGoal = (goal?: string) => {
    const v = String(goal || '').toUpperCase();
    if (v === 'LOSS') return 'Похудение';
    if (v === 'MAINTAIN') return 'Удержание';
    if (v === 'GAIN') return 'Набор';
    return '—';
  };

  const [familyMenuPrefs, setFamilyMenuPrefs] = useState<{ includeIds: string[]; cookingMode: 'all_meals' | 'once_per_day'; budgetPerWeek: string; currency: string }>({
    includeIds: [],
    cookingMode: 'all_meals',
    budgetPerWeek: '',
    currency: 'KZT'
  });


  const handleGenerateFamilyWeeklyMenu = useCallback(async () => {
    if (!currentUser?.aiPlan) return;
    setFamilyMenuError(null);
    // обязательные вопросы перед генерацией
    const includeIds = (familyMenuPrefs.includeIds?.length ? familyMenuPrefs.includeIds : allUsers.map(u => u.id));
    if (!includeIds.length) {
      setFamilyMenuPrefsOpen(true);
      return;
    }
    if (!familyMenuPrefs.cookingMode) {
      setFamilyMenuPrefsOpen(true);
      return;
    }

    setFamilyMenuLoading(true);
    try {
      const prefs = {
        includeIds,
        cookingMode: familyMenuPrefs.cookingMode,
        budgetPerWeek: familyMenuPrefs.budgetPerWeek ? Number(familyMenuPrefs.budgetPerWeek) : undefined,
        currency: familyMenuPrefs.currency || 'KZT'
      } as any;

      persistFamilyMenuPrefs(familyMenuPrefs);

      const familyWeeklyMenu = await generateFamilyWeeklyMenu(currentUser, allUsers, prefs);
      const updatedUser: UserProfile = { ...currentUser, aiPlan: { ...currentUser.aiPlan, familyWeeklyMenu } };
      setCurrentUser(updatedUser);
      setAllUsers(prev => {
        const next = prev.map(u => (u.id === updatedUser.id ? updatedUser : u));
        safeSetItem('fitfocus_all_users', JSON.stringify(next));
        return next;
      });
    } catch (e: any) {
      setFamilyMenuError(e?.message || 'Не удалось сгенерировать семейное меню на неделю.');
    } finally {
      setFamilyMenuLoading(false);
    }
  }, [currentUser, allUsers, familyMenuPrefs, persistFamilyMenuPrefs]);
  const [planError, setPlanError] = useState<string | null>(null);

  // Cinematic AI activation steps
  const ACTIVATION_TOTAL_MS = 3200;
  const ACTIVATION_STEPS = useMemo(() => ([
    { title: 'AI анализирует профиль…', subtitle: 'Считываем параметры и контекст цели', icon: Brain },
    { title: 'Считаем метаболизм и KPI…', subtitle: 'BMR, TDEE и дневные макросы', icon: Activity },
    { title: 'Готовим персональную стратегию…', subtitle: 'Подбираем режим и прогноз на 4 недели', icon: Sparkles },
    { title: 'Защищаем ваши данные…', subtitle: 'Offline-first: всё остаётся на устройстве', icon: ShieldCheck },
  ]), []);

  const ACTIVATION_STEP_MS = Math.round(ACTIVATION_TOTAL_MS / ACTIVATION_STEPS.length);

  const regBMI = useMemo(() => {
    const h = Number(regData.height) || 0;
    const w = Number(regData.weight) || 0;
    if (!h || !w) return 0;
    const m = h / 100;
    return w / (m * m);
  }, [regData.height, regData.weight]);

  const regBMR = useMemo(() => {
    return Math.round(calculateBMR({ gender: regData.gender, weight: regData.weight, height: regData.height, age: regData.age }));
  }, [regData.gender, regData.weight, regData.height, regData.age]);

  const regTDEE = useMemo(() => {
    return Math.round(calculateTDEE({ 
      gender: regData.gender, 
      weight: regData.weight, 
      height: regData.height, 
      age: regData.age, 
      activityLevel: regData.activityLevel, 
      adaptationMultiplier: 1, 
      goal: regData.goal,
      lossDeficit: regData.lossDeficit,
      gainSurplus: regData.gainSurplus
    }));
  }, [regData]);

  const regTargets = useMemo(() => {
    return calculateDailyTargets({ 
      gender: regData.gender, 
      weight: regData.weight, 
      height: regData.height, 
      age: regData.age, 
      activityLevel: regData.activityLevel, 
      adaptationMultiplier: 1, 
      goal: regData.goal,
      lossDeficit: regData.lossDeficit,
      gainSurplus: regData.gainSurplus
    });
  }, [regData]);

  const aiRecommendedGoal: Goal = useMemo(() => {
    if (!regBMI) return regData.goal;
    if (regBMI >= 27) return Goal.LOSS;
    if (regBMI <= 20) return Goal.GAIN;
    return Goal.MAINTAIN;
  }, [regBMI, regData.goal]);

  const forecast = useMemo(() => {
    if (!regData.weight || !regTargets.calories) return null;
    const deficit = regData.goal === Goal.LOSS ? -Number(regData.lossDeficit || DEFAULT_DEFICIT) : regData.goal === Goal.GAIN ? Number(regData.gainSurplus || DEFAULT_SURPLUS) : 0;
    const weeklyDeltaKg = (deficit * 7) / 7700;
    return {
      week4Weight: (regData.weight + weeklyDeltaKg * 4).toFixed(1),
      weeklyDelta: (weeklyDeltaKg > 0 ? '+' : '') + weeklyDeltaKg.toFixed(2),
    };
  }, [regData.weight, regData.goal, regTargets.calories, regData.lossDeficit, regData.gainSurplus]);

  const canAddProfile = useCallback((users: UserProfile[]) => users.length < 5, []);
  
  const regNameTrim = (regData.name ?? '').trim();
  const regNameValid = regNameTrim.length > 0;
  const regStep1Valid = (Number(regData.weight) > 0) && (Number(regData.height) > 0) && (Number(regData.age) > 0);

  const persistUser = useCallback((updated: UserProfile) => {
    setCurrentUser(updated);
    setProfileSyncState('saving');
    setAllUsers(prev => {
      const found = prev.some(u => u.id === updated.id);
      const next = found ? prev.map(u => u.id === updated.id ? updated : u) : [updated, ...prev];
      safeSetItem('fitfocus_all_users', JSON.stringify(next));
      return next;
    });
  }, []);

  const resetUsageIfNewTime = useCallback((user: UserProfile): UserProfile => {
    const today = new Date().toLocaleDateString('en-CA');
    const weekKey = getWeekKey(new Date());
    const usage = user.usage || {};
    let updated = false;
    const nextUsage = { ...usage };
    if (usage.dayKey !== today) {
      nextUsage.dayKey = today;
      nextUsage.aiFoodPhotoCount = 0;
      nextUsage.aiCoachCount = 0;
      updated = true;
    }
    if (usage.weekKey !== weekKey) {
      nextUsage.weekKey = weekKey;
      nextUsage.familyMenuCount = 0;
      updated = true;
    }
    if (updated) return { ...user, usage: nextUsage };
    return user;
  }, []);

  const targets = useMemo(() => {
    if (!currentUser) return { calories: 0, protein: 0, fat: 0, carbs: 0 };
    return calculateDailyTargets(currentUser);
  }, [currentUser]);

  const weekly = useMemo(() => {
    if (!currentUser) return null;
    return generateWeeklyIntelligence(currentUser, foodDiary, habits, targets.calories);
  }, [currentUser, foodDiary, habits, targets.calories]);

  const forecastNextWeek = useMemo(() => {
    if (!weekly || !currentUser) return 0;
    if (currentUser.goal === Goal.LOSS) return (-(Number(currentUser.lossDeficit ?? DEFAULT_DEFICIT)) * 7) / 7700;
    if (currentUser.goal === Goal.GAIN) return ((Number(currentUser.gainSurplus ?? DEFAULT_SURPLUS)) * 7) / 7700;
    return 0;
  }, [weekly, currentUser]);

  const exportWeeklyPDF = async (report: any) => {
    const [{ default: jsPDF }, autoTableModule, { ensurePdfInterFont }] = await Promise.all([
  import('jspdf'),
  import('jspdf-autotable'),
  import('./pdf/font'),
]);
const autoTable = autoTableModule.default;
const doc = new jsPDF();
await ensurePdfInterFont(doc);
    doc.setFont("Inter", "normal");
    doc.setFontSize(18);
    doc.text("FitFocus — Еженедельный AI-отчёт (WIS)", 14, 20);
    doc.setFontSize(12);
    doc.text(`Неделя: ${report.weekKey}`, 14, 30);
    doc.text(`WIS (индекс недели): ${report.data.wis}/100`, 14, 36);
    autoTable(doc, {
      startY: 45,
      styles: { font: 'Inter' },
      head: [["Показатель", "Значение"]],
      body: [
        ["Дельта 7 дней", `${report.data.weightDelta7.toFixed(1)} кг`],
        ["Дельта 30 дней", `${report.data.weightDelta30.toFixed(1)} кг`],
        ["Комплаенс", `${report.data.compliance}%`],
        ["Адаптация", `${report.data.adaptationIndex}/100`],
      ],
    });
    if (report.aiText) {
      doc.setFontSize(12);
      doc.text("AI Интерпретация:", 14, (doc as any).lastAutoTable.finalY + 10);
      doc.setFontSize(10);
      doc.text(doc.splitTextToSize(report.aiText, 180), 14, (doc as any).lastAutoTable.finalY + 18);
    }
    doc.save(`FitFocus_Weekly_Report_${report.weekKey}.pdf`);
  };

  // Оптимизированный запуск AI генерации еженедельных отчетов
  const aiReportGenerationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser || !weekly) return;
    
    const weekKey = getWeekKey(new Date());
    // Если отчет для этой недели с этим WIS уже генерируется или готов - пропускаем
    if (aiReportGenerationRef.current === `${currentUser.id}_${weekKey}_${weekly.wis}`) return;

    const generateAI = async () => {
      aiReportGenerationRef.current = `${currentUser.id}_${weekKey}_${weekly.wis}`;
      setLastAiAction({ feature: 'wis_text', type: 'wis', userId: currentUser.id });
      // FIX: getWeeklyIntelligenceInterpretation is now correctly imported
      return await getWeeklyIntelligenceInterpretation({
        name: currentUser.name,
        goal: currentUser.goal,
        wis: weekly.wis,
        status: weekly.status,
        weightDelta7: weekly.weightDelta7,
        weightDelta30: weekly.weightDelta30,
        compliancePct: weekly.compliance,
        adaptationIndex: weekly.adaptationIndex,
        calorieTarget: targets.calories,
        macros: { protein: targets.protein, fat: targets.fat, carbs: targets.carbs }
      });
    };

    ensureWeeklyReportWithAI(currentUser.id, weekly, generateAI).then(() => {
      setWeeklyReports(loadWeeklyReports(currentUser.id));
    }).catch(err => {
      const msg = String((err as any)?.message || err || "").toLowerCase();
      // В dev StrictMode/перезапусках это нормальные "мягкие" ситуации — не засоряем консоль
      const soft = msg.includes("already in progress") || msg.includes("cooldown") || msg.includes("api key") || msg.includes("missing");
      if (!soft) console.error("Weekly AI reporting failed", err);
      aiReportGenerationRef.current = null; // Позволяем переповтор при следующем изменении
    });
  }, [currentUser?.id, weekly?.wis]); // Срабатывает только при смене юзера или изменении итогового балла

  const dailyStats = useMemo(() => {
    return foodDiary.reduce((acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      fat: acc.fat + item.fat,
      carbs: acc.carbs + item.carbs,
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }, [foodDiary]);

  const macroPieData = useMemo(() => {
    return [
      { name: 'Белки', value: dailyStats.protein * 4, color: 'var(--ff-chart-protein)' },
      { name: 'Жиры', value: dailyStats.fat * 9, color: 'var(--ff-chart-fat)' },
      { name: 'Углеводы', value: dailyStats.carbs * 4, color: 'var(--ff-chart-carbs)' }
    ];
  }, [dailyStats]);

  const weightTrend = useMemo(() => {
    if (!currentUser || (currentUser.weightHistory || []).length < 2) return undefined;
    const sorted = [...currentUser.weightHistory].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const diff = last.weight - prev.weight;
    const delta7 = weightDelta(currentUser.weightHistory, 7);
    const delta30 = weightDelta(currentUser.weightHistory, 30);
    return { current: last.weight, diff, diffPct: (diff / prev.weight) * 100, delta7, delta30 };
  }, [currentUser]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const combined = [...foodHistory, ...foodFavorites];
    const unique = Array.from(new Map(combined.map(item => [item.name, item])).values());
    return unique.filter(item => item.name.toLowerCase().includes(q)).slice(0, 5);
  }, [searchQuery, foodHistory, foodFavorites]);

  const logout = useCallback(() => {
  // Local logout + (if present) server session logout
  void (async () => {
    if (googleMe?.sub) {
      try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
    }
  })();

  setGoogleMe(null);
  setCurrentUser(null);
  setProfileSyncState('idle');
  setLastProfileSyncAt(null);
  setAuthState('auth_choice');
  localStorage.removeItem('fitfocus_last_user_id');
}, [googleMe?.sub]);


const deleteAccount = useCallback(async () => {
  if (!googleMe?.sub) return;
  const typed = (prompt('Чтобы удалить аккаунт, введите слово DELETE (латиницей).') || '').trim().toUpperCase();
  if (typed !== 'DELETE') return;

  try {
    const r = await fetch('/api/account/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => null);
      alert(j?.error ? `Ошибка удаления: ${j.error}` : 'Не удалось удалить аккаунт.');
      return;
    }
  } catch {
    alert('Не удалось удалить аккаунт (network).');
    return;
  }

  // After delete the cookie is cleared server-side; also clear UI state
  logout();
}, [googleMe?.sub, logout]);

  const loginAsUser = useCallback(async (user: UserProfile) => {
    const userWithResetUsage = resetUsageIfNewTime(user);

    // Server-driven hydration for cross-device: load KV blobs from D1, fallback to local cache.
    const prefix = `fitfocus_data_${user.id}_`;
    let kv: Record<string, string> = {};
    try {
      const r = await fetch(`/api/state?prefix=${encodeURIComponent(prefix)}`, { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        for (const it of items) {
          if (it?.key && typeof it.value === 'string') {
            kv[it.key] = it.value;
            try { localStorage.setItem(it.key, it.value); } catch {}
          }
        }
      }
    } catch {}

    const readKV = <T,>(suffix: string, fallback: T): T => {
      const fullKey = prefix + suffix;
      const raw = kv[fullKey] ?? localStorage.getItem(fullKey);
      if (!raw) return fallback;
      try { return JSON.parse(raw) as T; } catch { return fallback; }
    };

    const storedDiaryRaw: FoodItem[] = readKV('diary', []);
    // Keep only thumbnails in memory to avoid huge payloads
    const storedDiary: FoodItem[] = (storedDiaryRaw || []).map((it: any) => {
      if (!it || typeof it !== 'object') return it;
      const copy: any = { ...it };
      if (typeof copy.photo === 'string') delete copy.photo;
      if (typeof copy.photoThumb === 'string' && copy.photoThumb.length > 120_000) delete copy.photoThumb;
      return copy;
    });

    const storedHabits: UserHabit[] = readKV('habits', INITIAL_HABITS);
    const userWithTask = await createTask(userWithResetUsage, storedDiary, storedHabits);

    const userWithOffsets: UserProfile = { 
      ...userWithTask, 
      lossDeficit: userWithTask.lossDeficit ?? DEFAULT_DEFICIT, 
      gainSurplus: userWithTask.gainSurplus ?? DEFAULT_SURPLUS 
    };

    setCurrentUser(userWithOffsets);
    setFoodDiary(storedDiary);
    setHabits(storedHabits);
    setFoodHistory(readKV('history', []));
    setFoodFavorites(readKV('favorites', []));
    setCoachCard(readKV('last_coach_card', null));
    setCurrentLesson(pickLessonForToday(userWithTask));
    setAuthState('app');
    setProfileSyncState('saved');
    setLastProfileSyncAt(Date.now());
  }, [resetUsageIfNewTime]);


  const suppressNextFullProfileSyncRef = useRef(false);

  const pushProfileToCloud = useCallback(async (profile: UserProfile) => {
    setProfileSyncState('saving');
    try {
      const r = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!r.ok) throw new Error('PROFILE_SYNC_FAILED');
      setProfileSyncState('saved');
      setLastProfileSyncAt(Date.now());
    } catch {
      setProfileSyncState('error');
    }
  }, []);

  const patchProfileInCloud = useCallback(async (patch: Partial<UserProfile>) => {
    if (!currentUser) return;

    const nextUser = { ...currentUser, ...patch } as UserProfile;
    suppressNextFullProfileSyncRef.current = true;
    persistUser(nextUser);

    setProfileSyncState('saving');
    try {
      const r = await fetch('/api/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error('PROFILE_PATCH_FAILED');
      const payload = await r.json().catch(() => null);
      const serverProfile = payload?.profile as UserProfile | undefined;
      if (serverProfile) {
        suppressNextFullProfileSyncRef.current = true;
        persistUser(serverProfile);
      }
      setProfileSyncState('saved');
      setLastProfileSyncAt(Date.now());
    } catch {
      setProfileSyncState('error');
    }
  }, [currentUser, persistUser]);

  const syncAllLocalDataNow = useCallback(async () => {
    if (!currentUser) return;
    const prefix = `fitfocus_data_${currentUser.id}_`;
    const items: { key: string; value: string }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!k.startsWith(prefix) && !k.startsWith(`fitfocus_council_history_${currentUser.id}`)) continue;
        const v = localStorage.getItem(k);
        if (typeof v === 'string') items.push({ key: k, value: v });
      }
      if (items.length) {
        await fetch('/api/state', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });
      }
      await pushProfileToCloud(currentUser);
    } catch {
      setProfileSyncState('error');
    }
  }, [currentUser, pushProfileToCloud]);

  const reloadUserFromCloud = useCallback(async () => {
    if (!currentUser) return;
    try {
      const pr = await fetch('/api/profile', { credentials: 'include' });
      if (!pr.ok) throw new Error('PROFILE_LOAD_FAILED');
      const pj = await pr.json();
      const profile = pj?.profile as UserProfile | null;
      if (!profile) return;
      await loginAsUser(profile);
      setAllUsers([profile]);
      safeSetItem('fitfocus_all_users', JSON.stringify([profile]));
      setProfileSyncState('saved');
      setLastProfileSyncAt(Date.now());
    } catch {
      setProfileSyncState('error');
    }
  }, [currentUser, loginAsUser]);

  // Server-driven: persist profile changes to D1 (debounced)
  const profileSaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    if (suppressNextFullProfileSyncRef.current) {
      suppressNextFullProfileSyncRef.current = false;
      return;
    }
    if (profileSaveTimer.current) window.clearTimeout(profileSaveTimer.current);
    profileSaveTimer.current = window.setTimeout(async () => {
      await pushProfileToCloud(currentUser);
    }, 500);
  }, [currentUser, pushProfileToCloud]);

  const deltaDays = useMemo(() => {
    if (!currentUser || (currentUser.weightHistory ?? []).length < 2) return 1;
    const log = currentUser.weightHistory ?? [];
    const first = log[0];
    const last = log[log.length - 1];
    const days = Math.floor((new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000);
    // показываем «дельту» за доступный период, но не больше 14 дней
    return Math.max(1, Math.min(14, isFinite(days) ? days : 1));
  }, [currentUser]);

  const weightDeltaN = useMemo(() => {
    if (!currentUser || (currentUser.weightHistory ?? []).length < 2) return 0;
    const log = currentUser.weightHistory ?? [];
    const now = log[log.length - 1];
    const ms = deltaDays * 86400000;
    const past = log
      .slice()
      .reverse()
      .find(e => new Date(now.date).getTime() - new Date(e.date).getTime() >= ms);
    return past ? (now.weight - past.weight) : (now.weight - log[0].weight);
  }, [currentUser, deltaDays]);

  const expectedN = useMemo(() => {
    if (!currentUser) return 0;
    if (currentUser.goal === Goal.LOSS) return (-(Number(currentUser.lossDeficit ?? DEFAULT_DEFICIT)) * deltaDays) / 7700;
    if (currentUser.goal === Goal.GAIN) return ((Number(currentUser.gainSurplus ?? DEFAULT_SURPLUS)) * deltaDays) / 7700;
    return 0;
  }, [currentUser, deltaDays]);

  const compliancePct = useMemo(() => {
    if (!currentUser) return 0;
    const now = Date.now();
    const last7 = foodDiary.filter(f => (now - new Date(f.timestamp).getTime()) <= 7 * 86400000);
    if (!last7.length) return 0;
    const dayKey = (iso?: string) => (iso ?? "").slice(0, 10);
    const sums: Record<string, number> = {};
    for (const f of last7) sums[dayKey(f.timestamp)] = (sums[dayKey(f.timestamp)] ?? 0) + (f.calories ?? 0);
    const days = Object.keys(sums);
    const okDays = days.filter(d => sums[d] <= (targets.calories || 1) * 1.1).length;
    const dietScore = okDays / Math.max(1, days.length);
    const habitScore = (habits.filter(h => h.current >= h.goal).length) / Math.max(1, habits.length);
    return Math.round((dietScore * 0.6 + habitScore * 0.4) * 100);
  }, [currentUser, foodDiary, habits, targets.calories]);

  const adaptationIndex = useMemo(() => {
    if (!currentUser) return 0;
    if (currentUser.goal === Goal.MAINTAIN) return 0;
    const exp = expectedN;
    if (exp === 0) return 0;
    const actual = weightDeltaN;
    const progress = currentUser.goal === Goal.LOSS
      ? Math.min(1, Math.max(0, (Math.abs(actual) / Math.abs(exp))))
      : Math.min(1, Math.max(0, (actual / exp)));
    const idx = Math.round((1 - progress) * 100);
    return Math.max(0, Math.min(100, idx));
  }, [currentUser, expectedN, weightDeltaN]);

  const adaptationStatus = useMemo(() => {
    if (!currentUser) return { label: '—', color: 'text-slate-400', level: 'none' as const };
    if (currentUser.goal === Goal.MAINTAIN) return { label: 'Поддержание', color: 'text-slate-300', level: 'none' as const };
    if (adaptationIndex < 35) return { label: 'Низкая', color: 'text-emerald-300', level: 'low' as const };
    if (adaptationIndex < 70) return { label: 'Средняя', color: 'text-amber-300', level: 'mid' as const };
    return { label: 'Высокая', color: 'text-rose-300', level: 'high' as const };
  }, [currentUser, adaptationIndex]);

  const refeedSuggestion = useMemo(() => {
    if (!currentUser) return { type: 'stay' as const };
    if (currentUser.goal !== Goal.LOSS) return { type: 'stay' as const };
    if (compliancePct < 70) return { type: 'stay' as const };
    if (adaptationIndex >= 70) return { type: 'refeed' as const, caloriesTomorrow: targets.calories + 300 };
    if (adaptationIndex >= 45) return { type: 'adjust' as const, stepsExtra: 2000 };
    return { type: 'stay' as const };
  }, [currentUser, compliancePct, adaptationIndex, targets.calories]);

  const scheduleRefeedTomorrow = useCallback(() => {
    if (!currentUser) return;
    const d = new Date(); d.setDate(d.getDate() + 1);
    const key = `ff_refeed_${currentUser.id}`;
    const value = d.toISOString().slice(0, 10);
    localStorage.setItem(key, value);
    setRefeedDate(value);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const key = `ff_refeed_${currentUser.id}`;
    setRefeedDate(localStorage.getItem(key));
  }, [currentUser?.id]);

  const checkLimit = useCallback((type: keyof typeof PREMIUM_GATES) => {
    if (!currentUser) return false;
    const usage = currentUser.usage || {};
    if (type === 'aiFoodPhotoPerDay') return (usage.aiFoodPhotoCount || 0) < (PREMIUM_GATES.aiFoodPhotoPerDay[paywall.plan as 'free'] || 3);
    if (type === 'aiCoachAdvicePerDay') return (usage.aiCoachCount || 0) < (PREMIUM_GATES.aiCoachAdvicePerDay[paywall.plan as 'free'] || 1);
    return !!(PREMIUM_GATES[type] as any)[paywall.plan];
  }, [currentUser, paywall.plan]);

  const incrementUsage = useCallback((key: keyof UsageStats) => {
    if (!currentUser) return;
    const nextUsage = { ...currentUser.usage, [key]: (Number(currentUser.usage?.[key as keyof UsageStats]) || 0) + 1 };
    persistUser({ ...currentUser, usage: nextUsage });
  }, [currentUser, persistUser]);

  const addFoodToDiary = useCallback((item: FastLogItem) => {
    if (!currentUser) return;
    const ts = (item as any).timestamp ?? new Date().toISOString();
    // Keep photo in UI state (so user sees it immediately), but strip it from persisted localStorage payload to avoid quota issues.
    const entryForState: any = { ...item, id: Date.now().toString(), timestamp: ts, mealType: (item as any).mealType ?? inferMealType(ts) };
    const stripForStorage = (e: any) => {
      const out: any = { ...e };
      if (typeof out.photo === 'string') delete out.photo;
      if (typeof out.photoThumb === 'string' && out.photoThumb.length > 120_000) delete out.photoThumb;
      return out;
    };
    const entryForStorage = stripForStorage(entryForState);

    // Use functional update so rapid consecutive adds (e.g. multiple scans)
    // don't overwrite previous entries because of stale closures.
    setFoodDiary((prev) => {
      const prevArr = prev || [];
      const nextState = [entryForState, ...prevArr].slice(0, MAX_DIARY_ITEMS);
      const nextStorage = [entryForStorage, ...prevArr.map(stripForStorage)].slice(0, MAX_DIARY_ITEMS);
      safeSetItem(`fitfocus_data_${currentUser.id}_diary`, JSON.stringify(nextStorage));
      return nextState;
    });
    const historyItem = { ...item };
    delete historyItem.photo;
    if (historyItem.insight) delete historyItem.insight.recipe;
    const newHistory = [historyItem, ...foodHistory.filter(h => h.name !== item.name)].slice(0, MAX_HISTORY_ITEMS);
    setFoodHistory(newHistory);
    safeSetItem(`fitfocus_data_${currentUser.id}_history`, JSON.stringify(newHistory));
    return entryForState;
  }, [foodHistory, currentUser]);
  const updateFoodEntry = useCallback((id: string, patch: Partial<FoodItem>) => {
    if (!currentUser) return;
    const next = foodDiary.map(it => (it.id === id ? { ...it, ...patch } : it));
    setFoodDiary(next);
    safeSetItem(`fitfocus_data_${currentUser.id}_diary`, JSON.stringify(next));
  }, [foodDiary, currentUser]);

  const deleteFoodPhoto = useCallback((id: string) => {
    updateFoodEntry(id, { photo: undefined, photoThumb: undefined });
  }, [updateFoodEntry]);

  const deleteFoodEntry = useCallback((id: string) => {
    if (!currentUser) return;
    setFoodDiary((prev) => {
      const next = (prev || []).filter(it => it.id !== id);
      safeSetItem(`fitfocus_data_${currentUser.id}_diary`, JSON.stringify(next));
      return next;
    });
  }, [currentUser]);

  const handleToggleHabit = useCallback((habitKey: 'water' | 'steps' | 'breakfast' | 'sleep') => {
    if (!currentUser) return;
    const updatedUser = toggleHabit(currentUser, habitKey);
    persistUser(updatedUser);
    const legacyMap: Record<string, string> = { water: 'h_water', steps: 'h_steps', breakfast: 'h_veg', sleep: 'h_sleep' };
    const lid = legacyMap[habitKey];
    if (lid) {
      const isDone = updatedUser.dailyHabits?.[getTodayKey()]?.[habitKey];
      const nextHabits = habits.map(h => h.id === lid ? { ...h, current: isDone ? h.goal : 0 } : h);
      setHabits(nextHabits);
    }
  }, [currentUser, habits, persistUser]);

  const handleToggleTask = useCallback((taskDate: string) => {
    if (!currentUser || !currentUser.tasks) return;
    const nextTasks = currentUser.tasks.map(t => t.date === taskDate ? { ...t, completed: !t.completed } : t);
    persistUser({ ...currentUser, tasks: nextTasks });
  }, [currentUser, persistUser]);

  const exportShortPdf = useCallback(async () => {
    if (!currentUser) return;
    const { downloadShortHealthReportPdf } = await import('./pdf');
    await downloadShortHealthReportPdf({ user: currentUser, targets, foodDiary, habits });
  }, [currentUser, targets, foodDiary, habits]);

  const exportDetailedPdf = useCallback(async () => {
    if (!currentUser) return;
    const { downloadDetailedHealthReportPdf } = await import('./pdf');
    await downloadDetailedHealthReportPdf({ user: currentUser, targets, foodDiary, habits, includeMealLog: pdfIncludeMealLog });
  }, [currentUser, targets, foodDiary, habits, pdfIncludeMealLog]);

  const bootstrapAuth = useCallback(async () => {
    // 1) Пробуем серверную сессию (ff_session cookie)
    let me: any = null;
    try {
      const r = await fetch('/api/me', { credentials: 'include' });
      if (r.ok) me = await r.json();
    } catch {}

    const serverUser = me?.user || null;
    const hasServerAccess = me?.hasAccess !== false;
    setGoogleMe(serverUser);

    if (serverUser?.sub && requireInvite && !hasServerAccess) {
      setInviteError('Для доступа к закрытой бете нужен действующий код приглашения. Введите код и повторите вход через Google.');
      setAuthState('auth_choice');
      return;
    }

    // 2) Server-driven: load profile from D1 (independent of device)
    if (serverUser?.sub) {
      try {
        const pr = await fetch('/api/profile', { credentials: 'include' });
        if (pr.ok) {
          const pj = await pr.json();
          const profile = pj?.profile || null;

          if (profile) {
            setAllUsers([profile]);
            void loginAsUser(profile);
            return;
          }

          // profile missing -> go onboarding
          setRegData(prev => ({ ...prev, name: serverUser?.name || prev.name }));
          setAuthState('register');
          return;
        }
      } catch {}

      // if profile fetch failed, still show register with name
      setRegData(prev => ({ ...prev, name: serverUser?.name || prev.name }));
      setAuthState('register');
      return;
    }

// No server session -> restore local profiles or show profile chooser
try {
  const raw = localStorage.getItem('fitfocus_all_users');
  const all = raw ? (JSON.parse(raw) as any[]) : [];
  const lastId = localStorage.getItem('fitfocus_last_user_id');
  if (Array.isArray(all) && all.length > 0) {
    setAllUsers(all);
    const last = lastId ? all.find((u) => String(u?.id) === String(lastId)) : null;
    if (last) {
      void loginAsUser(last);
      return;
    }
  }
} catch {}

setAuthState('auth_choice');
  }, [loginAsUser]);

  useEffect(() => {
    void bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    if (!googleMe?.sub || !currentUser) return;
    const syncFromCloud = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      void reloadUserFromCloud();
    };
    window.addEventListener('online', syncFromCloud);
    document.addEventListener('visibilitychange', syncFromCloud);
    return () => {
      window.removeEventListener('online', syncFromCloud);
      document.removeEventListener('visibilitychange', syncFromCloud);
    };
  }, [googleMe?.sub, currentUser?.id, reloadUserFromCloud]);

  // Load public env flags (no auth)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/env', { credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json().catch(() => null);
        if (j && typeof j.requireInvite === 'boolean') setRequireInvite(!!j.requireInvite);
      } catch {}
    })();
  }, []);

  const ensureInviteOk = useCallback(async (): Promise<boolean> => {
    if (!requireInvite) return true;
    const code = String(inviteCode || '').trim();
    if (!code) {
      setInviteError('Введите код приглашения для доступа к бете.');
      return false;
    }
    setInviteChecking(true);
    setInviteError(null);
    try {
      const r = await fetch(`/api/invite/validate?code=${encodeURIComponent(code)}`, { credentials: 'include' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.valid) {
        setInviteError('Код приглашения недействителен или уже использован.');
        return false;
      }
      return true;
    } catch {
      setInviteError('Не удалось проверить код приглашения. Проверьте сервер.');
      return false;
    } finally {
      setInviteChecking(false);
    }
  }, [requireInvite, inviteCode]);

  const startLocalRegistration = useCallback(async () => {
    const ok = await ensureInviteOk();
    if (!ok) return;
    setAuthState('register');
  }, [ensureInviteOk]);




  const processPhotoFiles = useCallback(async (files: File[]) => {
    if (!files.length || !currentUser) return;

    // Paywall check once per batch
    if (!checkLimit('aiFoodPhotoPerDay')) return paywall.openPaywall();

    setIsScanning(true);
    try {
      for (const file of files) {
        const { dataUrl: photo, thumbUrl: photoThumb, base64 } = await compressFoodPhoto(file);
        const result = await analyzeFoodPhoto(base64);
        if (!result) continue;

        const insight: FoodInsight = {
          calories: result.calories,
          macros: { protein: result.protein, fat: result.fat, carbs: result.carbs },
          ingredients: Array.isArray(result.ingredients) ? result.ingredients : [],
          notes: Array.isArray(result.notes) ? result.notes : []
        };

        const newEntry = addFoodToDiary({ ...result, photo, photoThumb, insight });
        if (newEntry) setInsightModal({ id: newEntry.id, photo, name: result.name, insight });
        incrementUsage('aiFoodPhotoCount');
      }
    } catch (err) {
      console.error(err);
    }
    finally {
      setIsScanning(false);
    }
  }, [currentUser, addFoodToDiary, checkLimit, incrementUsage, paywall]);

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await processPhotoFiles(files);
    // allow uploading the same file again
    try { e.target.value = ''; } catch {}
  }, [processPhotoFiles]);

const logWeight = useCallback(() => {
    if (!currentUser || !newWeight) return;
    const nextWeight = parseFloat(newWeight);
    const updatedUser = addWeight(currentUser, nextWeight);
    persistUser(updatedUser);
    setNewWeight('');
  }, [currentUser, newWeight, persistUser]);

  const handleGetCoachAdvice = async () => {
    if (!currentUser) return;
    if (!checkLimit('aiCoachAdvicePerDay')) return paywall.openPaywall();
    // Remember last action for "Retry" button
    setLastAiAction({ feature: 'coach_advice', type: 'coach', userId: currentUser.id });
    setCoachLoading(true);
    try {
      const todayKey = getTodayKey();
      const todayHabits = currentUser.dailyHabits?.[todayKey] || {};
      const habitsDone = Object.values(todayHabits).filter(Boolean).length;
      const advice = await getCoachAdvice({
        user: { name: currentUser.name, goal: currentUser.goal, caloriesTarget: targets.calories, proteinTarget: targets.protein, fatTarget: targets.fat, carbsTarget: targets.carbs, adaptationMultiplier: currentUser.adaptationMultiplier },
        today: { calories: dailyStats.calories, protein: dailyStats.protein, fat: dailyStats.fat, carbs: dailyStats.carbs, habitsDone, habitsTotal: 4 }
      });
      setCoachCard(advice); incrementUsage('aiCoachCount');
      safeSetItem(`fitfocus_data_${currentUser.id}_last_coach_card`, JSON.stringify(advice));
    } catch (e) { console.error(e); } finally { setCoachLoading(false); }
  };

  const handleAiRetry = useCallback(async (opts?: { force?: boolean }) => {
    const last = (() => { try { return getLastAiAction(); } catch { return null; } })();
    
    // Clear cooldown/throttle and potentially proceed
    const canRun = allowAiRetryNow(last?.feature, opts);
    if (!canRun) return;

    if (!last || !currentUser) return;

    if (last.type === 'coach') {
      await handleGetCoachAdvice();
      return;
    }

    if (last.type === 'plan') {
      try {
        const aiPlan = await generatePersonalPlan(currentUser);
        persistUser({ ...currentUser, aiPlan });
      } catch (e) {
        console.error(e);
      }
      return;
    }

    if (last.type === 'plateau') {
      setAdaptLoading(true);
      try {
        const txt = await generatePlateauExplanation({
          name: currentUser.name,
          goal: currentUser.goal,
          compliancePct,
          weightDeltaN,
          expectedN,
          adaptationIndex,
          suggestion: refeedSuggestion,
        });
        setAdaptNote(txt);
      } catch (e) {
        console.error(e);
      } finally {
        setAdaptLoading(false);
      }
      return;
    }

    if (last.type === 'wis') {
      if (!weekly) return;
      try {
        aiReportGenerationRef.current = null;
        const weekKey = getWeekKey(new Date());
        const generateAI = async () => {
          aiReportGenerationRef.current = `${currentUser.id}_${weekKey}_${weekly.wis}`;
          setLastAiAction({ feature: 'wis_text', type: 'wis', userId: currentUser.id });
          // FIX: getWeeklyIntelligenceInterpretation is now correctly imported
          return await getWeeklyIntelligenceInterpretation({
            name: currentUser.name,
            goal: currentUser.goal,
            wis: weekly.wis,
            status: weekly.status,
            weightDelta7: weekly.weightDelta7,
            weightDelta30: weekly.weightDelta30,
            compliancePct: weekly.compliance,
            adaptationIndex: weekly.adaptationIndex,
            calorieTarget: targets.calories,
            macros: { protein: targets.protein, fat: targets.fat, carbs: targets.carbs },
          });
        };
        await ensureWeeklyReportWithAI(currentUser.id, weekly, generateAI);
        setWeeklyReports(loadWeeklyReports(currentUser.id));
      } catch (e) {
        console.error(e);
      }
      return;
    }
  }, [currentUser, weekly, targets, compliancePct, weightDeltaN, expectedN, adaptationIndex, refeedSuggestion, persistUser, handleGetCoachAdvice]);

  const handleRegister = useCallback(async () => {
    if (allUsers.length >= 5) {
      setPlanError('Лимит Family: максимум 5 профилей на одном устройстве.');
      return;
    }
    // Risk acknowledgement for aggressive intensity (relative to TDEE)
    try {
      // FIX: pass adaptationMultiplier: 1.0 to satisfy PersonLike requirement.
      const tdee = calculateTDEE({ ...regData, adaptationMultiplier: 1.0 });
      if (isFinite(tdee)) {
        const limit = regData.goal === Goal.LOSS ? Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3)) : AGGRESSIVE_SURPLUS;
        const val = regData.goal === Goal.LOSS ? Number((regData as any).lossDeficit ?? DEFAULT_DEFICIT) : Number((regData as any).gainSurplus ?? DEFAULT_SURPLUS);
        const isAggressive = (regData.goal === Goal.LOSS && val > limit) || (regData.goal === Goal.GAIN && val > limit);
        const ack = regData.goal === Goal.LOSS ? (regData as any).riskAckLoss : (regData as any).riskAckGain;
        if (isAggressive && !ack) {
          setPlanError('Для выбранной интенсивности требуется подтверждение «Я понимаю риски».');
          return;
        }
      }
    } catch {}
    if (!regNameValid) return;
    setPlanError(null);
    const safeName = regData.name.trim();
    let newUser: UserProfile = {
      id: `user-${Date.now()}`, 
      name: safeName.length ? safeName : 'Пользователь', 
      email: googleMe?.email,
      googleSub: googleMe?.sub,
      picture: googleMe?.picture,
      gender: regData.gender, 
      weight: Math.max(0, regData.weight || 0), 
      height: Math.max(0, regData.height || 0), 
      age: Math.max(0, Math.floor(regData.age || 0)), 
      activityLevel: regData.activityLevel, 
      goal: regData.goal, 
      targetWeight: regData.targetWeight, 
      adaptationMultiplier: 1.0, 
      familyMembers: [], 
      exclusions: '', 
      lossDeficit: Number(regData.lossDeficit ?? DEFAULT_DEFICIT), 
      gainSurplus: Number(regData.gainSurplus ?? DEFAULT_SURPLUS), 
      riskAcknowledgedLoss: !!(regData as any).riskAckLoss,
      riskAcknowledgedGain: !!(regData as any).riskAckGain,
      // Store as YYYY-MM-DD to keep charts/labels clean (avoid showing time parts)
      weightHistory: [{ date: new Date().toISOString().slice(0, 10), weight: regData.weight }], 
      tasks: [], 
      plan: regData.plan
    };
    setDevPlanOverride(regData.plan);
    try {
      setLastAiAction({ feature: 'personal_plan', type: 'plan', userId: newUser.id });
      const aiPlan = await generatePersonalPlan(newUser);
      newUser = { ...newUser, aiPlan };
    } catch (e) { setPlanError("Не удалось создать AI-план. Используем базовый план."); }
    // Server-driven: persist profile to D1
    try {
      const r = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      if (r.ok) {
        const pj = await r.json();
        if (pj?.profile) newUser = pj.profile;
      }
    } catch {}


    // Closed beta: redeem invite only for authenticated Google sessions.
    if (requireInvite && googleMe?.sub) {
      const code = String(inviteCode || '').trim();
      if (!code) {
        setPlanError('Требуется код приглашения.');
        return;
      }
      try {
        const rr = await fetch('/api/invite/redeem', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const rj = await rr.json().catch(() => null);
        if (!rr.ok || rj?.ok !== true) {
          setPlanError(rj?.error === 'INVITE_INVALID' ? 'Код приглашения недействителен или уже использован.' : 'Не удалось активировать приглашение.');
          return;
        }
      } catch {
        setPlanError('Не удалось связаться с сервером для проверки приглашения.');
        return;
      }
    }


    setAllUsers([newUser]);
    await loginAsUser(newUser);
    setActiveTab('plan');
    setPlanIntroOpen(true);
  }, [regData, loginAsUser, regNameValid, allUsers.length, requireInvite, inviteCode]);

  const handleActivateWithTransition = useCallback(() => {
    if (!regNameValid || isActivatingPlan) return;
    setActivationStep(0); setIsActivatingPlan(true);
    if (activationIntervalRef.current) window.clearInterval(activationIntervalRef.current);
    activationIntervalRef.current = window.setInterval(() => {
      setActivationStep((s) => Math.min(s + 1, ACTIVATION_STEPS.length - 1));
    }, ACTIVATION_STEP_MS);
    if (activationTimerRef.current) window.clearTimeout(activationTimerRef.current);
    activationTimerRef.current = window.setTimeout(async () => {
      if (activationIntervalRef.current) window.clearInterval(activationIntervalRef.current);
      activationIntervalRef.current = null; activationTimerRef.current = null;
      await handleRegister(); setIsActivatingPlan(false);
    }, ACTIVATION_TOTAL_MS);
  }, [handleRegister, regNameValid, isActivatingPlan, ACTIVATION_STEPS.length, ACTIVATION_STEP_MS, ACTIVATION_TOTAL_MS]);

  useEffect(() => {
    return () => {
      if (activationIntervalRef.current) window.clearInterval(activationIntervalRef.current);
      if (activationTimerRef.current) window.clearTimeout(activationTimerRef.current);
    };
  }, []);

  const handleMarkLessonRead = useCallback(() => {
    if (!currentUser || !currentLesson) return;
    const progress = currentUser.courseProgress || { completedLessonIds: [], streak: 0 };
    if (progress.completedLessonIds.includes(currentLesson.id)) return setIsLessonViewOpen(false);
    const todayStr = new Date().toLocaleDateString('en-CA');
    const nextProgress = {
      completedLessonIds: [...progress.completedLessonIds, currentLesson.id],
      lastLessonDate: todayStr,
      lastLessonId: currentLesson.id,
      streak: (progress.streak || 0) + 1
    };
    persistUser({ ...currentUser, courseProgress: nextProgress });
    if (currentLesson.quiz) setIsQuizActive(true);
    else setIsLessonViewOpen(false);
  }, [currentUser, currentLesson, persistUser]);

  const handleQuizSubmit = useCallback(() => {
    if (!currentUser || !currentLesson || !selectedQuizOption) return;
    const newAnswer = { lessonId: currentLesson.id, optionId: selectedQuizOption.id, date: new Date().toLocaleDateString('en-CA') };
    persistUser({ ...currentUser, lessonQuizAnswers: [...(currentUser.lessonQuizAnswers || []), newAnswer] });
    setIsQuizActive(false); setIsLessonViewOpen(false); setSelectedQuizOption(null);
  }, [currentUser, currentLesson, selectedQuizOption, persistUser]);

  const todayTask = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return currentUser?.tasks?.find(t => t.date === today);
  }, [currentUser]);

  const plateau = useMemo(() => currentUser ? detectPlateau(currentUser) : false, [currentUser]);

  const aiBadge = useMemo(() => {
    const s = aiStatus;
    const now = Date.now();
    const cooling = (s?.cooldownUntil ?? 0) > now;

    if (!s) {
      return { label: 'AI: готов', cls: 'bg-slate-800/60 text-slate-300 border-slate-700', title: 'AI готов к работе' };
    }

    if (cooling) {
      return {
        label: 'AI: пауза',
        cls: 'bg-amber-500/10 text-amber-200 border-amber-500/20',
        title: `AI временно ограничен (квота/лимит). Используется кэш/фолбэк до ${new Date(s.cooldownUntil || now).toLocaleTimeString()}`
      };
    }

    if (s.source.includes('cooldown')) {
      return { label: 'AI: кэш', cls: 'bg-amber-500/10 text-amber-200 border-amber-500/20', title: s.reason || 'Используется кэш из-за лимитов' };
    }
    if (s.source === 'cache') {
      return { label: 'AI: кэш', cls: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/20', title: 'Показывается ранее сгенерированный результат' };
    }
    if (s.source === 'fallback') {
      return { label: 'AI: офлайн', cls: 'bg-rose-500/10 text-rose-200 border-rose-500/20', title: s.reason || 'AI недоступен, используется локальный совет' };
    }
    if (s.source === 'error') {
      return { label: 'AI: ошибка', cls: 'bg-rose-500/10 text-rose-200 border-rose-500/20', title: s.reason || 'Ошибка AI' };
    }
    return { label: 'AI: online', cls: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20', title: 'AI отвечает в реальном времени' };
  }, [aiStatus]);

  const retryMeta = useMemo(() => {
    const cooling = (aiStatus?.cooldownUntil ?? 0) > Date.now();
    const typeLabel = !lastAiAction ? '' : (lastAiAction.type === 'coach' ? 'Coach' : lastAiAction.type === 'plan' ? 'Plan' : lastAiAction.type === 'plateau' ? 'Plateau' : 'WIS');
    const label = lastAiAction ? `Retry: ${typeLabel}` : 'Retry';
    const title = !lastAiAction
      ? 'Нет действия для повтора'
      : (cooling ? 'AI сейчас на паузе из-за квоты. Используйте Force, если понимаете риск.' : 'Повторить последнее действие AI');
    return { cooling, label, title };
  }, [aiStatus, lastAiAction]);

  if (authState === 'loading') return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>;

  if (authState === 'auth_choice') return (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-left">
    <div className="max-w-md w-full space-y-8 text-center">
      <div className="flex justify-center">
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-[2rem] flex items-center justify-center text-white font-bold text-3xl shadow-xl shadow-indigo-950/50">
          FF
        </div>
      </div>
      <h1 className="text-3xl font-black text-slate-100 tracking-tight">FitFocus</h1>

      <div className="grid gap-4">
        {allUsers.map(user => (
          <div
            key={user.id}
            onClick={() => void loginAsUser(user)}
            className="flex items-center gap-4 p-5 bg-slate-900 rounded-[2rem] border border-slate-800 shadow-xl hover:bg-slate-800 transition-all text-left group cursor-pointer"
          >
            <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center bg-indigo-500/10 group-hover:bg-indigo-600 transition-all">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-indigo-400 font-bold text-2xl group-hover:text-white transition-all">{user.name[0].toUpperCase()}</span>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-bold text-slate-100 text-lg">{user.name}</p>
                {user.googleSub ? (
                  <img src="/google-g.svg" alt="Google" title="Профиль Google" className="w-4 h-4 opacity-90" />
                ) : null}
              </div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-widest tabular-nums">
                {user.weight} кг · {user.plan || 'Free'}
              </p>
            </div>

            <button
              type="button"
              className="p-3 rounded-xl hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 transition-all"
              title="Удалить локальный профиль"
              onClick={(e) => {
                e.stopPropagation();
                const ok = confirm(`Удалить локальный профиль "${user.name || 'Профиль'}"? Данные восстановить нельзя.`);
                if (ok) deleteUserProfile(user.id);
              }}
            >
              <Trash2 size={20} />
            </button>

            <LogIn size={20} className="text-slate-600 group-hover:text-indigo-400 shrink-0" />
          </div>
        ))}

        
        <div className="space-y-2 text-left">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Код приглашения (beta)</label>
          <input
            value={inviteCode}
            onChange={(e) => {
              const v = e.target.value;
              setInviteCode(v);
              try { localStorage.setItem('fitfocus_invite_code', v); } catch {}
              setInviteError(null);
            }}
            placeholder={requireInvite ? "Обязательно для входа" : "Опционально"}
            className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/40"
          />
          {requireInvite ? (
            <p className="text-[10px] text-slate-500">Закрытая бета: без кода приглашения профиль создать нельзя.</p>
          ) : null}
          {inviteError ? <p className="text-[11px] text-rose-400 font-semibold">{inviteError}</p> : null}
        </div>

<div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => void startLocalRegistration()}
            disabled={allUsers.length >= 5 || inviteChecking}
            className="flex items-center justify-center gap-2 p-5 border-2 border-dashed border-slate-800 rounded-[2rem] text-slate-500 hover:text-indigo-400 hover:border-indigo-900 transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={20} /> {allUsers.length >= 5 ? 'Лимит профилей (5)' : 'Создать профиль'}
          </button>

          <div className="flex items-center justify-center p-5 border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-900/40">
            <GoogleSignInButton onAuthed={() => void bootstrapAuth()} inviteCode={inviteCode} width={180} size="medium" text="continue_with" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

if (authState === 'register') return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden text-left">
      {/* Premium backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-28 w-[560px] h-[560px] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_55%)]" />
      </div>

      {/* Modal overlay */}
      <div className="fixed inset-0 bg-black/55 backdrop-blur-md" />

      {/* Cinematic AI activation overlay */}
      {isActivatingPlan && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-2xl flex items-center justify-center p-4">
          <div className="w-full max-w-[560px] rounded-[2.5rem] border border-indigo-500/20 bg-gradient-to-b from-slate-950/80 to-slate-950/55 shadow-2xl shadow-indigo-950/40 overflow-hidden">
            <div className="h-[6px] bg-gradient-r from-indigo-500/0 via-indigo-400/50 to-violet-400/0" />
            <div className="p-7 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600/15 border border-indigo-500/25 grid place-items-center">
                    {React.createElement(ACTIVATION_STEPS[activationStep]?.icon ?? Sparkles, { size: 18, className: "text-indigo-300" })}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">AI Инициализация</p>
                    <p className="text-base sm:text-lg font-black text-white truncate">{ACTIVATION_STEPS[activationStep]?.title ?? 'AI анализирует…'}</p>
                    <p className="text-sm font-semibold text-slate-400 mt-0.5">{ACTIVATION_STEPS[activationStep]?.subtitle ?? 'Подготавливаем персональную стратегию'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200/90 bg-indigo-600/10 border border-indigo-500/20 px-2 py-1 rounded-full">
                    {Math.min(100, Math.round(((activationStep + 1) / ACTIVATION_STEPS.length) * 100))}%
                  </span>
                </div>
              </div>
              <div className="mt-5">
                <div className="h-2 rounded-full bg-slate-900/60 border border-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.35)] transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.round(((activationStep + 1) / ACTIVATION_STEPS.length) * 100))}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>Шаг {Math.min(ACTIVATION_STEPS.length, activationStep + 1)} из {ACTIVATION_STEPS.length}</span>
                  <span className="tabular-nums">{(ACTIVATION_TOTAL_MS / 1000).toFixed(1)}s</span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">BMR</p><p className="mt-1 text-sm font-black text-white tabular-nums">{regBMR || '—'}</p></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">TDEE</p><p className="mt-1 text-sm font-black text-white tabular-nums">{regTDEE || '—'}</p></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">KPI</p><p className="mt-1 text-sm font-black text-white tabular-nums">{regTargets?.calories ?? '—'}</p></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Готово</p><p className="mt-1 text-sm font-black text-indigo-200 flex items-center gap-2"><CheckCircle2 size={16} className="text-indigo-300" /><span className="tabular-nums">{Math.min(100, Math.round(((activationStep + 1) / ACTIVATION_STEPS.length) * 100))}%</span></p></div>
              </div>
              <div className="mt-6 text-xs text-slate-500 font-semibold">Нажимая «Создать AI‑план», вы запускаете персональную модель — можно изменить цель и тариф позже.</div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center p-4">
        <div className="relative w-full md:max-w-4xl bg-slate-900/90 rounded-t-[2.75rem] md:rounded-[3rem] p-6 md:p-10 shadow-2xl space-y-6 border border-slate-800/70 backdrop-blur-xl max-h-[95vh] overflow-y-auto overflow-x-hidden scrollbar-hide">
          <div className="flex justify-center -mt-2 md:hidden mb-4"><div className="w-12 h-1.5 rounded-full bg-slate-700/70" /></div>
        <div className="text-center space-y-3">
          <div className="relative inline-flex w-14 h-14 mx-auto items-center justify-center">
            <div className="absolute inset-0 rounded-[1.25rem] overflow-hidden pointer-events-none"><div className="absolute inset-[-200%] bg-[conic-gradient(from_0deg,transparent_85%,#818cf8_98%,transparent_100%)] animate-spin" style={{ animationDuration: '3s' }} /></div>
            <div className="absolute inset-[2px] bg-slate-900 rounded-[1.1rem] z-0" />
            <div className="relative w-[48px] h-[48px] bg-indigo-600 rounded-[1rem] flex items-center justify-center text-white font-black text-xl shadow-2xl animate-pulse">FF</div>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-100 tracking-tight">Настроим ваш персональный AI‑план</h1>
          <p className="text-[10px] md:text-xs text-slate-400 font-semibold max-w-xs mx-auto">Мы рассчитаем метаболизм, цель и дневные KPI на основе ваших данных.</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-50 uppercase tracking-widest">
            <span className={clsx("w-2 h-2 rounded-full", onboardingStep === 1 ? "bg-indigo-400" : "bg-slate-700")} />
            <span className={clsx("w-2 h-2 rounded-full", onboardingStep === 2 ? "bg-indigo-400" : "bg-slate-700")} />
            <span>Шаг {onboardingStep} из 2</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {onboardingStep === 1 ? (
            <div className="space-y-4 md:col-span-2 max-w-md mx-auto w-full">
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center justify-between p-4 bg-slate-950 rounded-[1.25rem] border border-slate-800"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Вес (кг)</label><input type="number" inputMode="numeric" className="w-20 bg-transparent text-right font-black text-white tabular-nums outline-none text-base" value={regData.weight} onChange={e => setRegData({...regData, weight: Math.max(0, Number(e.target.value) || 0)})} /></div>
                <div className="flex items-center justify-between p-4 bg-slate-950 rounded-[1.25rem] border border-slate-800"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Рост (см)</label><input type="number" inputMode="numeric" className="w-20 bg-transparent text-right font-black text-white tabular-nums outline-none text-base" value={regData.height} onChange={e => setRegData({...regData, height: Math.max(0, Number(e.target.value) || 0)})} /></div>
                <div className="flex items-center justify-between p-4 bg-slate-950 rounded-[1.25rem] border border-slate-800"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Возраст</label><input type="number" inputMode="numeric" className="w-20 bg-transparent text-right font-black text-white tabular-nums outline-none text-base" value={regData.age} onChange={e => setRegData({...regData, age: Math.max(0, Math.floor(Number(e.target.value) || 0))})} /></div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Пол</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ id: Gender.MALE, label: 'Мужской' }, { id: Gender.FEMALE, label: 'Женский' }].map(g => (
                    <button key={g.id} onClick={() => setRegData({...regData, gender: g.id})} className={clsx("w-full p-4 text-center rounded-[1.25rem] border text-xs font-black transition-all", regData.gender === g.id ? 'bg-indigo-600/10 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500')}>{g.label}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Имя профиля</label><input type="text" className={clsx("w-full p-3.5 bg-slate-950 rounded-[1.25rem] border outline-none transition-all font-bold text-white placeholder:text-slate-500 text-sm", !regNameValid ? "border-amber-500/40" : "border-slate-800")} value={regData.name} onChange={e => setRegData(prev => ({...prev, name: e.target.value}))} placeholder="Наталья" /></div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Ваша цель</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {[{ id: Goal.LOSS, label: 'Похудение' }, { id: Goal.MAINTAIN, label: 'Поддержание' }, { id: Goal.GAIN, label: 'Набор' }].map(g => (
                      <button key={g.id} onClick={() => setRegData({...regData, goal: g.id})} className={clsx("w-full p-2.5 text-left rounded-[1rem] border text-xs font-black transition-all", regData.goal === g.id ? "bg-indigo-600/10 border-indigo-500 text-indigo-200" : "bg-slate-950 border-slate-800 text-slate-500")}>
                        <div className="flex items-center justify-between"><span>{g.label}</span>{aiRecommendedGoal === g.id && <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 font-black uppercase tracking-widest">AI Рекомендует</span>}</div>
                      </button>
                    ))}
                  </div>

                  {/* Интенсивность цели (Smart Deficit Engine) */}
                  {(regData.goal === Goal.LOSS || regData.goal === Goal.GAIN) && (
                    <div className="space-y-2 mt-4 p-4 rounded-[1.5rem] bg-slate-950 border border-slate-800 animate-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Интенсивность цели</label>
                        <button
                          type="button"
                          onClick={() => {
                            // FIX: pass adaptationMultiplier: 1.0 to satisfy PersonLike requirement.
                            const tdee = calculateTDEE({ ...regData, adaptationMultiplier: 1.0 });
                            if (!isFinite(tdee)) return;
                            if (regData.goal === Goal.LOSS) {
                              const rec = Math.max(MIN_DEFICIT, Math.min(Math.min(500, Math.round((tdee*0.2)/50)*50), MAX_DEFICIT));
                              setRegData({ ...regData, lossDeficit: rec, riskAckLoss: false });
                            }
                            if (regData.goal === Goal.GAIN) {
                              const rec = Math.max(MIN_SURPLUS, Math.min(Math.min(300, Math.round((tdee*0.1)/50)*50), MAX_SURPLUS));
                              setRegData({ ...regData, gainSurplus: rec, riskAckGain: false });
                            }
                          }}
                          className="text-[10px] font-black px-2 py-1 rounded-full border border-slate-800 bg-slate-950 text-slate-300 hover:border-indigo-500/30"
                        >
                          Рекомендовать
                        </button>
                      </div>
                      {regData.goal === Goal.LOSS ? (
                        <div className="grid grid-cols-3 gap-2">
                          {[250, 500, 750].map(v => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setRegData(prev => ({ ...prev, lossDeficit: v }))}
                              className={clsx(
                                "w-full p-3 text-center rounded-[1rem] border text-[10px] font-black transition-all",
                                Number(regData.lossDeficit || DEFAULT_DEFICIT) === v
                                  ? "bg-rose-600/10 border-rose-500 text-rose-200"
                                  : "bg-slate-900 border-slate-800 text-slate-500 hover:border-rose-500/30"
                              )}
                            >
                              -{v} ккал
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {[150, 300, 500].map(v => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setRegData(prev => ({ ...prev, gainSurplus: v }))}
                              className={clsx(
                                "w-full p-3 text-center rounded-[1rem] border text-[10px] font-black transition-all",
                                Number(regData.gainSurplus || DEFAULT_SURPLUS) === v
                                  ? "bg-emerald-600/10 border-emerald-500 text-emerald-200"
                                  : "bg-slate-900 border-slate-800 text-slate-500 hover:border-rose-500/30"
                              )}
                            >
                              +{v} ккал
                            </button>
                          ))}
                        </div>
                      )}
                      {(() => {
                        const ready = regData.weight && regData.height && regData.age && regData.activityLevel;
                        if (!ready) return null;
                        const tdee = calculateTDEE({
                          gender: regData.gender,
                          weight: Number(regData.weight),
                          height: Number(regData.height),
                          age: Number(regData.age),
                          activityLevel: regData.activityLevel,
                          goal: regData.goal,
                          adaptationMultiplier: 1.0,
                          lossDeficit: Number(regData.lossDeficit ?? DEFAULT_DEFICIT),
                          gainSurplus: Number(regData.gainSurplus ?? DEFAULT_SURPLUS),
                          riskAcknowledgedLoss: !!(regData as any).riskAckLoss,
                          riskAcknowledgedGain: !!(regData as any).riskAckGain,
                        } as any);
                        const off = regData.goal === Goal.LOSS
                          ? Number(regData.lossDeficit ?? DEFAULT_DEFICIT)
                          : regData.goal === Goal.GAIN
                            ? Number(regData.gainSurplus ?? DEFAULT_SURPLUS)
                            : 0;
                        const limit = regData.goal === Goal.LOSS ? Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3)) : AGGRESSIVE_SURPLUS;
                        const tooAggressive = (regData.goal === Goal.LOSS && off > limit) || (regData.goal === Goal.GAIN && off > limit);
                        if (!tooAggressive) return null;
                        return (
                          <div className="mt-2 p-3 rounded-[1rem] bg-amber-500/5 border border-amber-500/20 flex items-start gap-2">
                            <AlertTriangle size={16} className="text-amber-400 mt-0.5" />
                            <div className="text-left text-[11px] text-amber-200 font-semibold leading-snug">
                              Слишком агрессивная интенсивность для вашего TDEE (~{Math.round(tdee)} ккал/день). Рекомендуем не превышать {limit} ккал/день.
                            </div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const ready = regData.weight && regData.height && regData.age && regData.activityLevel;
                        if (!ready) return null;
                        // FIX: pass adaptationMultiplier: 1.0 to satisfy PersonLike requirement.
                        const tdee = calculateTDEE({ ...regData, adaptationMultiplier: 1.0 });
                        if (!isFinite(tdee)) return null;
                        const limit = regData.goal === Goal.LOSS ? Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3)) : AGGRESSIVE_SURPLUS;
                        const val = regData.goal === Goal.LOSS ? Number(regData.lossDeficit ?? DEFAULT_DEFICIT) : Number(regData.gainSurplus ?? DEFAULT_SURPLUS);
                        const isAggressive = (regData.goal === Goal.LOSS && val > limit) || (regData.goal === Goal.GAIN && val > limit);
                        if (!isAggressive) return null;
                        const ackKey = regData.goal === Goal.LOSS ? "riskAckLoss" : "riskAckGain";
                        const ack = (regData as any)[ackKey];
                        return (
                          <label className="mt-2 flex items-start gap-2 p-3 rounded-[1rem] bg-slate-950 border border-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!ack}
                              onChange={(e) => setRegData({ ...regData, [ackKey]: e.target.checked } as any)}
                              className="mt-0.5"
                            />
                            <div className="text-[11px] text-slate-300 font-semibold leading-snug">
                              Я понимаю риски агрессивной интенсивности и хочу продолжить.
                            </div>
                          </label>
                        );
                      })()}
                      <div className="text-[10px] text-slate-600 font-semibold mt-1 px-1">
                        Выбор влияет на прогноз, WIS и «ожидаемое» изменение веса.
                      </div>
                    </div>
                  )}
                </div>

<div className="space-y-2 mt-6">
  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Аллергены и непереносимость</label>
  <div className="p-4 rounded-[1.5rem] bg-slate-950 border border-slate-800 space-y-3">
    <div className="text-xs text-slate-400 font-semibold">
      Эти ограничения будут учитываться при генерации недельного меню (в том числе общего меню на семью).
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {[
        "орехи",
        "молоко/лактоза",
        "яйца",
        "рыба/морепродукты",
        "глютен",
        "соя",
        "арахис",
        "кунжут"
      ].map(tag => {
        const selected = (regData.dietary?.allergens || []).includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => {
              const prev = regData.dietary || { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' };
              const next = selected
                ? prev.allergens.filter(x => x !== tag)
                : [...prev.allergens, tag];
              setRegData(r => ({ ...r, dietary: { ...prev, allergens: next } }));
            }}
            className={clsx(
              "px-3 py-2 rounded-[1rem] border text-xs font-black transition-all text-left",
              selected ? "bg-rose-500/10 border-rose-400/40 text-rose-200" : "bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700"
            )}
          >
            {tag}
          </button>
        );
      })}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Что избегать (непереносимость / предпочтение)</label>
        <input
          type="text"
          value={(regData.dietary?.intolerances || []).join(", ")}
          onChange={(e) => {
            const prev = regData.dietary || { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' };
            const next = e.target.value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
            setRegData(r => ({ ...r, dietary: { ...prev, intolerances: next } }));
          }}
          placeholder="например: лук, чеснок, острое"
          className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Не ем совсем</label>
        <input
          type="text"
          value={(regData.dietary?.excludedFoods || []).join(", ")}
          onChange={(e) => {
            const prev = regData.dietary || { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' };
            const next = e.target.value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
            setRegData(r => ({ ...r, dietary: { ...prev, excludedFoods: next } }));
          }}
          placeholder="например: свинина, грибы"
          className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none transition-all font-bold text-white placeholder:text-slate-600 text-sm"
        />
      </div>
    </div>

    <div className="flex items-center gap-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Строгость</label>
      {[
        { id: "strict", label: "Строго" },
        { id: "avoid", label: "По возможности" }
      ].map(opt => {
        const selected = (regData.dietary?.severity || "strict") === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              const prev = regData.dietary || { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' };
              setRegData(r => ({ ...r, dietary: { ...prev, severity: opt.id as any } }));
            }}
            className={clsx(
              "px-3 py-1.5 rounded-full border text-[10px] font-black transition-all",
              selected ? "bg-indigo-600/10 border-indigo-500/40 text-indigo-200" : "bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  </div>
</div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Тариф</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {[ { id: 'free' as TariffPlan, label: 'Free', hint: 'AI лимиты' }, { id: 'pro' as TariffPlan, label: 'Pro', hint: 'Без лимит + PDF' }, { id: 'family' as TariffPlan, label: 'Family', hint: '5 профилей' } ].map(p => (
                      <button key={p.id} onClick={() => setRegData({ ...regData, plan: p.id })} className={clsx("w-full p-2.5 text-left rounded-[1rem] border text-xs font-black transition-all", regData.plan === p.id ? "bg-indigo-600/10 border-indigo-500 text-indigo-200" : "bg-slate-950 border-slate-800 text-slate-500")}>
                        <div className="flex items-center justify-between"><div className="flex items-center gap-2">{p.id === 'pro' && <Crown size={12} className="text-indigo-300" />}{p.id === 'family' && <Users size={12} className="text-indigo-300" />}<span>{p.label}</span></div><span className="text-[7px] px-1.5 py-0.5 rounded-full bg-slate-900/40 border border-slate-800 text-slate-400 uppercase tracking-widest">{p.hint}</span></div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="p-4 rounded-[1.5rem] bg-slate-950 border border-slate-800 shadow-xl">
                  <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">AI Расчёт</p><span className="ff-ai-pill !py-0.5 !px-2"><BrainCircuit size={10} className="text-indigo-300" /><span className="ff-ai-pill__text !text-[7px]">анализ</span></span></div><p className="text-[9px] font-black text-slate-600 uppercase tabular-nums">BMI {regBMI ? regBMI.toFixed(1) : "—"}</p></div>
                  <div className="grid grid-cols-2 gap-2 mb-3"><div className="rounded-[1rem] bg-slate-900/40 p-3 border border-slate-800"><p className="text-[8px] font-black text-slate-500 uppercase">BMR</p><p className="text-lg font-black text-white">{regBMR}</p></div><div className="rounded-[1rem] bg-slate-900/40 p-3 border border-slate-800"><p className="text-[8px] font-black text-slate-500 uppercase">TDEE</p><p className="text-lg font-black text-white">{regTDEE}</p></div></div>
                  <div className="p-3 rounded-[1rem] bg-indigo-500/5 border border-indigo-500/20"><p className="text-[8px] font-black text-indigo-400 uppercase mb-1">Цель на день</p><div className="text-sm font-bold text-slate-300 mt-2">{regTargets.calories} ккал<div className="mt-1 text-slate-400 text-xs font-semibold tabular-nums">{regTargets.protein} г белка • {regTargets.fat} г жиров • {regTargets.carbs} г углеводов</div></div><div className="mt-4 text-[11px] text-slate-500 leading-relaxed font-medium">Расчёт выполнен по формуле <span className="text-slate-400 font-semibold">Миффлина–Сан Жеора</span>.<br/>TDEE = BMR × коэффициент активности.<br/>Стратегия: {regData.goal === Goal.LOSS ? `дефицит ${regData.lossDeficit} ккал` : regData.goal === Goal.GAIN ? `профицит ${regData.gainSurplus} ккал` : 'баланс энергии'}.</div></div>
                </div>
                {forecast && (<div className="p-4 rounded-[1.5rem] bg-gradient-to-br from-indigo-950/40 to-slate-950 border border-indigo-800/40 shadow-xl"><div className="flex items-center gap-2 mb-2 text-indigo-300"><TrendingUp size={14} /><span className="text-[9px] font-black uppercase tracking-widest">AI Прогноз · 4 недели</span></div><div className="space-y-1"><p className="text-xs font-bold text-slate-200">Вес через месяц: <span className="text-indigo-300 font-black tabular-nums">{forecast.week4Weight} кг</span></p><p className="text-[10px] text-slate-500 italic">Изменение: {forecast.weeklyDelta} кг/нед</p></div></div>)}
              </div>
            </>
          )}
        </div>
        <div className="pt-4 space-y-3">
          {onboardingStep === 1 ? (
            <button type="button" onClick={() => setOnboardingStep(2)} disabled={!regStep1Valid} className={clsx("w-full py-5 rounded-[1.5rem] font-black text-base shadow-xl transition-all active:scale-[0.98] disabled:opacity-50", regStep1Valid ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-900/40" : "bg-slate-800 text-slate-600")}>Рассчитать мой план</button>
          ) : (
            <>
              <button onClick={handleActivateWithTransition} disabled={!regNameValid || isActivatingPlan} className={clsx("w-full py-5 rounded-[1.5rem] font-black text-base shadow-xl transition-all active:scale-[0.98] disabled:opacity-50", regNameValid ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-900/40" : "bg-slate-800 text-slate-600")}>Создать AI-план</button>
              <button type="button" onClick={() => onboardingStep === 2 && setOnboardingStep(1)} disabled={isActivatingPlan} className="w-full py-3 rounded-[1.5rem] font-black text-xs text-slate-400 border border-slate-800 hover:bg-slate-800/50 transition-all disabled:opacity-50">Назад к параметрам</button>
            </>
          )}
          <p className="text-center text-[9px] text-slate-600 font-semibold uppercase tracking-wider">Без регистрации • Данные на устройстве</p>
        </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] md:min-h-screen md:pl-64 bg-slate-950 text-slate-100 text-left">
      {isScanning && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex flex-col items-center justify-center">
          <div className="w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6" />
          <p className="text-slate-100 font-black text-xl animate-pulse">Анализирую фото...</p>
        </div>
      )}
      {paywall.isPaywallOpen && (
        <PlansScreen currentPlan={currentUser?.plan || 'free'} onSelect={(p) => { if (currentUser) persistUser({ ...currentUser, plan: p, planTier: (p === 'free' ? 'free' : 'pro'), proUnlockedAt: (p !== 'free' ? new Date().toISOString() : undefined) }); }} onClose={paywall.closePaywall} />
      )}
      
      {editFoodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-950/90 border border-slate-800 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-bold text-white">Редактировать приём пищи</div>
              <button onClick={() => setEditFoodModal(null)} className="p-2 rounded-xl hover:bg-slate-800/60">
                <X className="w-5 h-5 text-slate-200" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-sm text-slate-300 mb-1">Название</div>
                <input
                  value={editFoodModal.name}
                  onChange={(e) => setEditFoodModal({ ...editFoodModal, name: e.target.value })}
                  className="w-full rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-violet-600/40"
                  placeholder="Например: маринованные бёдра курицы, телятина"
                />
              </div>

<div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-sm text-slate-300 mb-1">Приём пищи</div>
                  <select
                    value={editFoodModal.mealType}
                    onChange={(e) => setEditFoodModal({ ...editFoodModal, mealType: e.target.value as MealType })}
                    className="w-full rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-violet-600/40"
                  >
                    <option value="breakfast">Завтрак</option>
                    <option value="lunch">Обед</option>
                    <option value="dinner">Ужин</option>
                    <option value="snack">Перекус</option>
                  </select>
                </div>

                <div>
                  <div className="text-sm text-slate-300 mb-1">Дата и время</div>
                  <input
                    type="datetime-local"
                    value={toLocalDT(editFoodModal.timestamp)}
                    onChange={(e) => setEditFoodModal({ ...editFoodModal, timestamp: fromLocalDT(e.target.value) })}
                    className="w-full rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-violet-600/40"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setEditFoodModal(null)}
                  className="px-4 py-2 rounded-2xl bg-slate-800/60 text-slate-100 border border-slate-700 hover:bg-slate-700/60"
                >
                  Отмена
                </button>
                <button
                  onClick={() => {
                    updateFoodEntry(editFoodModal.id, { name: editFoodModal.name, mealType: editFoodModal.mealType, timestamp: editFoodModal.timestamp } as any);
                    setEditFoodModal(null);
                  }}
                  className="px-4 py-2 rounded-2xl bg-violet-600 text-white hover:bg-violet-500"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

{insightModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xl z-[250] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl animate-in zoom-in duration-300">
            <FoodInsightCard photo={insightModal.photo} name={insightModal.name} insight={insightModal.insight} isPro={paywall.canUsePro} onUpdateInsight={(next) => { if (!currentUser) return; const newDiary = foodDiary.map(it => it.id === insightModal.id ? { ...it, insight: next } : it); setFoodDiary(newDiary); safeSetItem(`fitfocus_data_${currentUser.id}_diary`, JSON.stringify(newDiary)); setInsightModal({ ...insightModal, insight: next }); }} onSaveRecipe={addFavoriteRecipe} onClose={() => setInsightModal(null)} />
          </div>
        </div>
      )}

      {mobileMoreOpen && (
        <div className="fixed inset-0 z-[120] md:hidden">
          <button type="button" aria-label="Закрыть меню" onClick={() => setMobileMoreOpen(false)} className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="absolute inset-x-3 bottom-24 rounded-[2rem] border border-slate-800 bg-slate-950/95 shadow-2xl p-3 space-y-2">
            <div className="px-2 pt-1 pb-2 text-[11px] font-black uppercase tracking-widest text-slate-500">Ещё разделы</div>
            {mobileMoreTabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id as any); setMobileMoreOpen(false); }} className={`w-full min-h-[52px] px-4 rounded-[1.3rem] flex items-center gap-3 text-left transition-all ${activeTab === tab.id ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' : 'bg-slate-900 text-slate-200 border border-slate-800'}`}>
                <tab.icon size={20} className={tab.id === 'pro' && activeTab !== tab.id ? 'text-amber-500' : ''} />
                <span className="font-black">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 bg-slate-900/92 backdrop-blur-xl border-t border-slate-800 px-2 pt-2 flex items-center justify-between gap-1 overflow-hidden md:top-0 md:left-0 md:right-auto md:w-64 md:h-full md:flex-col md:justify-start md:overflow-visible md:border-r md:border-t-0 md:px-4 md:pt-4 z-50" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
        <div className="hidden md:flex flex-col mb-12 w-full px-4 pt-4 text-left">
          <div className="flex items-center gap-3">
            <div className="relative inline-flex w-12 h-12 items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-[1.1rem] overflow-hidden pointer-events-none"><div className="absolute inset-[-200%] bg-[conic-gradient(from_0deg,transparent_85%,#818cf8_98%,transparent_100%)] animate-spin" style={{ animationDuration: '3s' }} /></div>
              <div className="absolute inset-[1.5px] bg-slate-900 rounded-[1rem] z-0" />
              <div className="relative w-[40px] h-[40px] bg-indigo-600 rounded-[0.8rem] flex items-center justify-center text-white font-black text-lg shadow-xl animate-pulse z-10 border border-indigo-400/20">FF</div>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black text-slate-100 tracking-tight leading-none">FitFocus</span>
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">v2.4.0 Beta</span>
              <span className="mt-2 inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-[9px] font-black uppercase tracking-widest text-emerald-200">Beta · полный доступ</span>
              <div className="mt-2 flex items-center gap-2">
                <span title={aiBadge.title} className={clsx("inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest", aiBadge.cls)}>
                  {aiBadge.label}
                </span>
                <button
                  type="button"
                  onClick={() => void handleAiRetry()}
                  disabled={!lastAiAction || retryMeta.cooling}
                  className={clsx(
                    "px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all active:scale-95",
                    (!lastAiAction || retryMeta.cooling) ? "border-slate-900 bg-slate-950 text-slate-600 opacity-50 cursor-not-allowed" : "border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
                  )}
                  title={retryMeta.title}
                >
                  {retryMeta.label}
                </button>
                {lastAiAction && retryMeta.cooling && (
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm("AI сейчас на паузе из-за квоты/лимита. Force Retry может снова вызвать ошибку quota exceeded и потратить лимиты. Продолжить?");
                      if (ok) void handleAiRetry({ force: true });
                    }}
                    className="px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200"
                    title="Принудительно повторить последнее AI-действие, игнорируя паузу"
                  >
                    Force
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {mobilePrimaryTabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as any)} className={`md:hidden flex shrink-0 flex-col items-center justify-center gap-1 px-2 py-2 rounded-[1.2rem] transition-all min-w-[68px] max-w-[68px] ${activeTab === tab.id ? 'text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}><tab.icon size={20} className={tab.id === 'pro' && activeTab !== 'pro' ? 'text-amber-500' : ''} /><span className="text-[10px] leading-tight text-center font-bold">{tab.label}</span></button>
        ))}
        <button type="button" onClick={() => setMobileMoreOpen(true)} className={`md:hidden flex shrink-0 flex-col items-center justify-center gap-1 px-2 py-2 rounded-[1.2rem] transition-all min-w-[68px] max-w-[68px] ${mobileMoreTabs.some(tab => tab.id === activeTab) || mobileMoreOpen ? 'text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}><MoreHorizontal size={20} /><span className="text-[10px] leading-tight text-center font-bold">Ещё</span></button>
        {sidebarTabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`hidden md:flex shrink-0 md:flex-row items-center justify-center gap-4 px-2.5 py-2 md:p-4 rounded-[1.5rem] transition-all md:min-w-0 md:max-w-none md:w-full md:mb-2 ${activeTab === tab.id ? 'text-indigo-400 bg-indigo-500/10 shadow-sm font-black' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}><tab.icon size={22} className={tab.id === 'pro' && activeTab !== 'pro' ? 'text-amber-500' : ''} /><span className="text-base font-bold">{tab.label}</span></button>
        ))}
        <button onClick={logout} className="hidden md:flex items-center gap-4 p-4 text-slate-600 hover:text-rose-400 transition-all mt-auto w-full rounded-[1.5rem] hover:bg-rose-500/5"><X size={20} /> <span className="font-bold">Выйти</span></button>
      </nav>
      <main className="w-full max-w-[1600px] 2xl:max-w-[1800px] mx-auto p-4 md:p-10 xl:p-12 space-y-10" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
        {activeTab === 'dashboard' && (
          <div className="space-y-10 animate-in fade-in duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="text-left"><h1 className="text-[2.25rem] leading-none md:text-4xl font-black text-slate-200 mb-2">Привет, <span className="text-slate-50">{currentUser?.name}</span>! 👋</h1><p className="text-slate-400 font-medium text-base md:text-lg">Ваш путь к цели под контролем ({paywall.plan})</p></div>
              <div className="w-full md:w-auto flex flex-col gap-3 bg-slate-900 p-2 rounded-[1.5rem] md:rounded-[2rem] shadow-sm border border-slate-800 overflow-hidden"><div className="flex-1 min-w-0 flex flex-col gap-2 items-stretch px-1 py-1"><div className="grid grid-cols-2 gap-2"><button onClick={exportShortPdf} className="p-3 bg-slate-800 text-slate-200 rounded-[1.2rem] hover:bg-slate-700 transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest text-center min-w-0"><Download size={14} /> Краткий PDF</button><button onClick={exportDetailedPdf} className="p-3 bg-indigo-600 text-white rounded-[1.2rem] hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-900/20 text-center min-w-0"><Download size={14} /> Детальный PDF</button></div><label className="flex items-center gap-1 text-[8px] font-black text-slate-500 uppercase tracking-widest cursor-pointer px-2"><input type="checkbox" className="w-3 h-3 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500" checked={pdfIncludeMealLog} onChange={(e) => setPdfIncludeMealLog(e.target.checked)} />Детально (лог еды)</label></div><div className="grid grid-cols-[minmax(0,1fr)_52px] gap-2 w-full"><div className="min-w-0 flex items-center bg-indigo-500/10 rounded-[1.5rem] px-4 py-2 border border-indigo-500/20"><Scale size={20} className="text-indigo-400 mr-2 shrink-0" /><input type="number" placeholder="Вес" className="bg-transparent w-full text-sm focus:outline-none font-black text-indigo-100 placeholder-indigo-700 tabular-nums min-w-0" value={newWeight} onChange={e => setNewWeight(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') logWeight(); }} /></div><button onClick={logWeight} className="shrink-0 w-[52px] h-[52px] bg-indigo-600 text-white rounded-[1.3rem] hover:bg-indigo-700 shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center"><Plus size={18} /></button></div></div>
            </header>
            {plateau && currentUser?.goal === Goal.LOSS && (<div className="p-6 rounded-[2.5rem] border border-amber-500/30 bg-amber-500/5 backdrop-blur-md flex items-start gap-4 animate-in slide-in-from-top-4 duration-500"><div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0 border border-amber-500/20"><AlertTriangle size={24} /></div><div className="text-left"><p className="text-[11px] font-black uppercase tracking-widest text-amber-500 mb-1">Обнаружено плато (28 дней анализа)</p><h3 className="text-lg font-black text-slate-100">Ваш вес стабилизировался</h3><div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest text-amber-200"><ShieldCheck size={14} className="text-amber-300" />Интенсивность учтена</div><p className="text-sm font-medium text-slate-400 mt-2">Это естественная адаптация организма. AI-коуч подготовил для вас обновленные рекомендации в разделе «План» и ежедневных задачах.</p></div></div>)}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {(() => {
              const clampGram = (v: unknown) => {
                const n = typeof v === 'number' ? v : Number(v);
                if (!Number.isFinite(n)) return 0;
                // protect UI from floating noise like 27.299999999999997
                const r = Math.round(n);
                return Math.max(0, Math.min(9999, r));
              };
              const grams = {
                protein: clampGram(dailyStats.protein),
                fat: clampGram(dailyStats.fat),
                carbs: clampGram(dailyStats.carbs)
              };
              return (
                <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 space-y-6 md:space-y-8"><div className="flex items-center justify-between"><h3 className="text-xl font-black text-slate-100">Дневник нутриентов</h3><div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400"><TrendingUp size={20} /></div></div><div className="relative h-48 md:h-64 flex items-center justify-center"><PieChart width={160} height={160} className="md:hidden"><Pie data={macroPieData} innerRadius={46} outerRadius={72} paddingAngle={8} dataKey="value" stroke="none">{macroPieData.map((entry, index) => <Cell key={`mobile-cell-${index}`} fill={entry.color} />)}</Pie><Tooltip contentStyle={{ backgroundColor: 'var(--ff-card)', borderRadius: '24px', border: '1px solid var(--ff-border)', fontWeight: 'bold', color: 'var(--ff-text)' }} /></PieChart><PieChart width={200} height={200} className="hidden md:block"><Pie data={macroPieData} innerRadius={60} outerRadius={90} paddingAngle={8} dataKey="value" stroke="none">{macroPieData.map((entry, index) => <Cell key={`desktop-cell-${index}`} fill={entry.color} />)}</Pie><Tooltip contentStyle={{ backgroundColor: 'var(--ff-card)', borderRadius: '24px', border: '1px solid var(--ff-border)', fontWeight: 'bold', color: 'var(--ff-text)' }} /></PieChart><div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-2xl md:text-3xl font-black text-slate-100 tabular-nums">{Math.round((dailyStats.calories / targets.calories) * 100) || 0}%</span><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ккал</span></div></div><div className="grid grid-cols-3 gap-3 md:gap-4">{macroPieData.map((m, i) => (<div key={i} className="text-center space-y-1"><div className="w-2 h-2 rounded-full mx-auto" style={{ backgroundColor: m.color }} /><p className="text-[9px] md:text-[10px] font-black text-slate-50 uppercase tracking-widest">{m.name}</p><p className="text-sm md:text-base font-black text-slate-200 tabular-nums">{i === 0 ? grams.protein : i === 1 ? grams.fat : grams.carbs} г</p></div>))}</div></div>
              );
            })()}
              <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 space-y-6 md:space-y-8"><div className="flex items-center justify-between"><h3 className="text-xl font-black text-slate-100">Полезные привычки</h3><div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400"><CheckCircle2 size={20} /></div></div><div className="space-y-4">{[ { key: 'water', title: 'Пить воду', icon: Droplets }, { key: 'steps', title: '10,000 шагов', icon: Footprints }, { key: 'breakfast', title: 'Здоровый завтрак', icon: Leaf }, { key: 'sleep', title: 'Сон 8 часов', icon: Moon } ].map((h) => { const isDone = currentUser?.dailyHabits?.[getTodayKey()]?.[h.key as any]; const streak = calculateStreak(currentUser?.dailyHabits, h.key); const IconComp = h.icon; return (<div key={h.key} className="flex items-center justify-between p-4 bg-slate-950/50 rounded-[1.5rem] border border-slate-800 group hover:border-indigo-500/30 transition-all cursor-pointer" onClick={() => handleToggleHabit(h.key as any)}><div className="flex items-center gap-4"><div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${isDone ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-950' : 'bg-slate-900 border-2 border-slate-700 text-transparent group-hover:border-indigo-500'}`}><CheckCircle2 size={14} fill="currentColor" /></div><div className="flex flex-col text-left"><span className={`font-bold ${isDone ? 'text-slate-600 line-through' : 'text-slate-200'}`}>{h.title}</span>{streak > 1 && <span className="text-[10px] font-black text-amber-500 flex items-center gap-1"><Flame size={10} fill="currentColor" /> {streak} дня серия</span>}</div></div><IconComp size={18} className={isDone ? 'text-emerald-400' : 'text-slate-600'} /></div>); })}</div><HabitStreaksCard dailyHabits={currentUser?.dailyHabits} /></div>
              <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 space-y-6 md:space-y-8 flex flex-col"><div className="flex items-center justify-between"><h3 className="text-xl font-black text-slate-100">Мой вес</h3><div className="flex flex-col items-end"><span className="text-lg font-black text-slate-50 tabular-nums">{weightTrend?.current || currentUser?.weight} кг</span><div className="flex gap-2 mt-1">{weightTrend && weightTrend.delta7 !== 0 && <span className={`text-[10px] font-bold px-2 py-1 rounded-lg tabular-nums ${weightTrend.delta7 < 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>7д: {weightTrend.delta7 > 0 ? '+' : ''}{weightTrend.delta7.toFixed(1)}</span>}{weightTrend && weightTrend.delta30 !== 0 && <span className={`text-[10px] font-bold px-2 py-1 rounded-lg tabular-nums ${weightTrend.delta30 < 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>30д: {weightTrend.delta30 > 0 ? '+' : ''}{weightTrend.delta30.toFixed(1)}</span>}</div></div></div><div className="flex-1 min-h-[200px]"><WeightTrendChart weightHistory={currentUser?.weightHistory || []} /></div><div className="flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-widest pt-4 border-t border-slate-800"><span>Неделя 1</span><span>Неделя {Math.ceil((currentUser?.weightHistory.length || 1) / 7)}</span></div></div>
            </div>
            {currentUser && paywall.canUsePro && (<div className="bg-slate-900 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-800 space-y-6 animate-in slide-in-from-bottom-4 duration-500"><div className="flex items-start justify-between gap-4"><div className="text-left"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Метаболическая адаптация</span><h3 className="text-3xl font-black text-slate-100 flex items-center gap-2"><span className="tabular-nums">{adaptationIndex}</span><span className="text-sm font-black text-slate-600">/ 100</span><span className={clsx("text-sm font-black ml-4 px-3 py-1 rounded-full bg-slate-950 border border-slate-800", adaptationStatus.color)}>{adaptationStatus.label}</span></h3><p className="text-sm font-semibold text-slate-400 mt-2 text-left">Комплаенс: <span className="tabular-nums font-black text-slate-200">{compliancePct}%</span> · Дельта {deltaDays} дн.: <span className="tabular-nums font-black text-slate-200">{weightDeltaN.toFixed(1)} кг</span></p></div><div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400"><Activity size={28} /></div></div><div className="space-y-2"><div className="h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-800"><div className={clsx("h-full rounded-full transition-all duration-1000 ease-out", adaptationIndex < 35 ? "bg-emerald-500" : adaptationIndex < 70 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${Math.max(4, adaptationIndex)}%` }} /></div><div className="flex items-center justify-between text-[10px] font-black text-slate-600 uppercase tracking-widest px-1"><span>Низкая</span><span>Средняя</span><span>Высокая</span></div></div><div className="p-6 rounded-[2rem] bg-slate-950/50 border border-slate-800 text-left"><div className="flex items-center justify-between gap-3 mb-3"><div className="flex items-center gap-2"><RefreshCcw size={16} className={clsx(refeedSuggestion.type === 'refeed' ? "text-indigo-400" : "text-slate-500")} /><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Рекомендация AI</span></div>{refeedDate && (<span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 bg-indigo-600/10 border border-indigo-500/20 px-3 py-1 rounded-full">Рефид: {refeedDate}</span>)}</div>{refeedSuggestion.type === 'refeed' ? (<div className="space-y-4"><p className="text-sm font-bold text-slate-200 leading-relaxed">Предлагаю провести «рефид-день» завтра: <span className="font-black tabular-nums text-indigo-400">{refeedSuggestion.caloriesTomorrow}</span> ккал. Это поможет снизить адаптацию и перезагрузить метаболизм.</p><button type="button" onClick={scheduleRefeedTomorrow} className="w-full py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest bg-indigo-600/10 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-600 hover:text-white transition-all shadow-lg">Запланировать рефид на завтра</button></div>) : refeedSuggestion.type === 'adjust' ? (<p className="text-sm font-bold text-slate-300 leading-relaxed">Мягкая адаптация: попробуйте снизить норму на <span className="font-black text-amber-400">200 ккал</span> или добавить <span className="font-black text-amber-400">+{refeedSuggestion.stepsExtra} шагов</span> в день.</p>) : (<p className="text-sm font-bold text-slate-400 leading-relaxed italic">Динамика в норме — продолжаем текущую стратегию без изменений.</p>)}</div><div className="space-y-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Info size={16} className="text-indigo-400" /><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">AI Интерпретация</span></div><button type="button" disabled={adaptLoading} onClick={async () => { if (!currentUser) return; setLastAiAction({ feature: 'plateau', type: 'plateau', userId: currentUser.id }); setAdaptLoading(true); // FIX: call generatePlateauExplanation instead of missing getAdaptationExplanation.
const txt = await generatePlateauExplanation({ name: currentUser.name, goal: currentUser.goal, compliancePct, weightDeltaN, expectedN, adaptationIndex, suggestion: refeedSuggestion, }); setAdaptNote(txt); setAdaptLoading(false); }} className={clsx("px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95", adaptLoading ? "opacity-60 border-slate-800 bg-slate-900" : "border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300")}>{adaptLoading ? "AI думает..." : "Объяснить"}</button></div><div className="p-6 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 space-y-3">
  <div className="flex items-center justify-between gap-3">
    <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300 select-none">
      <input type="checkbox" className="accent-indigo-500" checked={adaptRead} onChange={(e) => setAdaptRead(e.target.checked)} />
      Прочитано
    </label>
    {adaptNote && (
      <button type="button" onClick={() => setAdaptExpanded(v => !v)} className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-600/10 text-indigo-200 hover:bg-indigo-600 hover:text-white transition-all">
        {adaptExpanded ? 'Свернуть' : 'Развернуть'}
      </button>
    )}
  </div>
  <div className={clsx("text-sm font-medium leading-relaxed text-left whitespace-pre-line", adaptNote ? "text-slate-200" : "text-slate-500 italic")}>
    <div style={!adaptExpanded && adaptNote ? { display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}>
      {adaptNote || "Нажмите «Объяснить», чтобы AI интерпретировал вашу динамику веса и комплаенс режима."}
    </div>
  </div>
  {adaptNote && adaptExpanded && (
    <div className="pt-2 flex justify-end">
      <button
        type="button"
        onClick={() => setAdaptExpanded(false)}
        className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-600/10 text-indigo-200 hover:bg-indigo-600 hover:text-white transition-all"
      >
        Свернуть
      </button>
    </div>
  )}
</div></div></div>)}
            {weekly && paywall.canUsePro && (<div className="bg-gradient-to-br from-indigo-600/20 via-purple-600/20 to-rose-500/20 backdrop-blur-md p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-white/20 shadow-2xl space-y-6 animate-in slide-in-from-bottom-4 duration-600"><div className="flex items-start justify-between"><div className="text-left"><span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 opacity-80 block mb-1">AI-Аналитика недели (PRO)</span><div className="mt-4"><div className="flex items-center justify-between gap-6"><h3 className="text-4xl font-black text-white flex items-center gap-3"><span className="tabular-nums">{weekly.wis}</span><span className="text-lg font-black text-indigo-300 opacity-50">/ 100</span></h3><span className={clsx("px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest", weekly.wis >= 80 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : weekly.wis >= 60 ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : weekly.wis >= 40 ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30")}>{weekly.status}</span></div><div className="mt-4 h-3 rounded-full bg-white/10 overflow-hidden border border-white/10"><div className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all duration-1000 ease-out" style={{ width: `${weekly.wis}%` }} /></div></div></div><div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-lg shrink-0"><BrainCircuit size={28} /></div></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-4"><div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left"><p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Δ 7 дней</p><p className="text-sm font-black tabular-nums text-white">{weekly.weightDelta7 > 0 ? '+' : ''}{weekly.weightDelta7.toFixed(1)} кг</p></div><div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left"><p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Δ 30 дней</p><p className="text-sm font-black tabular-nums text-white">{weekly.weightDelta30 > 0 ? '+' : ''}{weekly.weightDelta30.toFixed(1)} кг</p></div><div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left"><p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Комплаенс</p><p className="text-sm font-black tabular-nums text-white">{weekly.compliance}%</p></div><div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left"><p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Комплаенс</p><p className="text-sm font-black tabular-nums text-white">{weekly.compliance}%</p></div><div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left"><p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">Адаптация</p><p className="text-sm font-black tabular-nums text-white">{weekly.adaptationIndex}/100</p></div></div><div className="mt-2 space-y-2 text-sm font-semibold opacity-90"><p className="font-black text-indigo-100 flex items-center gap-2"><TrendingUp size={16} />Прогноз следующей недели: {forecastNextWeek > 0 ? '+' : ''}{forecastNextWeek.toFixed(2)} кг</p><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Интенсивность: {currentUser ? (currentUser.goal === Goal.LOSS ? `дефицит ${Number(currentUser.lossDeficit ?? DEFAULT_DEFICIT)} ккал/день` : currentUser.goal === Goal.GAIN ? `профицит ${Number(currentUser.gainSurplus ?? DEFAULT_SURPLUS)} ккал/день` : 'поддержание') : '—'}</p><div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/80"><ShieldCheck size={14} className="text-white/80" />Интенсивность учтена</div></div>{weeklyReports.length > 0 && (<div className="mt-8 border-t border-white/10 pt-6"><span className="text-[10px] font-black uppercase tracking-widest text-white/60 block mb-4">История AI-отчётов</span><div className="space-y-4">{weeklyReports.slice().reverse().map((r, idx) => (<div key={idx} className="p-5 rounded-[2rem] bg-white/5 border border-white/10 space-y-4 group hover:border-white/20 transition-all"><div className="flex justify-between items-center"><div className="text-left"><span className="text-sm font-black text-indigo-300">{r.weekKey}</span><p className="text-[10px] font-black uppercase tracking-widest text-white/40">{new Date(r.createdAt).toLocaleDateString()}</p></div><div className="text-right"><span className="text-xs font-black text-white tabular-nums">{r.data.wis}/100</span><p className="text-[8px] font-black uppercase tracking-widest text-white/40">WIS Score</p></div></div>{r.aiText && (<p className="text-sm font-medium text-white/80 leading-relaxed text-left border-l-2 border-indigo-400/30 pl-4">{r.aiText}</p>)}<button onClick={() => exportWeeklyPDF(r)} className="w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white font-bold hover:bg-white/20 transition flex items-center justify-center gap-2 text-xs uppercase tracking-widest"><Download size={14} /> Экспорт в PDF</button></div>))}</div></div>)}</div>)}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-10 rounded-[3rem] text-white shadow-2xl shadow-indigo-950/20 relative overflow-hidden group"><div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-16 translate-x-16 blur-3xl group-hover:scale-110 transition-transform" /><div className="relative z-10 flex flex-col h-full space-y-6"><div className="flex items-center gap-4"><div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner border border-white/10"><Sparkles size={28} /></div><div className="text-left"><span className="text-[10px] font-black uppercase tracking-widest opacity-60 block">AI Коучинг</span><h3 className="text-2xl font-black">{coachCard ? coachCard.title : "Ваш коуч рядом"}</h3></div></div><div className="flex-1 flex flex-col justify-center">{coachLoading ? (<div className="flex items-center gap-3 font-bold animate-pulse"><Loader2 className="animate-spin" /> Формирую рекомендации...</div>) : (<div className="space-y-4"><p className="text-lg font-medium leading-relaxed italic opacity-90 text-left">{coachCard ? `"${coachCard.advice}"` : "Нажмите, чтобы получить персональный анализ вашего дня и привычек."}</p>{todayTask && (<div className="bg-white/10 backdrop-blur-md p-6 rounded-[2rem] border border-white/20 shadow-xl"><span className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2 block text-white text-left">Задача дня:</span><div className="flex items-start gap-4 cursor-pointer" onClick={() => handleToggleTask(todayTask.date)}><div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center transition-all ${todayTask.completed ? 'bg-white text-indigo-600 shadow-lg shadow-white/20' : 'bg-white/10 border-2 border-white/30 text-transparent'}`}><CheckCircle2 size={14} fill="currentColor" /></div><span className={`text-lg font-bold leading-snug text-left ${todayTask.completed ? 'line-through opacity-50' : ''}`}>{todayTask.text}</span></div></div>)}</div>)}</div>{!coachCard && !coachLoading && (<button onClick={handleGetCoachAdvice} className="w-fit px-10 py-4 bg-white text-indigo-600 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl hover:scale-105 transition-all active:scale-95">Получить совет</button>)}</div></div>
                <div className="bg-slate-900 p-10 rounded-[3rem] shadow-xl border border-slate-800 flex flex-col justify-between group"><div className="space-y-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500"><BookOpen size={20} /></div><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Курс обучения</span></div><div className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 border border-emerald-500/20"><Flame size={12} fill="currentColor" /> {currentUser?.courseProgress?.streak || 0} Дней</div></div><div className="bg-slate-950 p-6 rounded-[2rem] flex items-center gap-6 border border-slate-800 group-hover:border-indigo-500/20 transition-all shadow-inner"><div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-sm border border-slate-800"><CheckSquare size={32} className="text-indigo-400" /></div><div className="text-left"><h4 className="text-2xl font-black text-slate-100 leading-tight mb-1">Урок {currentLesson?.week || 1}: {currentLesson?.title}</h4><p className="text-sm text-slate-500 font-bold tabular-nums">{Math.ceil((currentLesson?.readTimeSec || 0) / 60)} минут чтения</p></div></div></div><button onClick={() => setIsLessonViewOpen(true)} className="w-full mt-8 py-5 bg-slate-800 text-slate-300 rounded-[2rem] font-black text-sm uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-3 border border-slate-700 hover:border-indigo-500 shadow-lg">Открыть урок <ChevronRight size={20} /></button></div>
             </div>
           </div>
         )}
        {activeTab === 'plan' && (<div className="space-y-6 animate-in fade-in duration-700"><header className="flex flex-col md:flex-row md:items-end justify-between gap-3"><div className="text-left"><h2 className="text-3xl font-black text-slate-100">Ваш AI‑план</h2><p className="text-sm text-slate-400 font-semibold">Стратегия, KPI и первые шаги на неделю.</p><div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest text-indigo-200"><ShieldCheck size={14} className="text-indigo-300" />Интенсивность учтена</div></div><button onClick={() => setPlanIntroOpen(true)} className="inline-flex items-center gap-2 px-4 py-3 rounded-[1.5rem] bg-slate-950 border border-slate-800 text-slate-200 font-black hover:border-indigo-500/30 transition-all min-h-[44px]"><Sparkles size={16} /> Показать кратко</button></header>{!currentUser?.aiPlan && (<div className="p-6 rounded-[2rem] border border-amber-500/20 bg-amber-500/5 text-left"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-300 shrink-0"><Sparkles size={18} /></div><div><p className="text-sm font-black text-amber-100">План ещё подготавливается</p><p className="mt-1 text-sm text-amber-200/80 font-semibold">Сначала заполните профиль и дождитесь генерации AI-плана. Пока план не готов, разделы показывают безопасные заглушки вместо пустого экрана.</p></div></div></div>)}

          <div className="p-4 md:p-6 rounded-[1.6rem] md:rounded-[2rem] bg-gradient-to-br from-indigo-600/15 via-slate-950 to-slate-950 border border-indigo-500/20 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black text-indigo-300 uppercase tracking-widest">Сегодня</p>
                <h3 className="mt-2 text-xl font-black text-white">Что важно сделать сегодня</h3>
                <p className="mt-1 text-sm text-slate-400 font-semibold">Минимум действий, которые двигают к цели и не перегружают.</p>
              </div>
              <div className="shrink-0 px-3 py-2 rounded-full bg-slate-950/70 border border-slate-800 text-[11px] font-black uppercase tracking-widest text-slate-300">
                {Object.values(planTaskDone).filter(Boolean).length}/{Math.min(3, currentUser?.aiPlan?.firstTasks?.length || 0)} выполнено
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {(currentUser?.aiPlan?.firstTasks ?? []).slice(0, 3).map((t, i) => {
                const key = `${i}:${t}`;
                const done = !!planTaskDone[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPlanTaskDone(prev => ({ ...prev, [key]: !prev[key] }))}
                    className={clsx(
                      "min-h-[72px] w-full text-left flex items-start gap-3 p-4 rounded-[1.5rem] border transition-all active:scale-[0.99]",
                      done
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-100"
                        : "bg-slate-900/40 border-slate-800 text-slate-200 hover:border-indigo-500/30"
                    )}
                  >
                    <span className={clsx("mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center shrink-0", done ? "border-emerald-400 bg-emerald-500/20 text-emerald-300" : "border-slate-700 text-slate-500")}>{done ? <CheckCircle2 size={16} /> : <span className="w-2.5 h-2.5 rounded-full bg-current opacity-70" />}</span>
                    <span className="font-bold leading-relaxed">{t}</span>
                  </button>
                );
              })}
              {(!currentUser?.aiPlan?.firstTasks || currentUser.aiPlan.firstTasks.length === 0) && (
                <div className="p-4 rounded-[1.5rem] bg-slate-900/40 border border-slate-800 text-sm text-slate-500 font-semibold">Первые задачи появятся после генерации плана.</div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button type="button" onClick={() => setActiveTab('nutrition')} className="min-h-[48px] px-4 py-3 rounded-[1.3rem] bg-slate-950/70 border border-slate-800 text-slate-200 font-black text-sm hover:border-indigo-500/30 transition-all">📸 Добавить еду</button>
              <button type="button" onClick={() => setPlanRulesExpanded(v => !v)} className="min-h-[48px] px-4 py-3 rounded-[1.3rem] bg-slate-950/70 border border-slate-800 text-slate-200 font-black text-sm hover:border-indigo-500/30 transition-all">{planRulesExpanded ? 'Скрыть правила' : 'Показать правила'}</button>
              <button type="button" onClick={() => { if (window.confirm('Обновить недельное меню и список покупок?')) void handleGenerateWeeklyMenu(); }} disabled={weeklyMenuLoading || !currentUser?.aiPlan} className="min-h-[48px] px-4 py-3 rounded-[1.3rem] bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 font-black text-sm hover:bg-indigo-600/30 disabled:opacity-50 transition-all">{weeklyMenuLoading ? 'Генерирую…' : 'Обновить план'}</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">KPI на день</p><p className="mt-2 text-2xl font-black text-white tabular-nums">{currentUser?.aiPlan?.dailyKpi?.calories ?? '—'} ккал</p><p className="mt-1 text-sm font-black text-slate-200 tabular-nums">{currentUser?.aiPlan?.dailyKpi?.protein ?? '—'}Б · {currentUser?.aiPlan?.dailyKpi?.fat ?? '—'}Ж · {currentUser?.aiPlan?.dailyKpi?.carbs ?? '—'}У</p><p className="mt-3 text-sm text-slate-400 font-semibold">{currentUser?.aiPlan?.strategySummary ?? '—'}</p><p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Интенсивность: {currentUser ? (currentUser.goal === Goal.LOSS ? `дефицит ${Number(currentUser.lossDeficit ?? DEFAULT_DEFICIT)} ккал/день` : currentUser.goal === Goal.GAIN ? `профицит ${Number(currentUser.gainSurplus ?? DEFAULT_SURPLUS)} ккал/день` : 'поддержание') : '—'}</p><div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-widest"><span className="text-indigo-300">Фокус недели: {currentUser?.aiPlan?.weeklyFocus ?? '—'}</span>{currentUser?.targetWeight ? <span className="px-3 py-1 rounded-full bg-slate-900/50 border border-slate-800 text-slate-300">Цель: {currentUser.targetWeight} кг</span> : null}</div></div><div className="p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Шаблон дня</p><div className="mt-3 grid grid-cols-1 gap-3 text-sm font-bold text-slate-200"><div className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800"><span className="text-slate-500 font-black">Завтрак:</span> <MealParts value={currentUser?.aiPlan?.mealTemplate?.breakfast || ''} /></div><div className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800"><span className="text-slate-500 font-black">Обед:</span> <MealParts value={currentUser?.aiPlan?.mealTemplate?.lunch || ''} /></div><div className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800"><span className="text-slate-500 font-black">Ужин:</span> <MealParts value={currentUser?.aiPlan?.mealTemplate?.dinner || ''} /></div><div className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800"><span className="text-slate-500 font-black">Перекус:</span> <MealParts value={currentUser?.aiPlan?.mealTemplate?.snack || ''} /></div></div></div></div>

          {planRulesExpanded && (
            <div className="p-5 md:p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left">
              <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Правила недели</p><button type="button" onClick={() => setPlanRulesExpanded(false)} className="text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300">Скрыть</button></div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                {(currentUser?.aiPlan?.rules ?? []).map((rule, idx) => (
                  <div key={idx} className="p-4 rounded-[1.4rem] bg-slate-900/30 border border-slate-800 text-slate-200 font-bold leading-relaxed">• {rule}</div>
                ))}
                {(!currentUser?.aiPlan?.rules || currentUser.aiPlan.rules.length === 0) && <div className="text-sm text-slate-500 font-semibold">Правила появятся после генерации плана.</div>}
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setPlanRulesExpanded(false)} className="text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-500/30 hover:text-indigo-200 transition-all">Свернуть</button>
              </div>
            </div>
          )}

          <div className="p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Меню на неделю</p><button onClick={() => { if (window.confirm('Обновить недельное меню и список покупок?')) void handleGenerateWeeklyMenu(); }} disabled={weeklyMenuLoading || !currentUser?.aiPlan} className="min-h-[44px] px-4 py-2 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600/30 disabled:opacity-50">{weeklyMenuLoading ? 'Генерирую…' : (currentUser?.aiPlan?.weeklyMenu ? 'Обновить' : 'Сгенерировать')}</button></div>{weeklyMenuError && (<p className="mt-3 text-xs text-amber-300 font-bold">{weeklyMenuError}</p>)}{weeklyMenuLoading && !currentUser?.aiPlan?.weeklyMenu ? (<div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800 animate-pulse"><div className="h-4 w-28 rounded bg-slate-800" /><div className="mt-3 space-y-2"><div className="h-3 rounded bg-slate-800" /><div className="h-3 rounded bg-slate-800 w-5/6" /><div className="h-3 rounded bg-slate-800 w-4/6" /></div></div>))}</div>) : currentUser?.aiPlan?.weeklyMenu ? (<div className="mt-4 space-y-3">{currentUser.aiPlan.weeklyMenu.days.map((d, i) => { const expanded = !!planWeekExpanded[d.day]; return (<div key={i} className="rounded-[1.5rem] bg-slate-900/30 border border-slate-800 overflow-hidden"><button type="button" onClick={() => setPlanWeekExpanded(prev => ({ ...prev, [d.day]: !prev[d.day] }))} className="w-full min-h-[52px] px-4 py-4 flex items-center justify-between gap-3 text-left"><div><div className="text-slate-200 font-black text-xl">{d.day}</div><div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-1">{expanded ? 'Скрыть детали' : 'Показать меню дня'}</div></div><ChevronDown size={18} className={clsx('text-slate-400 transition-transform', expanded && 'rotate-180')} /></button>{expanded && (<div className="px-4 pb-4 text-sm text-slate-300 font-semibold space-y-3"><div className="p-4 rounded-[1.2rem] bg-slate-950/50 border border-slate-800"><span className="text-slate-500 font-black">Завтрак:</span> <MealParts value={d.breakfast} /></div><div className="p-4 rounded-[1.2rem] bg-slate-950/50 border border-slate-800"><span className="text-slate-500 font-black">Обед:</span> <MealParts value={d.lunch} /></div><div className="p-4 rounded-[1.2rem] bg-slate-950/50 border border-slate-800"><span className="text-slate-500 font-black">Ужин:</span> <MealParts value={d.dinner} /></div><div className="p-4 rounded-[1.2rem] bg-slate-950/50 border border-slate-800"><span className="text-slate-500 font-black">Перекус:</span> <MealParts value={d.snack} /></div><div className="pt-1 flex justify-end"><button type="button" onClick={() => setPlanWeekExpanded(prev => ({ ...prev, [d.day]: false }))} className="text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-500/30 hover:text-indigo-200 transition-all">Свернуть</button></div></div>)}</div>); })}</div>) : (<p className="mt-3 text-sm text-slate-500 font-semibold">Нажмите «Сгенерировать», чтобы получить меню на 7 дней и список покупок.</p>)}
            {(currentUser?.aiPlan?.weeklyMenu?.shoppingListItems?.length || currentUser?.aiPlan?.weeklyMenu?.shoppingList?.length) ? (
              <ShoppingListCard
                weekStart={currentUser?.aiPlan?.weeklyMenu?.weekStart || new Date().toISOString().slice(0, 10)}
                title="Список покупок"
                fallbackList={(() => {
                  const items = currentUser?.aiPlan?.weeklyMenu?.shoppingListItems ?? [];
                  if (items.length) {
                    return items
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
                      .map((it) => `${it.name} — ${formatGramsPretty(it.grams)}`);
                  }
                  return currentUser?.aiPlan?.weeklyMenu?.shoppingList ?? [];
                })()}
              />
            ) : null}
          </div>


              {/* Cloud Family (B2C) — visible переключатель "Я / Семья" */}
              {cloudFamily?.id && (
                <div className="mt-6 p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Режим плана</p>
                      <p className="mt-1 text-xs text-slate-500 font-semibold">
                        Семья: <span className="text-slate-200 font-black">{cloudFamily.name || 'Семья'}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full p-1">
                      <button
                        onClick={() => setPlanScope('personal')}
                        className={clsx(
                          'px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all',
                          planScope === 'personal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                        )}
                      >
                        Я
                      </button>
                      <button
                        onClick={() => setPlanScope('family')}
                        className={clsx(
                          'px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all',
                          planScope === 'family' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                        )}
                      >
                        Семья
                      </button>
                    </div>
                  </div>

                  {planScope === 'family' && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-slate-200 font-black">Семейный список покупок (на неделю)</p>
                        <button
                          onClick={() => void loadFamilyShopping()}
                          className="px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-200 hover:border-indigo-500/30 transition-all"
                        >
                          Обновить
                        </button>
                      </div>

                      {familyShoppingLoading ? (
                        <div className="mt-3 text-slate-400 font-bold flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Загружаю…</div>
                      ) : familyShopping?.items?.length ? (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm font-bold text-slate-200">
                          {familyShopping.items.slice(0, 30).map((it, i) => (
                            <div key={i} className="p-3 rounded-[1.2rem] bg-slate-950/40 border border-slate-800 flex items-center justify-between gap-3">
                              <span className="truncate">• {it.name}</span>
                              <span className="text-slate-400 tabular-nums">{formatGramsPretty(it.grams)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500 font-semibold">
                          Пусто. Сначала сгенерируйте семейное меню во вкладке «Семья».
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}



              {paywall.plan === 'family' && allUsers.length > 1 && (
                <div className="mt-6 p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Семейное меню на неделю</p>
                      <p className="mt-1 text-xs text-slate-500 font-semibold">Одна готовка для всех + порции под разные калории. Исключения учитываются.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFamilyMenuPrefsOpen(true)} disabled={!currentUser?.aiPlan || familyMenuLoading} className="px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-200 font-black text-[11px] uppercase tracking-widest hover:border-indigo-500/30 disabled:opacity-50">Параметры</button>
                      <button onClick={handleGenerateFamilyWeeklyMenu} disabled={familyMenuLoading || !currentUser?.aiPlan} className="px-4 py-2 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600/30 disabled:opacity-50">{familyMenuLoading ? 'Генерирую…' : (currentUser?.aiPlan?.familyWeeklyMenu ? 'Обновить' : 'Сгенерировать')}</button>
                    </div>
                  </div>
                  {familyMenuError && (<p className="mt-3 text-xs text-amber-300 font-bold">{familyMenuError}</p>)}
                  {currentUser?.aiPlan?.familyWeeklyMenu ? (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {currentUser.aiPlan.familyWeeklyMenu.days.map((d, i) => (
                        <div key={i} className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800">
                          <div className="text-slate-200 font-black mb-2">{d.day}</div>
                          {([['Завтрак', d.breakfast], ['Обед', d.lunch], ['Ужин', d.dinner], ['Перекус', d.snack]] as const).map(([label, meal], j) => (
                            <div key={j} className="mt-2 text-xs text-slate-300 font-semibold">
                              <div><span className="text-slate-500 font-black">{label}:</span> <MealParts value={meal.base} /></div>
                              <div className="mt-1 pl-3 space-y-0.5">
                                {Object.entries(meal.portions || {}).map(([pid, ptxt]) => {
                                  const person = allUsers.find(u => u.id === pid);
                                  const nm = person?.name || (pid === currentUser.id ? 'Вы' : pid);
                                  if (!ptxt) return null;
                                  return <div key={pid} className="text-[11px] text-slate-400"><span className="text-slate-500 font-black">{nm}:</span> <MealParts value={String(ptxt)} /></div>;
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500 font-semibold">Нажмите «Сгенерировать», чтобы получить семейное меню на 7 дней и список покупок.</p>
                  )}
                  {currentUser?.aiPlan?.familyWeeklyMenu?.shoppingList?.length && (
                    <div className="mt-4 p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800">
                      <div className="text-slate-200 font-black mb-2">Список покупок (семья)</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm font-bold text-slate-200">
                        {currentUser.aiPlan.familyWeeklyMenu.shoppingList.slice(0, 40).map((s, i) => (
                          <div key={i} className="p-3 rounded-[1.2rem] bg-slate-950/40 border border-slate-800">• {s}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6"/><div className="p-6 rounded-[2rem] bg-slate-950 border border-slate-800 text-left"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Правила</p><div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">{(currentUser?.aiPlan?.rules ?? []).slice(0, 6).map((r, i) => (<div key={i} className="p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800 text-slate-200 font-bold">• {r}</div>))}</div></div></div>)}
         {activeTab === 'nutrition' && (<div className="space-y-10 animate-in slide-in-from-bottom-6 duration-700"><header className="flex flex-col md:flex-row md:items-end justify-between gap-5"><div className="text-left"><h1 className="text-[2.4rem] leading-none md:text-4xl font-black text-slate-100 mb-2">Анализ еды</h1><p className="text-slate-400 font-medium">Фотографируйте — AI посчитает все сам</p></div><div className="flex items-center gap-4"><div className="text-right hidden sm:block"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Осталось сегодня</p><p className="text-xl font-black text-indigo-400 tabular-nums">{checkLimit('aiFoodPhotoPerDay') ? (PREMIUM_GATES.aiFoodPhotoPerDay[paywall.plan as 'free'] || 3) - (currentUser?.usage?.aiFoodPhotoCount || 0) : 0} AI Сканов</p></div><div className="flex items-center gap-3">
      <button type="button" onClick={() => setCameraOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-7 md:px-10 py-4 md:py-5 rounded-[2rem] md:rounded-[2.5rem] font-black text-sm uppercase tracking-widest flex items-center gap-3 cursor-pointer transition-all shadow-2xl shadow-indigo-900/30 active:scale-95">
        <Camera size={24} /><span>Снять</span>
      </button>
      <label title="Можно выбрать сразу несколько фото (Shift/Ctrl)" className="bg-slate-800 hover:bg-slate-700 text-white px-7 md:px-10 py-4 md:py-5 rounded-[2rem] md:rounded-[2.5rem] font-black text-sm uppercase tracking-widest flex items-center gap-3 cursor-pointer transition-all shadow-2xl shadow-slate-900/30 active:scale-95">
        <Plus size={24} /><span>Загрузить</span>
        <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
      </label>
    </div></div></header>
      <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCaptured={(file) => processPhotoFiles([file])} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10"><div className="lg:col-span-2 space-y-6"><div className="relative group"><Search className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={22} /><input type="text" placeholder="Поиск блюда в истории..." className="w-full pl-14 md:pl-16 pr-5 md:pr-6 py-5 md:py-6 bg-slate-900 border border-slate-800 rounded-[2rem] md:rounded-[2.5rem] shadow-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-slate-100 placeholder:text-slate-700" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => setShowSearchResults(true)} />{showSearchResults && searchResults.length > 0 && (<div className="absolute top-full left-0 w-full mt-4 bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-800 z-20 overflow-hidden animate-in fade-in slide-in-from-top-4">{searchResults.map((res, i) => (<div key={i} onClick={() => { addFoodToDiary(res); setSearchQuery(''); setShowSearchResults(false); }} className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-800 text-left border-b border-slate-800 last:border-0 group"><span className="font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">{res.name}</span><span className="text-sm font-black text-slate-600 tabular-nums">{res.calories} ккал</span></div>))}</div>)}</div><div className="space-y-4">{foodDiary.length === 0 ? (<div className="p-20 text-center text-slate-600 bg-slate-900 rounded-[3rem] border-2 border-dashed border-slate-800 flex flex-col items-center gap-4 shadow-inner"><Utensils size={48} className="opacity-20" /><p className="font-bold text-slate-400">Вы еще ничего не ели сегодня</p><p className="text-sm font-semibold text-slate-500 max-w-md">Сделайте первый снимок еды или загрузите фото — запись появится здесь, а КБЖУ обновится автоматически.</p></div>) : (<FoodDiaryGrouped items={foodDiary} selectedIds={selectedFoodIds} toggleSelected={toggleFoodSelected} bulkMoveTo={bulkUpdateMealType} bulkDelete={bulkRemoveSelectedFoods} deleteEntry={deleteFoodEntry} deletePhoto={deleteFoodPhoto} openInsight={(item) => setInsightModal({ id: item.id, photo: (item.photoThumb || item.photo) as string, name: item.name, insight: item.insight! })} openEdit={openEditFood} formatTime={formatTime} mealTypeLabel={mealTypeLabel} />)}</div></div><div className="bg-slate-900 p-10 rounded-[3rem] shadow-xl border border-slate-800 sticky top-10 h-fit space-y-10"><h3 className="text-2xl font-black text-slate-100 text-left">Баланс КБЖУ</h3><div className="space-y-8"><MacroBar label="Калории" current={dailyStats.calories} target={targets.calories} color="#818CF8" unit="ккал" /><MacroBar label="Белки" current={dailyStats.protein} target={targets.protein} color="#818CF8" /><MacroBar label="Жиры" current={dailyStats.fat} target={targets.fat} color="#FCD34D" /><MacroBar label="Углеводы" current={dailyStats.carbs} target={targets.carbs} color="#A7F3D0" /></div></div></div></div>)}
        {activeTab === 'recipes' && (<RecipesScreen recipes={favoriteRecipes} onAdd={addFavoriteRecipe} onRemove={removeFavoriteRecipe} onClear={clearFavoriteRecipes} />)}
        {activeTab === 'workouts' && <WorkoutsScreen />}
        {activeTab === 'family' && (
          <div className="max-w-4xl mx-auto space-y-8 py-10 animate-in fade-in duration-700">
            <header className="flex items-start justify-between gap-4">
              <div className="text-left">
                <h1 className="text-4xl font-black text-slate-100 mb-2">Семья</h1>
                <p className="text-slate-400 font-medium">Одна готовка для всех • разные цели (похудение/удержание) • общий список покупок</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void loadCloudFamily()}
                  className="px-4 py-3 bg-slate-900 border border-slate-800 rounded-full font-black text-xs uppercase tracking-widest text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30 transition-all"
                >
                  Обновить
                </button>
              </div>
            </header>

            {cloudFamilyLoading && (
              <div className="p-6 rounded-[2rem] bg-slate-900 border border-slate-800 text-slate-300 font-bold flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" /> Загружаю семью…
              </div>
            )}

            {cloudFamilyError && (
              <div className="p-6 rounded-[2rem] bg-rose-500/10 border border-rose-500/20 text-rose-200 font-bold">
                {cloudFamilyError}
              </div>
            )}

            {!cloudFamilyLoading && !cloudFamily && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left space-y-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Создать семью</p>
                  <input
                    value={familyNameDraft}
                    onChange={(e) => setFamilyNameDraft(e.target.value)}
                    placeholder="Название семьи"
                    className="w-full px-5 py-4 rounded-[1.5rem] bg-slate-900 border border-slate-800 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <button
                    onClick={() => void createFamilyCloud().catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                    className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-indigo-900/30 hover:bg-indigo-700 transition-all"
                  >
                    Создать
                  </button>
                  <p className="text-xs text-slate-500 font-semibold">
                    После создания сделайте “Приглашение” и отправьте код на другой телефон.
                  </p>
                </div>

                <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left space-y-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Присоединиться</p>
                  <input
                    value={familyJoinCode}
                    onChange={(e) => setFamilyJoinCode(e.target.value)}
                    placeholder="Код приглашения"
                    className="w-full px-5 py-4 rounded-[1.5rem] bg-slate-900 border border-slate-800 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <button
                    onClick={() => void joinFamilyCloud().catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                    className="w-full py-5 bg-slate-900 border border-slate-800 rounded-[2rem] font-black text-lg text-slate-100 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                  >
                    Войти в семью
                  </button>
                  <p className="text-xs text-slate-500 font-semibold">
                    Введите код от владельца семьи. После входа у вас появится общий план и shopping list.
                  </p>
                </div>
              </div>
            )}

            {!cloudFamilyLoading && cloudFamily && (
              <div className="space-y-6">
                <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Ваша семья</p>
                      <h3 className="text-2xl font-black text-slate-100 mt-1">{cloudFamily?.name || 'Семья'}</h3>
                      <p className="text-xs text-slate-500 font-semibold mt-1">
                        Участников: {cloudFamilyMembers.length || 1}
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => void makeInviteCode().catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                        className="px-6 py-4 bg-slate-900 border border-slate-800 rounded-[2rem] font-black text-sm text-slate-100 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                      >
                        Создать приглашение
                      </button>
                      <button
                        onClick={() => void generateFamilyMenuNow().catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                        className="px-6 py-4 bg-indigo-600 text-white rounded-[2rem] font-black text-sm shadow-xl shadow-indigo-900/30 hover:bg-indigo-700 transition-all"
                      >
                        Сгенерировать семейное меню
                      </button>
                    </div>
                  </div>

                  {familyInviteCode && (
                    <div className="mt-5 p-5 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-indigo-200/80">Код приглашения</p>
                        <p className="text-2xl font-black text-indigo-100 mt-1 tracking-widest">{familyInviteCode}</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(familyInviteCode);
                          } catch {}
                        }}
                        className="px-6 py-4 bg-slate-950 border border-slate-800 rounded-[2rem] font-black text-sm text-slate-100 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                      >
                        Скопировать
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Участники</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void updateMyFamilyGoal('LOSS').catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                        className="px-4 py-2 rounded-full border border-slate-800 bg-slate-900 text-xs font-black text-slate-200 hover:border-emerald-500/30 hover:text-emerald-200 transition-all"
                        title="Похудение"
                      >
                        Я: похудение
                      </button>
                      <button
                        onClick={() => void updateMyFamilyGoal('MAINTAIN').catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                        className="px-4 py-2 rounded-full border border-slate-800 bg-slate-900 text-xs font-black text-slate-200 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                        title="Удержание"
                      >
                        Я: удержание
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-[1.6rem] bg-slate-900/40 border border-slate-800">
                    <p className="text-sm font-bold text-slate-100">
                      Ограничения семьи
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      Аллергии, непереносимости и исключённые продукты каждого участника будут
                      учитываться при генерации общего меню.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cloudFamilyMembers.map((m: any, i: number) => {
                      const restrictions = collectFamilyRestrictions(m);

                      return (
                        <div
                          key={`${m.user_id}-${i}`}
                          className="p-5 rounded-[2rem] bg-slate-900/40 border border-slate-800 min-w-0 overflow-hidden"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-100 truncate">
                                {m.name || m.user_id}
                              </p>

                              <p className="text-xs text-slate-500 mt-1 break-all">
                                {m.email || m.user_id}
                              </p>

                              <p className="text-xs text-slate-500 mt-1">
                                Цель: {formatFamilyGoal(m.goal)}
                              </p>
                            </div>

                            <span className="text-[10px] px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-400">
                              {m.role || 'member'}
                            </span>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {restrictions.length ? (
                              restrictions.map((item) => (
                                <span
                                  key={item}
                                  className="px-2 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-200 text-[11px]"
                                >
                                  {item}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">
                                Ограничения не указаны
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 font-semibold">
                    Советы: поставьте цели участникам (похудение/удержание), затем нажмите “Сгенерировать семейное меню”.
                  </p>
                </div>

                <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Семейный список покупок</p>
                      <p className="text-xs text-slate-500 font-semibold mt-1">Сумма по всем участникам на текущую неделю.</p>
                    </div>
                    <button
                      onClick={() => void loadFamilyShopping()}
                      className="px-5 py-3 bg-slate-900 border border-slate-800 rounded-full font-black text-xs uppercase tracking-widest text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30 transition-all"
                    >
                      Обновить список
                    </button>
                  </div>

                  {familyShoppingLoading ? (
                    <div className="mt-4 text-slate-400 font-bold flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Загружаю…</div>
                  ) : familyShopping?.items?.length ? (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm font-bold text-slate-200">
                      {familyShopping.items.slice(0, 60).map((it, idx) => (
                        <div key={idx} className="p-3 rounded-[1.2rem] bg-slate-950/40 border border-slate-800 flex items-center justify-between gap-3">
                          <span className="truncate">• {it.name}</span>
                          <span className="text-slate-400 tabular-nums">{formatGramsPretty(it.grams)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500 font-semibold">
                      Пока пусто. Нажмите “Сгенерировать семейное меню”.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'council' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-10 duration-700">
            <header className="text-left">
              <div className="flex items-center gap-3 text-indigo-400 mb-2">
                <BrainCircuit size={28} />
                <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">Multi-Agent v2</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black">AI Совет Экспертов</h1>
              <p className="text-slate-400">Параллельный анализ от 4 экспертов + независимая проверка + синтез.</p>
            </header>

            <div className="bg-slate-900 rounded-[3rem] border border-slate-800 h-[640px] flex flex-col overflow-hidden shadow-2xl">
              <div className="px-6 md:px-10 py-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <History size={14} /> История совета
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!currentUser) return;
                    const ok = confirm('Очистить историю AI Совета?');
                    if (!ok) return;
                    const key = `fitfocus_council_history_${currentUser.id}`;
                    try { localStorage.removeItem(key); } catch {}
                    setCouncilMessages([]);
                    setCouncilResponse(null);
                    setExpandedCouncilThoughtIds({});
                  }}
                  className="flex items-center gap-2 text-slate-500 hover:text-rose-300 font-black text-[10px] uppercase tracking-widest transition-all"
                >
                  <Trash2 size={14} /> Очистить
                </button>
              </div>
              <div ref={councilScrollRef} className="flex-1 p-6 md:p-10 overflow-y-auto space-y-8 scrollbar-hide">
                {/* Chat history */}
                <div className="space-y-6">
                  {councilMessages.length === 0 && !councilLoading && (
                    <div className="h-full flex flex-col items-center justify-center opacity-50 py-24">
                      <MessageCircle size={72} className="mb-6 text-slate-800" />
                      <p className="text-center font-bold text-slate-500 text-lg">Задайте вопрос о прогрессе,
                        <br />метаболизме, рационе или привычках.</p>
                    </div>
                  )}

                  {councilMessages.map((m) => {
                    const isUser = m.role === 'user';
                    const resp = m.response;
                    const score = resp?.agreementScore ?? null;
                    const expanded = !!expandedCouncilThoughtIds[m.id];
                    return (
                      <div key={m.id} className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
                        <div
                          className={clsx(
                            'max-w-[85%] p-5 md:p-6 rounded-[2.5rem] border shadow-xl',
                            isUser
                              ? 'bg-indigo-600/10 border-indigo-500/20 text-slate-100'
                              : 'bg-slate-950 border-slate-800 text-slate-200'
                          )}
                        >
                          {!isUser && score !== null && (
                            <div className="mb-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Синтез (итог)</div>
                                <div className={clsx(
                                  'text-[10px] px-3 py-1 rounded-full border font-black uppercase tracking-widest tabular-nums',
                                  score >= 80 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                  : score >= 55 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                                )}>
                                  Agreement {score}%
                                </div>
                              </div>
                              <div className="mt-3 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                <div
                                  className={clsx('h-full rounded-full transition-all',
                                    score >= 80 ? 'bg-emerald-500' : score >= 55 ? 'bg-amber-500' : 'bg-rose-500'
                                  )}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{m.text}</div>

                          {!isUser && resp?.thoughts?.length ? (
                            <div className="mt-4">
                              <button
                                type="button"
                                onClick={() => setExpandedCouncilThoughtIds(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                                className="flex items-center gap-2 text-slate-500 hover:text-indigo-400 font-black text-[10px] uppercase tracking-widest transition-all"
                              >
                                {expanded ? 'Скрыть ход мыслей' : 'Показать ход мыслей совета'}
                                <ChevronDown className={clsx('transition-transform', expanded && 'rotate-180')} size={14} />
                              </button>

                              {expanded && (
                                <div className="mt-4 space-y-4 animate-in zoom-in-95">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {resp.thoughts.map((t, i) => (
                                      <div
                                        key={i}
                                        className={clsx(
                                          'p-5 rounded-3xl border',
                                          t.isReview ? 'bg-slate-900/50 border-slate-800 italic' : 'bg-indigo-500/5 border-indigo-500/20'
                                        )}
                                      >
                                        <p className="text-[10px] font-black uppercase text-slate-500 mb-2">{t.agentName}</p>
                                        <p className="text-sm text-slate-300">"{t.text}"</p>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedCouncilThoughtIds(prev => ({ ...prev, [m.id]: false }))}
                                      className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                                    >
                                      Свернуть
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  {councilLoading && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] p-5 md:p-6 rounded-[2.5rem] bg-slate-900 border border-slate-800 shadow-xl">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-300">
                            <BrainCircuit size={14} /> Совет обсуждает…
                          </div>
                          <span className="text-[10px] font-black text-slate-500 uppercase">
                            {councilStage === 'router' ? 'Маршрутизация' : councilStage === 'experts' ? 'Эксперты' : councilStage === 'review' ? 'Проверка' : councilStage === 'chairman' ? 'Синтез' : '…'}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                          {[
                            { id: 'router', label: 'Маршрут' },
                            { id: 'experts', label: 'Эксперты' },
                            { id: 'review', label: 'Проверка' },
                            { id: 'chairman', label: 'Синтез' },
                          ].map((s) => {
                            const order = ['router','experts','review','chairman'] as const;
                            const curIdx = order.indexOf(councilStage === 'idle' ? 'router' : councilStage as any);
                            const myIdx = order.indexOf(s.id as any);
                            const done = myIdx < curIdx;
                            const active = myIdx === curIdx;
                            return (
                              <div
                                key={s.id}
                                className={clsx(
                                  'py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest',
                                  done ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                                  : active ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300 animate-pulse'
                                  : 'bg-slate-950 border-slate-800 text-slate-600'
                                )}
                              >
                                {s.label}
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-4 flex items-center gap-2 text-slate-500 text-xs font-bold">
                          <span className="ff-ai-dot" />
                          <span className="ff-ai-dot ff-ai-dot--2" />
                          <span className="ff-ai-dot ff-ai-dot--3" />
                          <span className="ml-2">идёт обсуждение…</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!currentUser) return;
                  const q = councilInput.trim();
                  if (!q) return;

                  const nowIso = new Date().toISOString();
                  const userMsg = { id: `u_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`, role: 'user' as const, text: q, createdAt: nowIso };
                  setCouncilInput('');
                  setShowCouncilThoughts(false);

                  setCouncilMessages(prev => {
                    const next = [...prev, userMsg];
                    persistCouncilHistory(next);
                    return next;
                  });

                  setCouncilLoading(true);
                  setCouncilResponse(null);
                  setCouncilStage('router');

                  const timers: any[] = [];
                  timers.push(setTimeout(() => setCouncilStage(s => (s === 'router' ? 'experts' : s)), 350));
                  timers.push(setTimeout(() => setCouncilStage(s => (s === 'experts' ? 'review' : s)), 900));
                  timers.push(setTimeout(() => setCouncilStage(s => (s === 'review' ? 'chairman' : s)), 1400));

                  try {
                    const r = await callAiCouncil(q, currentUser, foodDiary, habits);

                    const assistantMsg = {
                      id: `a_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
                      role: 'assistant' as const,
                      text: r.finalAnswer,
                      createdAt: new Date().toISOString(),
                      response: r
                    };

                    setCouncilMessages(prev => {
                      const next = [...prev, assistantMsg];
                      persistCouncilHistory(next);
                      return next;
                    });

                    setCouncilResponse(r);
                  } catch (err: any) {
                    const msg = err?.message || 'Ошибка совета.';
                    const assistantMsg = {
                      id: `a_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
                      role: 'assistant' as const,
                      text: `⚠️ ${msg}`,
                      createdAt: new Date().toISOString()
                    };
                    setCouncilMessages(prev => {
                      const next = [...prev, assistantMsg];
                      persistCouncilHistory(next);
                      return next;
                    });
                  } finally {
                    timers.forEach(t => clearTimeout(t));
                    setCouncilLoading(false);
                    setCouncilStage('idle');
                  }
                }}
                className="p-5 md:p-8 bg-slate-950 border-t border-slate-800 flex gap-4"
              >
                <textarea
                  rows={1}
                  className="flex-1 bg-slate-900 border border-slate-800 p-4 md:p-6 rounded-3xl outline-none text-white focus:border-indigo-500 transition-all resize-none"
                  value={councilInput}
                  onChange={(e) => setCouncilInput(e.target.value)}
                  placeholder="Ваш вопрос экспертам..."
                />
                <button
                  disabled={councilLoading || !councilInput.trim()}
                  className="bg-indigo-600 p-4 md:p-6 rounded-3xl text-white hover:bg-indigo-700 transition-all shadow-lg active:scale-95 flex items-center justify-center min-w-[64px]"
                >
                  {councilLoading ? <Loader2 className="animate-spin" /> : <Send size={26} />}
                </button>
              </form>
            </div>
          </div>
        )}

{activeTab === 'pro' && (<div className="max-w-4xl mx-auto space-y-12 py-10 animate-in zoom-in duration-700"><div className="text-center space-y-6"><div className="w-28 h-28 bg-gradient-to-br from-amber-400 to-orange-600 rounded-[3rem] flex items-center justify-center text-white mx-auto shadow-[0_20px_50px_rgba(245,158,11,0.2)]"><Crown size={56} /></div><h1 className="text-5xl font-black text-slate-50">FitFocus Pro</h1><p className="text-slate-400 text-xl font-medium">Все, что нужно для быстрого и здорового результата</p></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6">{[{ title: "Безлимитный AI Анализ", desc: "Узнайте КБЖУ любого блюда за секунду по фото" }, { title: "Персональный Коучинг", desc: "Ежедневные советы на основе ваших данных" }, { title: "Пошаговые рецепты", desc: "AI составит рецепт любого блюда прямо по вашему фото" }, { title: "Экспорт отчетов", desc: "PDF-выгрузка для врача или фитнес-тренера" }].map((f, i) => (<div key={i} className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 flex items-center gap-8 shadow-sm group hover:border-indigo-500/20 transition-all text-left"><div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner shrink-0"><CheckCircle size={32} /></div><div><h4 className="text-xl font-black text-slate-100 mb-1">{f.title}</h4><p className="text-slate-500 font-medium">{f.desc}</p></div></div>))}</div><button onClick={paywall.openPaywall} className="w-full py-8 bg-indigo-600 text-white rounded-[3rem] font-black text-2xl shadow-[0_20px_50px_rgba(79,70,229,0.3)] hover:bg-indigo-700 transition-all hover:-translate-y-1 active:scale-95">Выбрать тарифный план</button></div>)}
        {activeTab === 'course' && (<div className="space-y-10 animate-in fade-in duration-700"><header className="flex items-center justify-between text-left"><div className="text-left"><h1 className="text-4xl font-black text-slate-100 mb-2">Обучение</h1><p className="text-slate-400 font-medium">Ваш навигатор в мире нутрициологии</p></div><div className="flex items-center gap-6"><div className="text-right"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Пройдено</p><p className="text-2xl font-black text-slate-100 tabular-nums">{currentUser?.courseProgress?.completedLessonIds.length || 0} <span className="text-sm text-slate-600">/ {COURSE_LIBRARY.length}</span></p></div></div></header><div className="space-y-12">{[1, 2, 3, 4].map(weekNum => (<div key={weekNum} className="space-y-6"><div className="flex items-center gap-6"><h2 className="text-2xl font-black text-slate-200">Неделя {weekNum}</h2><div className="h-1 bg-slate-800 flex-1 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${(COURSE_LIBRARY.filter(l => l.week === weekNum && currentUser?.courseProgress?.completedLessonIds.includes(l.id)).length / COURSE_LIBRARY.filter(l => l.week === weekNum).length) * 100}%` }} /></div></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">{COURSE_LIBRARY.filter(l => l.week === weekNum).map(lesson => { const done = currentUser?.courseProgress?.completedLessonIds.includes(lesson.id); return (<button key={lesson.id} onClick={() => { setCurrentLesson(lesson); setIsLessonViewOpen(true); }} className={`p-8 rounded-[2.5rem] text-left border transition-all relative group ${done ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900 border-slate-800 shadow-xl hover:border-indigo-500/30'}`}>{done && <CheckCircle size={24} className="absolute top-8 right-8 text-emerald-500" />}<span className={`text-[10px] font-black uppercase tracking-widest block mb-4 ${done ? 'text-emerald-500' : 'text-slate-600'}`}>Урок {lesson.id.split('_')[0].replace('l','')}</span><h4 className={`text-xl font-black leading-tight mb-2 ${done ? 'text-emerald-100' : 'text-slate-100'}`}>{lesson.title}</h4><p className={`text-xs font-bold tabular-nums ${done ? 'text-emerald-500/60' : 'text-slate-500'}`}>{Math.ceil(lesson.readTimeSec/60)} минут чтения</p></button>); })}</div></div>))}</div></div>)}
        
        {activeTab === 'admin' && isAdmin && (
          <AdminScreen />
        )}

{activeTab === 'settings' && (
          <SettingsScreen
            settings={settings}
            onChange={setSettings}
            serverSession={!!googleMe?.sub}
            onServerLogout={logout}
            onDeleteAccount={deleteAccount}
            user={currentUser}
            onChangeUser={(u) => u && persistUser(u)}
            onPatchUser={(patch) => void patchProfileInCloud(patch)}
            onExportBackup={onExportBackup}
            onImportBackup={onImportBackup}
            onConnectAutosave={onConnectAutosave}
            autosaveEnabled={autosaveEnabled}
            syncState={profileSyncState}
            lastProfileSyncAt={lastProfileSyncAt}
            onSyncNow={syncAllLocalDataNow}
            onReloadFromCloud={reloadUserFromCloud}
          />
        )}
      </main>
      {/* Family menu pre-questions */}
      {familyMenuPrefsOpen && currentUser && paywall.plan === 'family' && (
        <div className="fixed inset-0 z-[2100] bg-slate-950/70 backdrop-blur-xl grid place-items-center p-4">
          <div className="w-full max-w-2xl rounded-[2.5rem] border border-slate-800 bg-slate-950/90 shadow-2xl shadow-black/60 p-6 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Семейное меню</p>
                <h3 className="mt-1 text-2xl font-black text-white">Вопросы перед генерацией</h3>
                <p className="mt-2 text-sm text-slate-400 font-semibold">Данные о росте/весе/цели берём из профилей регистрации. Здесь — только параметры готовки.</p>
              </div>
              <button onClick={() => setFamilyMenuPrefsOpen(false)} className="w-10 h-10 rounded-[1.2rem] border border-slate-800 bg-slate-950 hover:border-indigo-500/30 transition-all grid place-items-center text-slate-200"><X size={18} /></button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Сколько членов семьи учитывать?</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {allUsers.map(u => (
                    <label key={u.id} className="flex items-center gap-2 p-3 rounded-[1.4rem] bg-slate-950/40 border border-slate-800 text-slate-200 font-bold">
                      <input
                        type="checkbox"
                        checked={familyMenuPrefs.includeIds.includes(u.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFamilyMenuPrefs(prev => {
                            const set = new Set(prev.includeIds);
                            if (checked) set.add(u.id); else set.delete(u.id);
                            return { ...prev, includeIds: Array.from(set) };
                          });
                        }}
                      />
                      <span>{u.name} <span className="text-slate-500 font-black">({u.age} лет)</span></span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500 font-semibold">Дети: {allUsers.filter(u => familyMenuPrefs.includeIds.includes(u.id) && u.age < 18).map(u => `${u.name} (${u.age})`).join(', ') || 'нет'}</p>
              </div>

              <div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Готовите 1 раз в день или каждый приём?</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <button onClick={() => setFamilyMenuPrefs(prev => ({ ...prev, cookingMode: 'all_meals' }))} className={`p-3 rounded-[1.4rem] border font-black text-sm ${familyMenuPrefs.cookingMode === 'all_meals' ? 'border-indigo-500/40 bg-indigo-600/15 text-indigo-200' : 'border-slate-800 bg-slate-950/40 text-slate-200 hover:border-indigo-500/30'}`}>Каждый приём пищи</button>
                  <button onClick={() => setFamilyMenuPrefs(prev => ({ ...prev, cookingMode: 'once_per_day' }))} className={`p-3 rounded-[1.4rem] border font-black text-sm ${familyMenuPrefs.cookingMode === 'once_per_day' ? 'border-indigo-500/40 bg-indigo-600/15 text-indigo-200' : 'border-slate-800 bg-slate-950/40 text-slate-200 hover:border-indigo-500/30'}`}>1 раз в день (ужин + остатки)</button>
                </div>
              </div>

              <div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Нужно ли учитывать бюджет?</p>
                <div className="mt-3 flex flex-col md:flex-row gap-2">
                  <input value={familyMenuPrefs.budgetPerWeek} onChange={(e) => setFamilyMenuPrefs(prev => ({ ...prev, budgetPerWeek: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Напр. 40000" className="flex-1 px-4 py-3 rounded-[1.4rem] bg-slate-950 border border-slate-800 text-slate-100 font-bold outline-none focus:border-indigo-500/40" />
                  <select value={familyMenuPrefs.currency} onChange={(e) => setFamilyMenuPrefs(prev => ({ ...prev, currency: e.target.value }))} className="px-4 py-3 rounded-[1.4rem] bg-slate-950 border border-slate-800 text-slate-100 font-bold outline-none focus:border-indigo-500/40">
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
                onClick={() => { setFamilyMenuPrefsOpen(false); handleGenerateFamilyWeeklyMenu(); }}
                disabled={!familyMenuPrefs.includeIds.length}
                className="w-full py-4 rounded-[2rem] font-black text-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-900/40 hover:from-indigo-500 hover:to-violet-500 transition-all active:scale-[0.98] disabled:opacity-50"
              >Сгенерировать меню</button>
              <button onClick={() => setFamilyMenuPrefsOpen(false)} className="w-full py-4 rounded-[2rem] font-black text-sm text-slate-200 border border-slate-800 bg-slate-950 hover:border-indigo-500/30 transition-all">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {planIntroOpen && currentUser?.aiPlan && (<div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-xl grid place-items-center p-4"><div className="w-full max-w-2xl rounded-[2.5rem] border border-slate-800 bg-slate-950/90 shadow-2xl shadow-black/60 p-6 text-left"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Ваш AI‑план готов</p><h3 className="mt-1 text-2xl font-black text-white">{currentUser.aiPlan.title}</h3><p className="mt-2 text-sm text-slate-400 font-semibold">{currentUser.aiPlan.strategySummary}</p></div><button onClick={() => setPlanIntroOpen(false)} className="w-10 h-10 rounded-[1.2rem] border border-slate-800 bg-slate-950 hover:border-indigo-500/30 transition-all grid place-items-center text-slate-200"><X size={18} /></button></div><div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3"><div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">KPI на день</p><p className="mt-1 text-xl font-black text-white tabular-nums">{currentUser.aiPlan.dailyKpi.calories} ккал</p><p className="text-sm font-black text-slate-200 tabular-nums">{currentUser.aiPlan.dailyKpi.protein}Б · {currentUser.aiPlan.dailyKpi.fat}Ж · {currentUser.aiPlan.dailyKpi.carbs}У</p><p className="mt-3 text-xs text-indigo-300 font-black uppercase tracking-widest">Фокус недели: {currentUser.aiPlan.weeklyFocus}</p></div><div className="p-4 rounded-[1.8rem] bg-slate-900/30 border border-slate-800"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Первые шаги</p><div className="mt-2 space-y-2">{currentUser.aiPlan.firstTasks.slice(0,3).map((t, i) => (<div key={i} className="text-sm font-bold text-slate-200">• {t}</div>))}</div></div></div>{planError && <p className="mt-4 text-xs text-amber-300 font-bold">{planError}</p>}<div className="mt-6 grid gap-2"><button onClick={() => { setPlanIntroOpen(false); setActiveTab('plan'); }} className="w-full py-4 rounded-[2rem] font-black text-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-900/40 hover:from-indigo-500 hover:to-violet-500 transition-all active:scale-[0.98]">Открыть полный план</button><button onClick={() => { setPlanIntroOpen(false); setActiveTab('nutrition'); }} className="w-full py-4 rounded-[2rem] font-black text-sm text-slate-200 border border-slate-800 bg-slate-950 hover:border-indigo-500/30 transition-all">Начать дневник сегодня</button></div></div></div>)}
      {isLessonViewOpen && currentLesson && (<div className="fixed inset-0 bg-slate-950 z-[200] overflow-y-auto animate-in slide-in-from-right duration-500"><div className="max-w-3xl mx-auto px-6 py-12 pb-32 space-y-12">{!isQuizActive ? (<><button onClick={() => setIsLessonViewOpen(false)} className="flex items-center gap-3 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-indigo-400 transition-colors bg-slate-900 px-6 py-3 rounded-full border border-slate-800"><ChevronLeft size={20} /> Назад</button><header className="space-y-4 text-left"><div className="flex gap-2">{currentLesson.tags.map(t => <span key={t} className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">{t}</span>)}</div><h1 className="text-5xl font-black text-slate-50 leading-tight">{currentLesson.title}</h1></header><div className="space-y-8 text-xl text-slate-400 leading-relaxed font-medium text-left">{currentLesson.content.map((p, i) => <p key={i}>{p}</p>)}</div><div className="bg-slate-900 p-10 rounded-[3rem] space-y-4 border border-slate-800 shadow-2xl text-left"><h3 className="text-2xl font-black text-slate-200">Главный вывод:</h3><p className="text-xl font-bold text-indigo-400 italic">"{currentLesson.takeaway}"</p></div><button onClick={handleMarkLessonRead} className="w-full py-6 bg-slate-100 text-slate-950 rounded-[2.5rem] font-black text-lg shadow-2xl shadow-black/50 hover:bg-white transition-all">Прочитано</button></>) : (<div className="py-20 text-center space-y-12 animate-in zoom-in"><div className="w-24 h-24 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center text-indigo-400 mx-auto shadow-inner border border-indigo-500/20"><Award size={48} /></div><h2 className="text-4xl font-black text-slate-100">{currentLesson.quiz?.question}</h2><div className="grid gap-4">{currentLesson.quiz?.options.map(o => (<button key={o.id} onClick={() => setSelectedQuizOption(o)} className={`w-full p-6 rounded-[2rem] border-4 transition-all text-xl font-black ${selectedQuizOption?.id === o.id ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-500'}`}>{o.text}</button>))}</div><button onClick={handleQuizSubmit} disabled={!selectedQuizOption} className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-lg disabled:opacity-20 transition-all shadow-xl shadow-indigo-900/40">Завершить урок</button></div>)}</div></div>)}
    </div>
  );
};

export default App;
