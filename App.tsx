import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import clsx from 'clsx';
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
import { analyzeFoodPhoto, getCoachAdvice, generatePersonalPlan, generatePlateauExplanation, readAiStatus, AiLastStatus, allowAiRetryNow, getLastAiAction, setLastAiAction, getWeeklyIntelligenceInterpretation, callAiCouncil, generateWeeklyMenu, generateFamilyWeeklyMenu, setAiStorageScope } from './geminiService';
import { analyzeImageQuality } from './services/imageQuality';
import { computeConfidence, confidenceLabel, shouldShowImprove, shouldSuggestPortionAdjust } from './services/aiConfidence';
import { analyzeFoodPhotoEnhanced } from './geminiService';
import { Gender, Goal, UserProfile, FoodItem, FoodEntry, MealType, ActivityLevel, CoachTask, UserHabit, CourseLesson, UsageStats, LessonQuizOption, FoodInsight, AppSettings, FavoriteRecipe, TariffPlan, AIPlan, AppTheme, FamilyWeeklyMenu } from './types';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS } from './constants';
import { calculateDailyTargets } from './profileMath';
import { toggleHabit, calculateStreak, getTodayKey } from './habits';
import { addWeight, weightDelta } from './weight';
import { detectPlateau } from './plateau';
import { generateWeeklyIntelligence } from './weeklyIntelligence';
import { ensureWeeklyReportWithAI, loadWeeklyReports, WeeklyStoredReport } from './weeklyAutoEngine';
import { usePaywall } from './usePaywall';
import { isTestModeEnabled, planLabel, setDevPlanOverride } from './money';
import { buildFallbackAiPlan } from './aiPlanFallback';
import {
  collectLocalStateItems,
  persistAllUsersSnapshot,
  normalizeUserProfiles,
  readStoredAllUsersSnapshotForUser,
  renameLocalStoragePrefix,
  safeRemoveItem,
  safeSetItem,
} from './storage/hybrid';
import { hydrateSessionFromCloud } from './sessionHydration';
import {
  bootstrapAuthSession,
  createLogoutSession,
  deleteAccountSession,
  ensureInviteCodeIsValid,
} from './authSession';
import {
  patchProfileInCloud as patchProfileInCloudService,
  pushProfileToCloud as pushProfileToCloudService,
  reloadUserFromCloud as reloadUserFromCloudService,
  syncAllLocalDataNow as syncAllLocalDataNowService,
} from './profileSync';
import { type RegistrationData } from './RegistrationScreen';
import { runRegistrationFlow } from './registrationFlow';
import { useCouncilChat } from './useCouncilChat';
import { useBackupAutosave } from './useBackupAutosave';
import { useDeleteUserProfile } from './useDeleteUserProfile';
import { useFamilyCloud } from './useFamilyCloud';
import { useFoodSelection } from './useFoodSelection';
import { useFamilyMenu } from './useFamilyMenu';
import SidebarNavigation from './SidebarNavigation';
import AppWorkspace from './AppWorkspace';
import {
  AppTabId,
  mobilePrimaryTabIds,
  sidebarCoreTabIds,
  sidebarFeatureTabIds,
  sidebarTabs,
  sidebarUtilityTabIds,
} from './navigation';

const PlansScreen = React.lazy(() => import('./PlansScreen'));
const SettingsScreen = React.lazy(() => import('./SettingsScreen'));
const AdminScreen = React.lazy(() => import('./AdminScreen'));
const RecipesScreen = React.lazy(() => import('./RecipesScreen'));
const WorkoutsScreen = React.lazy(() => import('./WorkoutsScreen'));
const DashboardCharts = React.lazy(() => import('./charts'));
const FoodInsightCard = React.lazy(() => import('./FoodInsightCard'));
const ShoppingListCard = React.lazy(() => import('./ShoppingListCard'));
const NutritionScreen = React.lazy(() => import('./NutritionScreen'));
const FamilyScreen = React.lazy(() => import('./FamilyScreen'));
const RegistrationScreen = React.lazy(() => import('./RegistrationScreen'));
const AuthChoiceScreen = React.lazy(() => import('./AuthChoiceScreen'));
const DashboardScreen = React.lazy(() => import('./DashboardScreen'));
const PlanScreen = React.lazy(() => import('./PlanScreen'));
const CouncilScreen = React.lazy(() => import('./CouncilScreen'));
const ProScreen = React.lazy(() => import('./ProScreen'));
const CourseScreen = React.lazy(() => import('./CourseScreen'));
const PlanIntroModal = React.lazy(() => import('./PlanIntroModal'));
const LessonViewModal = React.lazy(() => import('./LessonViewModal'));
const FamilyMenuPrefsModal = React.lazy(() => import('./FamilyMenuPrefsModal'));

const GOOGLE_AUTH_PENDING_STORAGE_KEY = 'fitfocus.auth.pending-google.v1';

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
    try {
      sessionStorage.setItem(GOOGLE_AUTH_PENDING_STORAGE_KEY, '1');
    } catch {}
    const params = new URLSearchParams();
    if (inviteCode) params.set("invite", inviteCode);
    params.set("redirect", window.location.origin);
    const authUrl = `/api/auth/google/start?${params.toString()}`;
    try {
      // Use a top-level navigation so OAuth does not get trapped inside an iframe/frame.
      // That avoids Google's cross-origin redirect being blocked by the browser.
      window.top?.location.assign(authUrl);
    } catch {
      window.location.assign(authUrl);
    }
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

// Try to free localStorage space if quota is exceeded (remove heavy fields, keep newest history)
const evictLargeLocalStorage = () => {
  try {
    const keys = Object.keys(localStorage);

    // 1) Trim council chat history
    for (const k of keys) {
      if (!k.startsWith('fitfocus_data_') || !k.endsWith('_council_history')) continue;
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
    // HEIC поддерживается нативно только в части браузеров.
    // Если браузер не может декодировать файл сам, просим выбрать JPG/PNG или использовать камеру.
    try {
      await createImageBitmap(file);
    } catch (e) {
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


const pickLessonForToday = (user: UserProfile, lessons: CourseLesson[]): CourseLesson | null => {
  if (!lessons.length) return null;
  const completedIds = user.courseProgress?.completedLessonIds || [];
  const nextLesson = lessons.find(l => !completedIds.includes(l.id));
  return nextLesson || lessons[0];
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
  const [inviteCode, setInviteCode] = useState<string>('');
  const [requireInvite, setRequireInvite] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteChecking, setInviteChecking] = useState<boolean>(false);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [profileSyncState, setProfileSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileSyncNote, setProfileSyncNote] = useState<string | null>(null);
  const [lastProfileSyncAt, setLastProfileSyncAt] = useState<number | null>(null);
  const [planScope, setPlanScope] = useState<'personal' | 'family'>('personal');

  const [googleMe, setGoogleMe] = useState<
  null | { sub?: string; email?: string; name?: string; picture?: string; roles?: string[] }
>(null);
  const isAdmin = !!googleMe?.roles?.includes('admin');
  const normalizedAllUsers = useMemo(() => normalizeUserProfiles(allUsers), [allUsers]);

  const {
    cloudFamily,
    cloudFamilyMembers,
    cloudFamilyLoading,
    cloudFamilyMenu,
    cloudFamilyError,
    familyInviteCode,
    familyJoinCode,
    familyNameDraft,
    familyShopping,
    familyShoppingLoading,
    loadCloudFamily,
    loadFamilyShopping,
    makeInviteCode,
    createFamilyCloud,
    joinFamilyCloud,
    setCloudFamilyError,
    setFamilyJoinCode,
    setFamilyNameDraft,
    toggleFamilyShoppingItem,
    updateMyFamilyGoal,
    generateFamilyMenuNow,
    setFamilyShopping,
    setFamilyShoppingLoading,
    setCloudFamilyMenu,
    setCloudFamilyMembers,
  } = useFamilyCloud({
    currentUser,
    planScope,
    setPlanScope,
    weekStartISO,
  });

  const {
    familyMenu,
    familyMenuError,
    familyMenuLoading,
    familyMenuPrefs,
    familyMenuPrefsOpen,
    handleGenerateFamilyWeeklyMenu,
    setFamilyMenuError,
    setFamilyMenuPrefs,
    setFamilyMenuPrefsOpen,
  } = useFamilyMenu({
    allUsers,
    cloudFamily,
    cloudFamilyMenu,
    currentUser,
    generateFamilyWeeklyMenu,
    loadCloudFamily,
    loadFamilyShopping,
    setAllUsers,
    setCloudFamilyMenu,
    setCurrentUser,
    weekStartISO,
  });

  useEffect(() => {
    setAiStorageScope(currentUser?.id ?? null);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const key = `fitfocus_data_${currentUser.id}_invite_code`;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        setInviteCode(raw);
        safeSetItem(key, raw);
      }
    } catch {}
  }, [currentUser?.id]);

  useEffect(() => {
    try {
      if (currentUser?.id) {
        safeSetItem(`fitfocus_data_${currentUser.id}_invite_code`, inviteCode);
      }
    } catch {}
  }, [inviteCode, currentUser?.id]);

  // --- Local JSON backup (hybrid approach):
  // - keep normal localStorage flow (fast)
  // - allow export/import JSON to переносить данные между браузерами
  // - optional auto-save to a user-selected JSON file (Chromium)
  const {
    autosaveEnabled,
    onConnectAutosave,
    onExportBackup,
    onImportBackup,
    setAutosaveEnabled,
  } = useBackupAutosave();

  const deleteUserProfile = useDeleteUserProfile({
    currentUserId: currentUser?.id,
    setAllUsers,
    setAuthState,
    setCurrentUser,
  });
  
  const [foodDiary, setFoodDiary] = useState<FoodItem[]>([]);
  const [insightModal, setInsightModal] = useState<null | { id: string; photo: string; name: string; insight: FoodInsight }>(null);
  const [editFoodModal, setEditFoodModal] = useState<null | { id: string; name: string; mealType: MealType; timestamp: string }>(null);
  const insightEntry = useMemo(() => (insightModal ? foodDiary.find(it => it.id === insightModal.id) ?? null : null), [insightModal, foodDiary]);
  const [activeTab, setActiveTab] = useState<AppTabId>('dashboard');
  const mobileMoreStorageKey = useMemo(
    () => `fitfocus.dashboard.mobile-more-open.v1:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id],
  );
  const mobileMoreSkipSaveRef = useRef(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  useEffect(() => {
    try {
      mobileMoreSkipSaveRef.current = true;
      setMobileMoreOpen(localStorage.getItem(mobileMoreStorageKey) === '1');
    } catch {
      mobileMoreSkipSaveRef.current = true;
      setMobileMoreOpen(false);
    }
  }, [mobileMoreStorageKey]);
  useEffect(() => {
    if (mobileMoreSkipSaveRef.current) {
      mobileMoreSkipSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(mobileMoreStorageKey, mobileMoreOpen ? '1' : '0');
    } catch {
      // ignore storage issues
    }
  }, [mobileMoreOpen, mobileMoreStorageKey]);
  const sidebarVisibleTabs = isAdmin ? sidebarTabs : sidebarTabs.filter(tab => tab.id !== 'admin');
  const sidebarCoreTabs = sidebarVisibleTabs.filter(tab => sidebarCoreTabIds.includes(tab.id));
  const sidebarFeatureTabs = sidebarVisibleTabs.filter(tab => sidebarFeatureTabIds.includes(tab.id));
  const sidebarUtilityTabs = sidebarVisibleTabs.filter(tab => sidebarUtilityTabIds.includes(tab.id));
  const mobilePrimaryTabs = sidebarVisibleTabs.filter(tab => mobilePrimaryTabIds.includes(tab.id));
  const mobileMoreTabs = sidebarVisibleTabs.filter(tab => !mobilePrimaryTabIds.includes(tab.id));


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

  const [isScanning, setIsScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraFacingStorageKey = useMemo(
    () => `fitfocus.nutrition.camera-facing.v1:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id],
  );
  const cameraFacingSkipSaveRef = useRef(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>(() => {
    try {
      return (localStorage.getItem(cameraFacingStorageKey) as 'user' | 'environment' | null) || 'environment';
    } catch {
      return 'environment';
    }
  });
  useEffect(() => {
    try {
      cameraFacingSkipSaveRef.current = true;
      const saved = localStorage.getItem(cameraFacingStorageKey);
      setCameraFacing(saved === 'user' ? 'user' : 'environment');
    } catch {
      cameraFacingSkipSaveRef.current = true;
      setCameraFacing('environment');
    }
  }, [cameraFacingStorageKey]);
  useEffect(() => {
    if (cameraFacingSkipSaveRef.current) {
      cameraFacingSkipSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(cameraFacingStorageKey, cameraFacing);
    } catch {
      // ignore storage issues
    }
  }, [cameraFacing, cameraFacingStorageKey]);
  const dashboardWeightStorageKey = useMemo(
    () => `fitfocus.dashboard.new-weight.v1:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id],
  );
  const dashboardWeightSkipSaveRef = useRef(false);
  const [newWeight, setNewWeight] = useState<string>(() => {
    try {
      return localStorage.getItem(dashboardWeightStorageKey) || '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      dashboardWeightSkipSaveRef.current = true;
      setNewWeight(localStorage.getItem(dashboardWeightStorageKey) || '');
    } catch {
      dashboardWeightSkipSaveRef.current = true;
      setNewWeight('');
    }
  }, [dashboardWeightStorageKey]);
  useEffect(() => {
    if (dashboardWeightSkipSaveRef.current) {
      dashboardWeightSkipSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(dashboardWeightStorageKey, newWeight);
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [dashboardWeightStorageKey, newWeight]);
  
  type CourseUiState = {
    lessonId: string | null;
    isLessonViewOpen: boolean;
    isQuizActive: boolean;
    selectedQuizOptionId: string | null;
  };

  const courseUiStorageKey = useMemo(
    () => (currentUser?.id ? `fitfocus.course.ui.v1:${currentUser.id}` : null),
    [currentUser?.id],
  );
  const courseUiHydratedKeyRef = useRef<string | null>(null);

  const [currentLesson, setCurrentLesson] = useState<CourseLesson | null>(null);
  const [isLessonViewOpen, setIsLessonViewOpen] = useState(false);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [selectedQuizOption, setSelectedQuizOption] = useState<LessonQuizOption | null>(null);
  const [courseLibrary, setCourseLibrary] = useState<CourseLesson[] | null>(null);

  // Metabolic Adaptation States
  const [adaptLoading, setAdaptLoading] = useState(false);
  const [adaptNote, setAdaptNote] = useState<string>('');
  const [refeedDate, setRefeedDate] = useState<string | null>(null);

  const [adaptExpanded, setAdaptExpanded] = useState(false);
  const [adaptRead, setAdaptRead] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const kRead = `fitfocus_data_${currentUser.id}_adapt_read`;
    const kExp = `fitfocus_data_${currentUser.id}_adapt_expanded`;
    try {
      const readValue = localStorage.getItem(kRead);
      const expValue = localStorage.getItem(kExp);
      if (readValue !== null) {
        setAdaptRead(readValue === '1');
        safeSetItem(kRead, readValue);
      }
      if (expValue !== null) {
        setAdaptExpanded(expValue === '1');
        safeSetItem(kExp, expValue);
      }
    } catch {}
  }, [currentUser?.id]);

  const resetUiState = useCallback(() => {
    const userId = currentUser?.id;
    try {
      if (userId) {
        [
          `fitfocus.dashboard.new-weight.v1:${userId}`,
          `fitfocus.course.ui.v1:${userId}`,
          `fitfocus.plan.ui.v1:${userId}`,
          `fitfocus.plan.active-day.v1:${userId}`,
          `fitfocus.progress.ui.v1:${userId}`,
          `fitfocus.progress-archive.sections.v1:${userId}`,
          `fitfocus.settings.ui.v1:${userId}`,
          `fitfocus.dashboard.pdf-include-meal-log.v1:${userId}`,
          `fitfocus.dashboard.mobile-more-open.v1:${userId}`,
          `fitfocus.nutrition.search.v1:${userId}`,
          `fitfocus.nutrition.camera-facing.v1:${userId}`,
        ].forEach((key) => localStorage.removeItem(key));
      }
    } catch {
      // ignore
    }

    dashboardWeightSkipSaveRef.current = true;
    mobileMoreSkipSaveRef.current = true;
    cameraFacingSkipSaveRef.current = true;
    setNewWeight('');
    setPdfIncludeMealLog(false);
    setMobileMoreOpen(false);
    setCameraFacing('environment');
    setIsScanning(false);
    setCameraOpen(false);
    setCurrentLesson(null);
    setIsLessonViewOpen(false);
    setIsQuizActive(false);
    setSelectedQuizOption(null);
    setAdaptExpanded(false);
    setAdaptRead(false);
    setPlanIntroOpen(false);
    setPlanRulesExpanded(false);
    setPlanWeekExpanded({});
    setPlanTaskDone({});
    setPlanScope('personal');
    setFamilyMenuPrefsOpen(false);
    setSearchQuery('');
    setShowSearchResults(false);
    setInsightModal(null);
    setEditFoodModal(null);
  }, [currentUser?.id, setPlanScope, setFamilyMenuPrefsOpen]);

  useEffect(() => {
    if (!currentUser) return;
    const kRead = `fitfocus_data_${currentUser.id}_adapt_read`;
    const kExp = `fitfocus_data_${currentUser.id}_adapt_expanded`;
    try {
      safeSetItem(kRead, adaptRead ? '1' : '0');
      safeSetItem(kExp, adaptExpanded ? '1' : '0');
    } catch {}
  }, [adaptRead, adaptExpanded, currentUser?.id]);

  // Weekly Reports History
  const [weeklyReports, setWeeklyReports] = useState<WeeklyStoredReport[]>([]);

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => ({ theme: 'dark', language: 'ru', soundEnabled: false, musicEnabled: false }));

  useEffect(() => {
    if (!currentUser?.id) return;
    const key = `fitfocus_data_${currentUser.id}_settings`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setSettings(parsed as AppSettings);
        safeSetItem(key, raw);
      } else {
        safeSetItem(key, JSON.stringify(settings));
      }
    } catch {}
  }, [currentUser?.id]);

  useEffect(() => {
    try {
      if (!currentUser?.id) return;
      safeSetItem(`fitfocus_data_${currentUser.id}_settings`, JSON.stringify(settings));
    } catch {}
  }, [settings, currentUser?.id]);

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
  const [favoriteRecipes, setFavoriteRecipes] = useState<FavoriteRecipe[]>([]);

  useEffect(() => {
    if (!currentUser?.id) {
      setFavoriteRecipes([]);
      return;
    }
    const key = `fitfocus_data_${currentUser.id}_favorite_recipes`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setFavoriteRecipes([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setFavoriteRecipes(Array.isArray(parsed) ? parsed : []);
      safeSetItem(key, JSON.stringify(Array.isArray(parsed) ? parsed : []));
    } catch {
      setFavoriteRecipes([]);
    }
  }, [currentUser?.id]);

  const persistFavorites = useCallback((next: FavoriteRecipe[]) => {
    setFavoriteRecipes(next);
    if (!currentUser?.id) return;
    try {
      safeSetItem(`fitfocus_data_${currentUser.id}_favorite_recipes`, JSON.stringify(next));
    } catch {}
  }, [currentUser?.id]);

  const addFavoriteRecipe = useCallback((fav: FavoriteRecipe) => {
    persistFavorites([fav, ...favoriteRecipes].slice(0, 100));
  }, [favoriteRecipes, persistFavorites]);

  const removeFavoriteRecipe = useCallback((id: string) => {
    persistFavorites(favoriteRecipes.filter(r => r.id !== id));
  }, [favoriteRecipes, persistFavorites]);

  const clearFavoriteRecipes = useCallback(() => {
    persistFavorites([]);
  }, [persistFavorites]);

  const paywall = usePaywall(currentUser?.plan || 'free', requireInvite);
  const modeBadge = useMemo(() => {
    if (requireInvite || isTestModeEnabled()) {
      return {
        text: 'BETA · ПОЛНЫЙ ДОСТУП',
        cls: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
      };
    }
    return {
      text: `PLAN · ${planLabel(paywall.plan)}`,
      cls: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-200',
    };
  }, [paywall.plan, requireInvite]);
  const pdfMealLogStorageKey = useMemo(
    () => `fitfocus.dashboard.pdf-include-meal-log.v1:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id],
  );
  const pdfMealLogSkipSaveRef = useRef(false);
  const [pdfIncludeMealLog, setPdfIncludeMealLog] = useState<boolean>(() => {
    try {
      return localStorage.getItem(pdfMealLogStorageKey) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      pdfMealLogSkipSaveRef.current = true;
      setPdfIncludeMealLog(localStorage.getItem(pdfMealLogStorageKey) === '1');
    } catch {
      pdfMealLogSkipSaveRef.current = true;
      setPdfIncludeMealLog(false);
    }
  }, [pdfMealLogStorageKey]);
  useEffect(() => {
    if (pdfMealLogSkipSaveRef.current) {
      pdfMealLogSkipSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(pdfMealLogStorageKey, pdfIncludeMealLog ? '1' : '0');
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [pdfIncludeMealLog, pdfMealLogStorageKey]);

  const [coachCard, setCoachCard] = useState<{ title: string; advice: string; bullets: string[] } | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const [habits, setHabits] = useState<UserHabit[]>(INITIAL_HABITS);
  // AI Council (Orchestrator v2)
  const {
    councilInput,
    setCouncilInput,
    councilLoading,
    councilStage,
    councilMessages,
    expandedCouncilThoughtIds,
    setExpandedCouncilThoughtIds,
    councilScrollRef,
    handleCouncilSubmit,
    clearCouncilHistory,
  } = useCouncilChat({ currentUser, foodDiary, habits });
  const [foodHistory, setFoodHistory] = useState<FastLogItem[]>([]);
  const [foodFavorites, setFoodFavorites] = useState<FastLogItem[]>([]);
  const nutritionSearchStorageKey = useMemo(
    () => `fitfocus.nutrition.search.v1:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id],
  );
  const nutritionSearchSkipSaveRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  useEffect(() => {
    try {
      nutritionSearchSkipSaveRef.current = true;
      const raw = localStorage.getItem(nutritionSearchStorageKey);
      if (!raw) {
        setSearchQuery('');
        setShowSearchResults(false);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { query?: string; open?: boolean };
        setSearchQuery(typeof parsed.query === 'string' ? parsed.query : '');
        setShowSearchResults(!!parsed.open);
      } catch {
        setSearchQuery(raw);
        setShowSearchResults(false);
      }
    } catch {
      nutritionSearchSkipSaveRef.current = true;
      setSearchQuery('');
      setShowSearchResults(false);
    }
  }, [nutritionSearchStorageKey]);
  useEffect(() => {
    if (nutritionSearchSkipSaveRef.current) {
      nutritionSearchSkipSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(nutritionSearchStorageKey, JSON.stringify({ query: searchQuery, open: showSearchResults }));
    } catch {
      // ignore storage issues
    }
  }, [nutritionSearchStorageKey, searchQuery, showSearchResults]);

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
  const [regData, setRegData] = useState<RegistrationData>({
    name: '',
    gender: Gender.MALE,
    weight: 70,
    height: 170,
    age: 25,
    activityLevel: ActivityLevel.MODERATELY_ACTIVE,
    goal: Goal.LOSS,
    targetWeight: 65,
    dietary: { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict' as const, notes: '' },
    medicalRestrictions: '',
    bloodPressureSystolic: 0,
    bloodPressureDiastolic: 0,
    restingPulse: 0,
    waistCm: 0,
    chestCm: 0,
    hipsCm: 0,
    plan: isTestModeEnabled() ? 'family' as TariffPlan : 'free' as TariffPlan,
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

  const planUiStorageKey = useMemo(
    () => `fitfocus.plan.ui.v1:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id],
  );
  const planUiSkipSaveRef = useRef(false);
  const [planIntroOpen, setPlanIntroOpen] = useState(false);
  const [weeklyMenuLoading, setWeeklyMenuLoading] = useState(false);
  const [weeklyMenuError, setWeeklyMenuError] = useState<string | null>(null);
  const [planTaskDone, setPlanTaskDone] = useState<Record<string, boolean>>({});
  const [planWeekExpanded, setPlanWeekExpanded] = useState<Record<string, boolean>>({});
  const [planRulesExpanded, setPlanRulesExpanded] = useState(false);

  useEffect(() => {
    try {
      planUiSkipSaveRef.current = true;
      const raw = localStorage.getItem(planUiStorageKey);
      if (!raw) {
        setPlanIntroOpen(false);
        setPlanRulesExpanded(false);
        setPlanScope('personal');
        setFamilyMenuPrefsOpen(false);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<{
        planIntroOpen: boolean;
        planRulesExpanded: boolean;
        planScope: 'personal' | 'family';
        familyMenuPrefsOpen: boolean;
        planWeekExpanded: Record<string, boolean>;
      }>;
      setPlanIntroOpen(!!parsed.planIntroOpen);
      setPlanRulesExpanded(!!parsed.planRulesExpanded);
      setPlanScope(parsed.planScope === 'family' ? 'family' : 'personal');
      setFamilyMenuPrefsOpen(!!parsed.familyMenuPrefsOpen);
    } catch {
      planUiSkipSaveRef.current = true;
      setPlanIntroOpen(false);
      setPlanRulesExpanded(false);
      setPlanScope('personal');
      setFamilyMenuPrefsOpen(false);
    }
  }, [planUiStorageKey]);

  useEffect(() => {
    if (!currentUser?.id) {
      setPlanTaskDone({});
      return;
    }
    try {
      const newKey = `fitfocus_data_${currentUser.id}_plan_task_done`;
      const raw = localStorage.getItem(newKey);
      if (raw) {
        safeSetItem(newKey, raw);
      }
      setPlanTaskDone(raw ? JSON.parse(raw) : {});
    } catch {
      setPlanTaskDone({});
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    safeSetItem(`fitfocus_data_${currentUser.id}_plan_task_done`, JSON.stringify(planTaskDone));
  }, [currentUser?.id, planTaskDone]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    (currentUser?.aiPlan?.weeklyMenu?.days ?? []).forEach((day, idx) => {
      next[day.day] = typeof planWeekExpanded[day.day] === 'boolean' ? planWeekExpanded[day.day] : idx < 2;
    });
    setPlanWeekExpanded(next);
  }, [currentUser?.aiPlan?.weeklyMenu?.weekStart, currentUser?.aiPlan?.weeklyMenu?.days?.length]);

  useEffect(() => {
    try {
      planUiSkipSaveRef.current = true;
      const raw = localStorage.getItem(planUiStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        planWeekExpanded: Record<string, boolean>;
      }>;
      const storedWeek = parsed.planWeekExpanded && typeof parsed.planWeekExpanded === 'object' ? parsed.planWeekExpanded : {};
      const days = currentUser?.aiPlan?.weeklyMenu?.days ?? [];
      if (!days.length) {
        setPlanWeekExpanded(storedWeek);
        return;
      }
      const next: Record<string, boolean> = {};
      days.forEach((day, idx) => {
        next[day.day] = typeof storedWeek[day.day] === 'boolean' ? storedWeek[day.day] : idx < 2;
      });
      setPlanWeekExpanded(next);
    } catch {
      planUiSkipSaveRef.current = true;
    }
  }, [currentUser?.aiPlan?.weeklyMenu?.days?.length, currentUser?.aiPlan?.weeklyMenu?.weekStart, planUiStorageKey]);

  useEffect(() => {
    if (planUiSkipSaveRef.current) {
      planUiSkipSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(planUiStorageKey, JSON.stringify({
        planIntroOpen,
        planRulesExpanded,
        planScope,
        familyMenuPrefsOpen,
        planWeekExpanded,
      }));
    } catch {
      // no-op
    }
  }, [familyMenuPrefsOpen, planIntroOpen, planRulesExpanded, planScope, planUiStorageKey, planWeekExpanded]);
  const [planError, setPlanError] = useState<string | null>(null);

  // Cinematic AI activation steps
  const ACTIVATION_TOTAL_MS = 3200;
  const ACTIVATION_STEPS = useMemo(() => ([
    { title: 'AI анализирует профиль…', subtitle: 'Считываем параметры и контекст цели', icon: Brain },
    { title: 'Считаем метаболизм и KPI…', subtitle: 'BMR, TDEE и дневные макросы', icon: Activity },
    { title: 'Готовим персональную стратегию…', subtitle: 'Подбираем режим и прогноз на 4 недели', icon: Sparkles },
    { title: 'Сохраняем и синхронизируем данные…', subtitle: 'Сначала локально, затем в облако', icon: ShieldCheck },
  ]), []);
  const ACTIVATION_STEP_MS = Math.round(ACTIVATION_TOTAL_MS / ACTIVATION_STEPS.length);

  const canAddProfile = useCallback((users: UserProfile[]) => users.length < 5, []);
  
  const regNameTrim = (regData.name ?? '').trim();
  const regNameValid = regNameTrim.length > 0;

  const suppressNextFullProfileSyncRef = useRef(false);
  const suppressProfileSyncStateRef = useRef(false);
  const hasPendingProfileChangesRef = useRef(false);
  const lastAutoCloudSyncAttemptAtRef = useRef(0);
  const CLOUD_SYNC_AUTO_RETRY_COOLDOWN_MS = 60_000;

  const persistUser = useCallback((updated: UserProfile) => {
    setCurrentUser(updated);
    if (!suppressProfileSyncStateRef.current) {
      setProfileSyncState('saving');
    }
    if (googleMe?.sub && !suppressNextFullProfileSyncRef.current) {
      hasPendingProfileChangesRef.current = true;
    }
    setAllUsers(prev => {
      const found = prev.some(u => u.id === updated.id);
      const next = found ? prev.map(u => u.id === updated.id ? updated : u) : [updated, ...prev];
      const normalized = normalizeUserProfiles(next);
      persistAllUsersSnapshot(updated.id, normalized);
      return normalized;
    });
  }, [googleMe?.sub, persistAllUsersSnapshot]);

  useEffect(() => {
    if (normalizedAllUsers.length !== allUsers.length) {
      setAllUsers(normalizedAllUsers);
      return;
    }
    const allKeys = allUsers.map((u) => `${u.googleSub || ''}|${u.email || ''}|${u.id || ''}`);
    const normalizedKeys = normalizedAllUsers.map((u) => `${u.googleSub || ''}|${u.email || ''}|${u.id || ''}`);
    if (allKeys.join('||') !== normalizedKeys.join('||')) {
      setAllUsers(normalizedAllUsers);
    }
  }, [allUsers, normalizedAllUsers]);

  // ---- Weekly menus (personal + family) ----
  const handleGenerateWeeklyMenu = useCallback(async () => {
    if (!currentUser?.aiPlan) return;
    setWeeklyMenuError(null);
    setWeeklyMenuLoading(true);
    try {
      const weeklyMenu = await generateWeeklyMenu(currentUser, currentUser.aiPlan);
      const updatedUser: UserProfile = { ...currentUser, aiPlan: { ...currentUser.aiPlan, weeklyMenu } };
      persistUser(updatedUser);
    } catch (e: any) {
      setWeeklyMenuError(e?.message || 'Не удалось сгенерировать меню на неделю.');
    } finally {
      setWeeklyMenuLoading(false);
    }
  }, [currentUser, persistUser]);

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
  const lessons = courseLibrary ?? [];

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

  const logout = useMemo(() => createLogoutSession({
    googleSub: googleMe?.sub,
    setGoogleMe,
    setCurrentUser,
    setProfileSyncState,
    setLastProfileSyncAt,
    setAuthState,
  }), [googleMe?.sub]);

  const deleteAccount = useCallback(async () => {
    await deleteAccountSession({
      googleSub: googleMe?.sub,
      onLogout: logout,
    });
  }, [googleMe?.sub, logout]);

  const loginAsUser = useCallback(async (
    user: UserProfile,
    authUser: null | { sub?: string; email?: string; picture?: string } = googleMe,
  ) => {
    const normalizedUser = authUser?.sub && user.id !== authUser.sub
      ? {
          ...user,
          id: authUser.sub,
          googleSub: authUser.sub,
          email: authUser.email ?? user.email,
          picture: authUser.picture ?? user.picture,
        }
      : user;

    if (authUser?.sub && user.id !== authUser.sub) {
      renameLocalStoragePrefix(
        `fitfocus_data_${user.id}_`,
        `fitfocus_data_${authUser.sub}_`,
      );
      persistAllUsersSnapshot(authUser.sub, (readStoredAllUsersSnapshotForUser<UserProfile>(user.id) || [user]).map((profile) =>
        profile.id === user.id
          ? {
              ...profile,
              id: authUser.sub,
              googleSub: authUser.sub,
              email: authUser.email ?? profile.email,
              picture: authUser.picture ?? profile.picture,
            }
          : profile
      ));
    }

    const hydrated = await hydrateSessionFromCloud(normalizedUser, {
      resetUsageIfNewTime,
      initialHabits: INITIAL_HABITS,
    });

    const nextUserBase = authUser?.sub && hydrated.currentUser.id !== authUser.sub
      ? {
          ...hydrated.currentUser,
          id: authUser.sub,
          googleSub: authUser.sub,
          email: authUser.email ?? hydrated.currentUser.email,
          picture: authUser.picture ?? hydrated.currentUser.picture,
        }
      : hydrated.currentUser;
    const nextUser = nextUserBase.aiPlan ? nextUserBase : { ...nextUserBase, aiPlan: buildFallbackAiPlan(nextUserBase) };
    setCurrentUser(nextUser);
    if (Array.isArray(hydrated.allUsers) && hydrated.allUsers.length > 0) {
      setAllUsers(hydrated.allUsers);
    }
    setWeeklyReports(hydrated.weeklyReports);
    setFoodDiary(hydrated.foodDiary);
    setHabits(hydrated.habits);
    setFoodHistory(hydrated.foodHistory);
    setFoodFavorites(hydrated.foodFavorites);
    setCoachCard(hydrated.coachCard);
    setCurrentLesson(null);
    setAuthState('app');
    setProfileSyncState('saved');
    setLastProfileSyncAt(Date.now());
    if (!hydrated.currentUser.aiPlan) {
      persistUser(nextUser);
    }
  }, [googleMe?.sub, googleMe?.email, googleMe?.picture, resetUsageIfNewTime]);


  const pushProfileToCloud = useCallback(async (profile: UserProfile) => {
    if (!googleMe?.sub) {
      setProfileSyncState('idle');
      setProfileSyncNote(null);
      return;
    }
    await pushProfileToCloudService(profile, {
      currentUser,
      setProfileSyncState,
      setProfileSyncNote,
      setLastProfileSyncAt,
      setAllUsers,
      persistUser,
      loginAsUser,
      collectLocalStateItemsImpl: collectLocalStateItems,
      persistAllUsersSnapshotImpl: persistAllUsersSnapshot,
      fetchImpl: fetch,
      suppressNextFullProfileSyncRef,
      suppressProfileSyncStateRef,
    });
  }, [currentUser, googleMe?.sub, loginAsUser, persistUser]);

  const patchProfileInCloud = useCallback(async (patch: Partial<UserProfile>) => {
    await patchProfileInCloudService(patch, {
      currentUser,
      setProfileSyncState,
      setProfileSyncNote,
      setLastProfileSyncAt,
      setAllUsers,
      persistUser,
      loginAsUser,
      collectLocalStateItemsImpl: collectLocalStateItems,
      persistAllUsersSnapshotImpl: persistAllUsersSnapshot,
      fetchImpl: fetch,
      suppressNextFullProfileSyncRef,
      suppressProfileSyncStateRef,
    });
  }, [currentUser, loginAsUser, persistUser]);

  const syncAllLocalDataNow = useCallback(async () => {
    if (!googleMe?.sub) {
      setProfileSyncState('idle');
      setProfileSyncNote(null);
      setLastProfileSyncAt(null);
      return;
    }
    await syncAllLocalDataNowService({
      currentUser,
      setProfileSyncState,
      setProfileSyncNote,
      setLastProfileSyncAt,
      setAllUsers,
      persistUser,
      loginAsUser,
      collectLocalStateItemsImpl: collectLocalStateItems,
      persistAllUsersSnapshotImpl: persistAllUsersSnapshot,
      fetchImpl: fetch,
      suppressNextFullProfileSyncRef,
      suppressProfileSyncStateRef,
    });
  }, [currentUser, googleMe?.sub, loginAsUser, persistUser]);

  useEffect(() => {
    if (profileSyncState === 'saved') {
      hasPendingProfileChangesRef.current = false;
    }
  }, [profileSyncState]);

  const reloadUserFromCloud = useCallback(async () => {
    if (!googleMe?.sub) {
      setProfileSyncState('idle');
      setProfileSyncNote(null);
      return;
    }
    await reloadUserFromCloudService({
      currentUser,
      setProfileSyncState,
      setProfileSyncNote,
      setLastProfileSyncAt,
      setAllUsers,
      persistUser,
      loginAsUser,
      collectLocalStateItemsImpl: collectLocalStateItems,
      persistAllUsersSnapshotImpl: persistAllUsersSnapshot,
      fetchImpl: fetch,
      suppressNextFullProfileSyncRef,
      suppressProfileSyncStateRef,
    });
  }, [currentUser, googleMe?.sub, loginAsUser, persistUser]);

  // Server-driven: persist profile changes to D1 (debounced)
  const profileSaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    if (!googleMe?.sub) {
      if (profileSyncState !== 'idle') {
        setProfileSyncState('idle');
      }
      if (profileSyncNote) {
        setProfileSyncNote(null);
      }
      if (lastProfileSyncAt !== null) {
        setLastProfileSyncAt(null);
      }
      return;
    }
    if (suppressNextFullProfileSyncRef.current) {
      suppressNextFullProfileSyncRef.current = false;
      return;
    }
    if (profileSaveTimer.current) window.clearTimeout(profileSaveTimer.current);
    profileSaveTimer.current = window.setTimeout(async () => {
      await pushProfileToCloud(currentUser);
    }, 500);
    return () => {
      if (profileSaveTimer.current) {
        window.clearTimeout(profileSaveTimer.current);
        profileSaveTimer.current = null;
      }
    };
  }, [currentUser, googleMe?.sub, pushProfileToCloud]);

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
    const key = `fitfocus_data_${currentUser.id}_refeed`;
    const value = d.toISOString().slice(0, 10);
    safeSetItem(key, value);
    setRefeedDate(value);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const key = `fitfocus_data_${currentUser.id}_refeed`;
    const value = localStorage.getItem(key);
    if (value) {
      safeSetItem(key, value);
    }
    setRefeedDate(value);
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

  const {
    selectedFoodIds,
    toggleFoodSelected,
    bulkUpdateMealType,
    bulkRemoveSelectedFoods,
  } = useFoodSelection(setFoodDiary, deleteFoodEntry);

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
    let continueAfterGoogle = false;
    try {
      continueAfterGoogle = sessionStorage.getItem(GOOGLE_AUTH_PENDING_STORAGE_KEY) === '1';
    } catch {}

    try {
      const authParam = new URLSearchParams(window.location.search).get('auth');
      if (authParam === 'google') {
        continueAfterGoogle = true;
        try {
          sessionStorage.setItem(GOOGLE_AUTH_PENDING_STORAGE_KEY, '1');
        } catch {}
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('auth');
        window.history.replaceState({}, '', cleanUrl.toString());
      }
    } catch {}

    await bootstrapAuthSession({
      requireInvite,
      loginAsUser,
      setGoogleMe,
      setInviteError,
      setAuthState,
      setAllUsers,
      setRegData,
      continueAfterGoogle,
    });
  }, [loginAsUser, requireInvite]);

  useEffect(() => {
    void bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    if (authState !== 'register') return;
    if (googleMe?.sub) return;
    setAuthState('auth_choice');
  }, [authState, googleMe?.sub]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') !== 'success') return;
    if (!currentUser) return;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('billing');
    window.history.replaceState({}, '', cleanUrl.toString());
    void reloadUserFromCloud();
  }, [currentUser?.id, reloadUserFromCloud]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod = await import('./lessons');
        if (!alive) return;
        setCourseLibrary(mod.COURSE_LIBRARY);
      } catch {
        if (!alive) return;
        setCourseLibrary([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !courseLibrary) return;
    if (!courseUiStorageKey) return;

    if (courseUiHydratedKeyRef.current !== courseUiStorageKey) {
      let savedCourseUi: CourseUiState | null = null;
      try {
        const raw = localStorage.getItem(courseUiStorageKey);
        if (raw) {
          savedCourseUi = JSON.parse(raw) as CourseUiState;
        }
      } catch {
        savedCourseUi = null;
      }

      const savedLesson = savedCourseUi?.lessonId ? courseLibrary.find((lesson) => lesson.id === savedCourseUi.lessonId) || null : null;
      const nextLesson = savedLesson || pickLessonForToday(currentUser, courseLibrary);
      if (nextLesson) {
        setCurrentLesson(nextLesson);
      }
      setIsLessonViewOpen(Boolean(savedCourseUi?.isLessonViewOpen));
      setIsQuizActive(Boolean(savedCourseUi?.isQuizActive));
      if (nextLesson?.quiz && savedCourseUi?.selectedQuizOptionId) {
        setSelectedQuizOption(nextLesson.quiz.options.find((option) => option.id === savedCourseUi.selectedQuizOptionId) || null);
      } else {
        setSelectedQuizOption(null);
      }
      courseUiHydratedKeyRef.current = courseUiStorageKey;
      return;
    }

    if (currentLesson) return;
    const nextLesson = pickLessonForToday(currentUser, courseLibrary);
    if (nextLesson) setCurrentLesson(nextLesson);
  }, [currentUser, courseLibrary, currentLesson, courseUiStorageKey]);

  useEffect(() => {
    if (!courseUiStorageKey) return;
    if (courseUiHydratedKeyRef.current !== courseUiStorageKey) return;
    const payload: CourseUiState = {
      lessonId: currentLesson?.id || null,
      isLessonViewOpen,
      isQuizActive,
      selectedQuizOptionId: selectedQuizOption?.id || null,
    };
    try {
      localStorage.setItem(courseUiStorageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [courseUiStorageKey, currentLesson?.id, isLessonViewOpen, isQuizActive, selectedQuizOption?.id]);

  useEffect(() => {
    if (!googleMe?.sub || !currentUser) return;
    const syncFromCloud = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastAutoCloudSyncAttemptAtRef.current < CLOUD_SYNC_AUTO_RETRY_COOLDOWN_MS) {
        return;
      }
      lastAutoCloudSyncAttemptAtRef.current = now;
      if (hasPendingProfileChangesRef.current || profileSyncState === 'error') {
        void syncAllLocalDataNow();
        return;
      }
      void reloadUserFromCloud();
    };
    window.addEventListener('online', syncFromCloud);
    document.addEventListener('visibilitychange', syncFromCloud);
    return () => {
      window.removeEventListener('online', syncFromCloud);
      document.removeEventListener('visibilitychange', syncFromCloud);
    };
  }, [googleMe?.sub, currentUser?.id, profileSyncState, reloadUserFromCloud, syncAllLocalDataNow]);

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
    return ensureInviteCodeIsValid({
      requireInvite,
      inviteCode,
      setInviteError,
      setInviteChecking,
    });
  }, [requireInvite, inviteCode]);

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
        user: {
          name: currentUser.name,
          goal: currentUser.goal,
          caloriesTarget: targets.calories,
          proteinTarget: targets.protein,
          fatTarget: targets.fat,
          carbsTarget: targets.carbs,
          adaptationMultiplier: currentUser.adaptationMultiplier,
          bloodPressureSystolic: currentUser.bloodPressureSystolic,
          bloodPressureDiastolic: currentUser.bloodPressureDiastolic,
          restingPulse: currentUser.restingPulse,
          waistCm: currentUser.waistCm,
          chestCm: currentUser.chestCm,
          hipsCm: currentUser.hipsCm,
          medicalRestrictions: currentUser.medicalRestrictions,
        },
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
        persistUser({ ...currentUser, aiPlan: buildFallbackAiPlan(currentUser) });
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
    await runRegistrationFlow({
      regData,
      regNameValid,
      allUsersCount: normalizedAllUsers.length,
      requireInvite,
      inviteCode,
      googleMe,
      setPlanError,
      setLastAiAction,
      setDevPlanOverride,
      generatePersonalPlan,
      loginAsUser,
      setAllUsers,
      setActiveTab,
      setPlanIntroOpen,
      fetchImpl: fetch,
    });
  }, [regData, loginAsUser, regNameValid, normalizedAllUsers.length, requireInvite, inviteCode, googleMe, generatePersonalPlan, setLastAiAction]);

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

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.aiPlan) return;
    persistUser({ ...currentUser, aiPlan: buildFallbackAiPlan(currentUser) });
  }, [currentUser?.id, currentUser?.aiPlan, persistUser]);

  const closeLessonView = useCallback(() => {
    setIsQuizActive(false);
    setIsLessonViewOpen(false);
    setSelectedQuizOption(null);
  }, []);

  const handleMarkLessonRead = useCallback(() => {
    if (!currentUser || !currentLesson) return;
    const progress = currentUser.courseProgress || { completedLessonIds: [], streak: 0 };
    if (progress.completedLessonIds.includes(currentLesson.id)) {
      closeLessonView();
      return;
    }
    const todayStr = new Date().toLocaleDateString('en-CA');
    const nextProgress = {
      completedLessonIds: [...progress.completedLessonIds, currentLesson.id],
      lastLessonDate: todayStr,
      lastLessonId: currentLesson.id,
      streak: (progress.streak || 0) + 1
    };
    persistUser({ ...currentUser, courseProgress: nextProgress });
    closeLessonView();
  }, [closeLessonView, currentUser, currentLesson, persistUser]);

  const handleStartLessonQuiz = useCallback(() => {
    if (!currentLesson?.quiz) return;
    setSelectedQuizOption(null);
    setIsQuizActive(true);
  }, [currentLesson]);

  const handleQuizSubmit = useCallback(() => {
    if (!currentUser || !currentLesson || !selectedQuizOption) return;
    const newAnswer = { lessonId: currentLesson.id, optionId: selectedQuizOption.id, date: new Date().toLocaleDateString('en-CA') };
    persistUser({ ...currentUser, lessonQuizAnswers: [...(currentUser.lessonQuizAnswers || []), newAnswer] });
    closeLessonView();
  }, [closeLessonView, currentUser, currentLesson, persistUser, selectedQuizOption]);

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

  const syncBadge = useMemo(() => {
    const lastSync = lastProfileSyncAt ? new Date(lastProfileSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
    if (!googleMe?.sub) {
      return {
        label: 'Cloud: local',
        cls: 'bg-slate-800/60 text-slate-300 border-slate-700',
        title: 'Облачная синхронизация не активна: войдите в Google, чтобы сохранять данные между устройствами.',
      };
    }
    if (profileSyncState === 'saving') {
      return {
        label: 'Cloud: saving',
        cls: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/20',
        title: `Синхронизация с облаком… Последний успешный синк: ${lastSync}`,
      };
    }
    if (profileSyncState === 'saved') {
      return {
        label: 'Cloud: saved',
        cls: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20',
        title: `Синхронизировано с облаком. Последний синк: ${lastSync}`,
      };
    }
    if (profileSyncState === 'error') {
      return {
        label: 'Cloud: error',
        cls: 'bg-rose-500/10 text-rose-200 border-rose-500/20',
        title: profileSyncNote
          ? `${profileSyncNote} Последний успешный синк: ${lastSync}`
          : `Ошибка синхронизации. Последний успешный синк: ${lastSync}`,
      };
    }
    return {
      label: 'Cloud: idle',
      cls: 'bg-slate-800/60 text-slate-300 border-slate-700',
      title: profileSyncNote || `Синхронизация готова. Последний синк: ${lastSync}`,
    };
  }, [googleMe?.sub, lastProfileSyncAt, profileSyncNote, profileSyncState]);

  const workspaceProps = {
    meta: {
      activeTab,
      isAdmin,
      currentUser,
      paywall,
      setActiveTab,
      googleMe,
      logout,
      deleteAccount,
      persistUser,
      patchProfileInCloud,
      onExportBackup,
      onImportBackup,
      onConnectAutosave,
      autosaveEnabled,
      profileSyncState,
      lastProfileSyncAt,
      syncAllLocalDataNow,
      reloadUserFromCloud,
      resetUiState,
      aiBadge,
      retryMeta,
    },
    dashboard: {
      dailyStats,
      targets,
      weightHistory: currentUser?.weightHistory || [],
      dailyHabits: currentUser?.dailyHabits,
      weightTrend,
      currentWeight: currentUser?.weight,
      handleToggleHabit,
      exportShortPdf,
      exportDetailedPdf,
      pdfIncludeMealLog,
      setPdfIncludeMealLog,
      newWeight,
      setNewWeight,
      logWeight,
      plateau: !!plateau,
      adaptationIndex,
      adaptationStatus,
      compliancePct,
      deltaDays,
      weightDeltaN,
      refeedSuggestion,
      refeedDate,
      scheduleRefeedTomorrow,
      expectedN,
      adaptLoading,
      setAdaptLoading,
      setLastAiAction,
      generatePlateauExplanation,
      adaptNote,
      setAdaptNote,
      adaptExpanded,
      setAdaptExpanded,
      adaptRead,
      setAdaptRead,
      weekly,
      weeklyReports,
      exportWeeklyPDF,
    },
    progress: {
      weightHistory: currentUser?.weightHistory || [],
      measurementsHistory: currentUser?.measurementsHistory || [],
      progressPhotos: currentUser?.progressPhotos || [],
      currentWeight: currentUser?.weight ?? null,
      targetWeight: currentUser?.targetWeight ?? null,
      wearableProvider: currentUser?.wearableProvider,
      wearableEnabled: currentUser?.wearableEnabled,
      wearableConnectedAt: currentUser?.wearableConnectedAt,
      wearableLastSyncAt: currentUser?.wearableLastSyncAt,
      wearableStepsToday: currentUser?.wearableStepsToday,
      wearableActiveMinutesToday: currentUser?.wearableActiveMinutesToday,
      wearableSleepHoursLastNight: currentUser?.wearableSleepHoursLastNight,
      wearableMetricsUpdatedAt: currentUser?.wearableMetricsUpdatedAt,
      onPatchUser: patchProfileInCloud,
      syncState: profileSyncState,
      lastProfileSyncAt,
      onSyncNow: syncAllLocalDataNow,
      onOpenSettings: () => setActiveTab('settings'),
    },
    plan: {
      planTaskDone,
      setPlanTaskDone,
      setPlanIntroOpen,
      setPlanRulesExpanded,
      planRulesExpanded,
      planWeekExpanded,
      setPlanWeekExpanded,
      weeklyMenuLoading,
      handleGenerateWeeklyMenu,
      weeklyMenuError,
      currentUserAiPlan: currentUser?.aiPlan,
      currentUserTargetWeight: currentUser?.targetWeight,
      formatGramsPretty,
      MealParts,
      cloudFamily,
      planScope,
      setPlanScope,
      familyShoppingLoading,
      familyShopping,
      toggleFamilyShoppingItem,
      loadFamilyShopping,
      familyMenuError,
      familyMenu,
      familyMenuLoading,
      setFamilyMenuPrefsOpen,
      handleGenerateFamilyWeeklyMenu,
      paywallPlan: paywall.plan,
      allUsers,
      currentUserGoal: currentUser?.goal || Goal.MAINTAIN,
      DEFAULT_DEFICIT,
      DEFAULT_SURPLUS,
    },
    nutrition: {
      cameraOpen,
      setCameraOpen,
      cameraFacing,
      setCameraFacing,
      handlePhotoUpload,
      processPhotoFiles,
      remainingScans: checkLimit('aiFoodPhotoPerDay') ? (PREMIUM_GATES.aiFoodPhotoPerDay[paywall.plan as 'free'] || 3) - (currentUser?.usage?.aiFoodPhotoCount || 0) : 0,
      searchQuery,
      setSearchQuery,
      showSearchResults,
      setShowSearchResults,
      searchResults,
      addFoodToDiary,
      foodDiary,
      selectedFoodIds,
      toggleFoodSelected,
      bulkUpdateMealType,
      bulkRemoveSelectedFoods,
      deleteFoodEntry,
      deleteFoodPhoto,
      openInsight: (item: any) => setInsightModal({ id: item.id, photo: (item.photoThumb || item.photo) as string, name: item.name, insight: item.insight! }),
      openEditFood,
      formatTime,
      mealTypeLabel,
      MacroBarComponent: MacroBar,
      FoodDiaryGroupedComponent: FoodDiaryGrouped,
    },
    family: {
      cloudFamilyMembers,
      cloudFamilyLoading,
      cloudFamilyError,
      setCloudFamilyError,
      familyInviteCode,
      familyJoinCode,
      familyNameDraft,
      setFamilyJoinCode,
      setFamilyNameDraft,
      loadCloudFamily,
      createFamilyCloud,
      joinFamilyCloud,
      makeInviteCode,
      generateFamilyMenuNow,
      updateMyFamilyGoal,
    },
    council: {
      councilInput,
      setCouncilInput,
      councilLoading,
      councilStage,
      councilMessages,
      expandedCouncilThoughtIds,
      setExpandedCouncilThoughtIds,
      councilScrollRef,
      handleCouncilSubmit,
      clearCouncilHistory,
    },
    content: {
      courseLibrary,
      lessons,
      setCurrentLesson,
      setIsLessonViewOpen,
      settings,
      setSettings,
      favoriteRecipes,
      addFavoriteRecipe,
      removeFavoriteRecipe,
      clearFavoriteRecipes,
      closeLessonView,
      handleMarkLessonRead,
      handleStartLessonQuiz,
    },
  };

  if (authState === 'loading') return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>;

  if (authState === 'auth_choice') return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-200"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>}>
      <AuthChoiceScreen
        inviteCode={inviteCode}
        setInviteCode={setInviteCode}
        inviteError={inviteError}
        setInviteError={setInviteError}
        requireInvite={requireInvite}
        inviteChecking={inviteChecking}
        bootstrapAuth={bootstrapAuth}
        GoogleSignInButton={GoogleSignInButton}
      />
    </React.Suspense>
  );

  if (authState === 'register') return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-200"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>}>
      <RegistrationScreen
        regData={regData}
        setRegData={setRegData}
        onboardingStep={onboardingStep}
        setOnboardingStep={setOnboardingStep}
        isActivatingPlan={isActivatingPlan}
        activationStep={activationStep}
        activationSteps={ACTIVATION_STEPS}
        activationTotalMs={ACTIVATION_TOTAL_MS}
        handleActivateWithTransition={handleActivateWithTransition}
      />
    </React.Suspense>
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
        <React.Suspense fallback={<div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60"><div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/95 px-5 py-4 text-sm font-semibold text-slate-200"><Loader2 className="h-4 w-4 animate-spin text-indigo-400" />Загрузка тарифа...</div></div>}>
            <PlansScreen
            currentPlan={paywall.plan}
            userId={currentUser?.id}
            isAdmin={isAdmin}
            onSelect={async (p) => {
              if (!currentUser) return;
              if (isAdmin && !isTestModeEnabled()) {
                const r = await fetch('/api/admin/subscription', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: currentUser.id, plan: p }),
                });
                const j = await r.json().catch(() => null);
                if (!r.ok) {
                  alert(j?.error ? `Не удалось поменять тариф: ${j.error}` : 'Не удалось поменять тариф.');
                  return;
                }
              }
              persistUser({
                ...currentUser,
                plan: p,
                planTier: p === 'free' ? 'free' : 'pro',
                proUnlockedAt: p === 'free' ? undefined : new Date().toISOString(),
              });
              if (isTestModeEnabled()) {
                setDevPlanOverride(p, currentUser.id);
              }
            }}
            onCheckoutPlan={async (plan) => {
              const r = await fetch('/api/billing/checkout', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan }),
              });
              const j = await r.json().catch(() => null);
              if (!r.ok) {
                alert(j?.error ? `Не удалось открыть оплату: ${j.error}` : 'Не удалось открыть оплату.');
                return null;
              }
              return typeof j?.url === 'string' ? j.url : null;
            }}
            onClose={paywall.closePaywall}
          />
        </React.Suspense>
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
            <React.Suspense fallback={<div className="rounded-[2rem] bg-slate-900 border border-slate-800 p-6 text-center text-slate-500 font-medium">Загрузка разбора...</div>}>
              <FoodInsightCard photo={insightModal.photo} name={insightModal.name} insight={insightModal.insight} isPro={paywall.canUsePro} onUpdateInsight={(next) => { if (!currentUser) return; const newDiary = foodDiary.map(it => it.id === insightModal.id ? { ...it, insight: next } : it); setFoodDiary(newDiary); safeSetItem(`fitfocus_data_${currentUser.id}_diary`, JSON.stringify(newDiary)); setInsightModal({ ...insightModal, insight: next }); }} onSaveRecipe={addFavoriteRecipe} onClose={() => setInsightModal(null)} />
            </React.Suspense>
          </div>
        </div>
      )}

      <SidebarNavigation
        activeTab={activeTab}
        isAdmin={isAdmin}
        lastAiAction={lastAiAction}
        logout={logout}
        mobileMoreOpen={mobileMoreOpen}
        modeBadge={modeBadge}
        onAiRetry={handleAiRetry}
        onMobileMoreOpenChange={setMobileMoreOpen}
        onActiveTabChange={setActiveTab}
        onSyncNow={syncAllLocalDataNow}
        aiBadge={aiBadge}
        retryMeta={retryMeta}
        syncBadge={syncBadge}
      />

      <AppWorkspace
        workspaceProps={workspaceProps}
      />
      {/* Family menu pre-questions */}
      {familyMenuPrefsOpen && currentUser && paywall.plan === 'family' && (
        <React.Suspense fallback={null}>
          <FamilyMenuPrefsModal
            allUsers={allUsers}
            familyMenuPrefs={familyMenuPrefs}
            setFamilyMenuPrefs={setFamilyMenuPrefs}
            onClose={() => setFamilyMenuPrefsOpen(false)}
            onGenerate={() => handleGenerateFamilyWeeklyMenu()}
          />
        </React.Suspense>
      )}

      <React.Suspense fallback={null}>
        <PlanIntroModal
          currentUser={currentUser}
          planError={planError}
          open={planIntroOpen}
          onClose={() => setPlanIntroOpen(false)}
          onOpenPlan={() => setActiveTab('plan')}
          onOpenNutrition={() => setActiveTab('nutrition')}
        />
      </React.Suspense>
      <React.Suspense fallback={null}>
        {isLessonViewOpen && currentLesson && (
          <LessonViewModal
            currentLesson={currentLesson}
            isQuizActive={isQuizActive}
            selectedQuizOption={selectedQuizOption}
            onClose={closeLessonView}
            setSelectedQuizOption={setSelectedQuizOption}
            handleMarkLessonRead={handleMarkLessonRead}
            handleStartLessonQuiz={handleStartLessonQuiz}
            handleQuizSubmit={handleQuizSubmit}
          />
        )}
      </React.Suspense>
    </div>
  );
};

export default App;
