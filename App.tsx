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
  History,
  Apple,
} from 'lucide-react';
// FIX: Added getWeeklyIntelligenceInterpretation to the import list from geminiService
import { analyzeFoodPhoto, getCoachAdvice, generatePersonalPlan, generatePlateauExplanation, readAiStatus, AiLastStatus, allowAiRetryNow, getLastAiAction, setLastAiAction, getWeeklyIntelligenceInterpretation, callAiCouncil, generateWeeklyMenu, generateFamilyWeeklyMenu, setAiStorageScope } from './geminiService';
import { analyzeImageQuality } from './services/imageQuality';
import { compressFoodPhoto } from './services/foodPhoto';
import { MAX_DIARY_ITEMS, MAX_HISTORY_ITEMS, sanitizeFoodEntryForStorage, type FastLogItem } from './storage/foodDiary';
import { computeConfidence, confidenceLabel, shouldShowImprove, shouldSuggestPortionAdjust } from './services/aiConfidence';
import { classifyWisShareFailure, isSoftWeeklyAiError } from './services/frontendErrors';
import { analyzeFoodPhotoEnhanced } from './geminiService';
import { Gender, Goal, UserProfile, FoodItem, FoodEntry, MealType, ActivityLevel, CoachTask, UserHabit, CourseLesson, UsageStats, LessonQuizOption, FoodInsight, AppSettings, FavoriteRecipe, TariffPlan, AIPlan, AppTheme, FamilyWeeklyMenu } from './types';
import { formatTime, getDayKey, getWeekKey, last7DayKeys, toLocalDayKey as localDayKey } from './dateUtils';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS } from './constants';
import { calculateDailyTargets } from './profileMath';
import { toggleHabit, calculateStreak, getTodayKey } from './habits';
import { addWeight, weightDelta } from './weight';
import { detectPlateau } from './plateau';
import { generateWeeklyIntelligence } from './weeklyIntelligence';
import { ensureWeeklyReportWithAI, loadWeeklyReports, WeeklyStoredReport } from './weeklyAutoEngine';
import { trackWisShareEvent } from './analytics/wisShare';
import { calculateFoodStreak } from './analytics/foodStreak';
import { useAchievements } from './useAchievements';
import type { AchievementEvaluationContext } from './achievements/engine';
import { usePaywall } from './usePaywall';
import { isTestModeEnabled, planLabel, setDevPlanOverride } from './money';
import { buildFallbackAiPlan } from './aiPlanFallback';
import { buildCorrectedFoodPatch, buildFoodCorrectionDraft, type FoodCorrectionDraft } from './foodCorrection';
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
  clearOAuthContinuationState,
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
import ShareWisCard from './components/ShareWisCard';
import MacroBar from './components/MacroBar';
import FoodDiaryGrouped, { formatLocalDayLabel } from './FoodDiaryGrouped';
import FoodEditModal from './FoodEditModal';
import PaywallDialog from './PaywallDialog';
import { formatGramsPretty, MealParts } from './mealPresentation';
import VersionInfoModal from './VersionInfoModal';
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

function getInitialTabFromHash(): AppTabId | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#\/?/, '').split(/[?&]/)[0];
  if (!hash || hash === 'admin') return null;
  return sidebarTabs.some((tab) => tab.id === hash) ? hash as AppTabId : null;
}
const DashboardScreen = React.lazy(() => import('./DashboardScreen'));
const PlanScreen = React.lazy(() => import('./PlanScreen'));
const CouncilScreen = React.lazy(() => import('./CouncilScreen'));
const ProScreen = React.lazy(() => import('./ProScreen'));
const CourseScreen = React.lazy(() => import('./CourseScreen'));
const PlanIntroModal = React.lazy(() => import('./PlanIntroModal'));
const LessonViewModal = React.lazy(() => import('./LessonViewModal'));
const FamilyMenuPrefsModal = React.lazy(() => import('./FamilyMenuPrefsModal'));

const AUTH_PENDING_STORAGE_KEY = 'fitfocus.auth.pending-oauth.v1';

type GoogleIdentityGlobal = {
  accounts?: {
    id?: unknown;
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityGlobal;
  }
}

type ViteEnvLike = Record<string, string | boolean | undefined>;
type UnknownRecord = Record<string, unknown>;
type AutoTableDocState = { lastAutoTable?: { finalY?: unknown } };
type FontReadyDocument = Document & { fonts?: { ready?: Promise<unknown> } };

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPresent = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

const getAutoTableFinalY = (doc: unknown, fallback: number): number => {
  const finalY = (doc as AutoTableDocState).lastAutoTable?.finalY;
  return typeof finalY === 'number' && Number.isFinite(finalY) ? finalY : fallback;
};

const waitForDocumentFonts = async () => {
  const ready = (document as FontReadyDocument).fonts?.ready;
  if (ready) await ready;
};

const getGoogleClientId = () => {
  const envAny = import.meta.env as ViteEnvLike;
  const local = String(envAny.VITE_GOOGLE_CLIENT_ID_LOCAL || __VITE_GOOGLE_CLIENT_ID_LOCAL__ || '');
  const prod = String(envAny.VITE_GOOGLE_CLIENT_ID_PROD || __VITE_GOOGLE_CLIENT_ID_PROD__ || '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const isLocal =
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://0.0.0.0');
  const picked = (isLocal ? local : prod).trim();
  return !picked || picked.includes('CHANGE_ME') ? '' : picked;
};

function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    if (window.google?.accounts?.id) return resolve();

    const existing = document.querySelector('script[data-gis="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GIS load error')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.gis = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GIS load error'));
    document.head.appendChild(script);
  });
}

// Compile-time fallbacks injected by Vite (see vite.config.ts)
declare const __VITE_GOOGLE_CLIENT_ID_LOCAL__: string | undefined;
declare const __VITE_GOOGLE_CLIENT_ID_PROD__: string | undefined;






// NOTE: PDF генерация вынесена в ./pdf (см. pdf/font.ts). Это решает "кракозябры" (кириллица) и упрощает поддержку.



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







const App: React.FC = () => {

  const weekStartISO = useCallback((d = new Date()) => {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1 - day); // Monday start
    date.setDate(date.getDate() + diff);
    return localDayKey(date);
  }, []);

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
  const selectedDiaryDayStorageKey = useMemo(
    () => `fitfocus.nutrition.selected-day.v1:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id],
  );
  const selectedDiaryDaySkipSaveRef = useRef(false);
  const [selectedDiaryDayKey, setSelectedDiaryDayKey] = useState<string>('');
  useEffect(() => {
    try {
      const todayKey = localDayKey(new Date()) || '';
      const savedKey = localStorage.getItem(selectedDiaryDayStorageKey) || '';
      selectedDiaryDaySkipSaveRef.current = true;
      setSelectedDiaryDayKey(savedKey === todayKey ? savedKey : '');
    } catch {
      selectedDiaryDaySkipSaveRef.current = true;
      setSelectedDiaryDayKey('');
    }
  }, [selectedDiaryDayStorageKey]);
  useEffect(() => {
    if (selectedDiaryDaySkipSaveRef.current) {
      selectedDiaryDaySkipSaveRef.current = false;
      return;
    }
    try {
      if (selectedDiaryDayKey) {
        localStorage.setItem(selectedDiaryDayStorageKey, selectedDiaryDayKey);
      } else {
        localStorage.removeItem(selectedDiaryDayStorageKey);
      }
    } catch {
      // ignore storage issues
    }
  }, [selectedDiaryDayKey, selectedDiaryDayStorageKey]);
  const diaryDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of foodDiary) {
      const key = localDayKey(item.timestamp);
      if (key) keys.add(key);
    }
    return Array.from(keys).sort((a, b) => (a < b ? 1 : -1));
  }, [foodDiary]);
  const resolvedDiaryDayKey = useMemo(() => {
    const todayKey = localDayKey(new Date()) || '';
    if (selectedDiaryDayKey && diaryDayKeys.includes(selectedDiaryDayKey)) return selectedDiaryDayKey;
    if (diaryDayKeys.includes(todayKey)) return todayKey;
    return diaryDayKeys[0] || todayKey;
  }, [diaryDayKeys, selectedDiaryDayKey]);
  const selectedDiaryStats = useMemo(() => {
    if (!resolvedDiaryDayKey) {
      return { calories: 0, protein: 0, fat: 0, carbs: 0 };
    }
    const dayEntries = foodDiary.filter((item) => localDayKey(item.timestamp) === resolvedDiaryDayKey);
    return dayEntries.reduce((acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein: acc.protein + (item.protein || 0),
      fat: acc.fat + (item.fat || 0),
      carbs: acc.carbs + (item.carbs || 0),
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }, [foodDiary, resolvedDiaryDayKey]);
  const [insightModal, setInsightModal] = useState<null | { id: string; photo: string; name: string; insight: FoodInsight; nonFood?: boolean }>(null);
  const [editFoodModal, setEditFoodModal] = useState<null | FoodCorrectionDraft>(null);
  const insightEntry = useMemo(() => (insightModal ? foodDiary.find(it => it.id === insightModal.id) ?? null : null), [insightModal, foodDiary]);
  const [activeTab, setActiveTab] = useState<AppTabId>(() => getInitialTabFromHash() || 'dashboard');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  useEffect(() => {
    const applyHashTab = () => {
      const tab = getInitialTabFromHash();
      if (tab) setActiveTab(tab);
    };
    applyHashTab();
    window.addEventListener('hashchange', applyHashTab);
    return () => window.removeEventListener('hashchange', applyHashTab);
  }, []);
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
    const normalizeFavoriteRecipe = (item: unknown): FavoriteRecipe | null => {
      if (!isRecord(item)) return null;
      const rawRecipe = isRecord(item.recipe) ? item.recipe : null;
      const toIngredient = (value: unknown): { name: string; amount?: string } | null => {
        if (typeof value === 'string') {
          const text = value.trim();
          if (!text) return null;
          const separators = ['—', '–', '-', ':'];
          for (const separator of separators) {
            const idx = text.indexOf(separator);
            if (idx > 0) {
              const name = text.slice(0, idx).trim();
              const amount = text.slice(idx + separator.length).trim();
              if (name && amount) return { name, amount };
            }
          }
          return { name: text };
        }
        if (!value || typeof value !== 'object') return null;
        const ing = value as { name?: unknown; title?: unknown; amount?: unknown; grams?: unknown; value?: unknown };
        const name = String(ing.name || ing.title || '').trim();
        if (!name) return null;
        const amount = ing.amount ?? ing.grams ?? ing.value;
        return {
          name,
          amount: amount === undefined || amount === null || amount === '' ? undefined : String(amount),
        };
      };

      const ingredientHasAmount = (value: unknown) => !!toIngredient(value)?.amount;
      const pickIngredientSource = (primary: unknown, fallback: unknown) => {
        const primaryArr = Array.isArray(primary) ? primary : [];
        const fallbackArr = Array.isArray(fallback) ? fallback : [];
        if (primaryArr.some(ingredientHasAmount)) return primaryArr;
        if (fallbackArr.some(ingredientHasAmount)) return fallbackArr;
        return primaryArr.length ? primaryArr : fallbackArr;
      };
      const toIsoDate = (value: unknown) => {
        if (typeof value === 'string' || typeof value === 'number') {
          const date = new Date(value);
          if (Number.isFinite(date.getTime())) return date.toISOString();
        }
        return new Date().toISOString();
      };

      const ingredientsSource = pickIngredientSource(item.ingredients, rawRecipe?.ingredients);
      const stepsSource = Array.isArray(rawRecipe?.steps)
        ? rawRecipe.steps
        : Array.isArray(item.steps)
          ? item.steps
          : [];
      const ingredients = ingredientsSource
        .map(toIngredient)
        .filter(isPresent);
      const steps = stepsSource
        .map((step: unknown, idx: number) => {
          if (typeof step === 'string') {
            const text = step.trim();
            return text ? { n: idx + 1, text } : null;
          }
          if (!isRecord(step)) return null;
          const text = String(step.text || step.step || '').trim();
          if (!text) return null;
          const n = Number(step.n || idx + 1);
          const timeMin = step.timeMin ?? step.time_minutes;
          return {
            n: Number.isFinite(n) && n > 0 ? n : idx + 1,
            text,
            ...(timeMin === undefined || timeMin === null || timeMin === ''
              ? {}
              : { timeMin: Number(timeMin) || undefined }),
          };
        })
        .filter(isPresent);
      const recipe = {
        title: String(rawRecipe?.title || item.title || 'Рецепт'),
        servings: Number(rawRecipe?.servings ?? item.servings ?? 0) || undefined,
        timeMinutes: Number(rawRecipe?.timeMinutes ?? item.timeMinutes ?? 0) || undefined,
        ingredients,
        steps,
        tips: Array.isArray(rawRecipe?.tips) ? rawRecipe.tips.map(String).filter(Boolean) : [],
      };
      return {
        id: String(item.id || globalThis.crypto?.randomUUID?.() || Date.now().toString()),
        title: String(item.title || recipe.title),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : toIsoDate(item.createdAt),
        photo: typeof item.photo === 'string' ? item.photo : undefined,
        allergens: Array.isArray(item.allergens) ? item.allergens.map(String).filter(Boolean) : undefined,
        intolerances: Array.isArray(item.intolerances) ? item.intolerances.map(String).filter(Boolean) : undefined,
        sourceFoodName: typeof item.sourceFoodName === 'string' ? item.sourceFoodName : undefined,
        recipe,
      };
    };
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setFavoriteRecipes([]);
        return;
      }
      const parsed = JSON.parse(raw);
      const normalized = Array.isArray(parsed) ? parsed.map(normalizeFavoriteRecipe).filter(isPresent) : [];
      setFavoriteRecipes(normalized);
      safeSetItem(key, JSON.stringify(normalized));
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
    setEditFoodModal(buildFoodCorrectionDraft(item, inferMealType(item.timestamp || new Date().toISOString())));
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
    bloodGlucoseMmolL: 0,
    waistCm: 0,
    chestCm: 0,
    hipsCm: 0,
    plan: 'free' as TariffPlan,
    lossDeficit: DEFAULT_DEFICIT,
    gainSurplus: DEFAULT_SURPLUS,
    riskAckLoss: false,
    riskAckGain: false
  });

  useEffect(() => {
    if (authState !== 'register') return;
    if (regData.name.trim()) return;
    const fallbackName = googleMe?.name?.trim() || googleMe?.email?.split('@')[0]?.trim() || 'Пользователь';
    if (!fallbackName) return;
    setRegData((prev) => (prev.name.trim() ? prev : { ...prev, name: fallbackName }));
  }, [authState, googleMe?.email, googleMe?.name, regData.name]);

  const [onboardingMode, setOnboardingMode] = useState<'mvp' | 'investor'>('mvp');
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
  const [versionInfoOpen, setVersionInfoOpen] = useState(false);

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

  const buildAchievementContext = useCallback((): AchievementEvaluationContext => {
    const weightHistory = currentUser?.weightHistory || [];
    const firstWeight = typeof weightHistory[0]?.weight === 'number' ? weightHistory[0].weight : null;
    const latestWeight =
      typeof weightHistory[weightHistory.length - 1]?.weight === 'number'
        ? weightHistory[weightHistory.length - 1].weight
        : typeof currentUser?.weight === 'number'
          ? currentUser.weight
          : null;
    const todayHabits = currentUser?.dailyHabits?.[getTodayKey()] || {};
    return {
      profileExists: !!currentUser,
      profileDetailsCompleted: !!currentUser?.profileDetailsCompleted,
      hasAiPlan: !!currentUser?.aiPlan,
      hasWeeklyMenu: !!currentUser?.aiPlan?.weeklyMenu || !!currentUser?.aiPlan?.familyWeeklyMenu,
      foodDiaryCount: foodDiary.length,
      foodStreak: calculateFoodStreak(foodDiary).streak,
      weightHistoryCount: weightHistory.length,
      initialWeight: firstWeight,
      latestWeight,
      measurementsCount: currentUser?.measurementsHistory?.length || 0,
      wisCount: weeklyReports.length,
      shoppingCheckedCount: familyShopping?.items?.filter((item) => item.checked).length || 0,
      familyActive: !!cloudFamily,
      waterToday: !!todayHabits.water,
      sleepHours: typeof currentUser?.wearableSleepHoursLastNight === 'number' ? currentUser.wearableSleepHoursLastNight : null,
    };
  }, [cloudFamily, currentUser, familyShopping?.items, foodDiary, weeklyReports.length]);

  const achievements = useAchievements({ userId: currentUser?.id, getContext: buildAchievementContext });
  const checkAchievements = achievements.checkAchievements;
  const achievementBootstrapUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (!achievements.enabled) return;
    if (achievementBootstrapUserRef.current === currentUser.id) return;
    achievementBootstrapUserRef.current = currentUser.id;
    void checkAchievements('app_open');
  }, [achievements.enabled, checkAchievements, currentUser?.id]);

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
      void checkAchievements('weekly_menu_generated', { hasWeeklyMenu: true });
    } catch {
      setWeeklyMenuError('Не удалось сгенерировать меню на неделю.');
    } finally {
      setWeeklyMenuLoading(false);
    }
  }, [checkAchievements, currentUser, persistUser]);

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

  const exportWeeklyPDF = async (report: WeeklyStoredReport) => {
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
      const finalY = getAutoTableFinalY(doc, 90);
      doc.text("AI Интерпретация:", 14, finalY + 10);
      doc.setFontSize(10);
      doc.text(doc.splitTextToSize(report.aiText, 180), 14, finalY + 18);
    }
    doc.save(`FitFocus_Weekly_Report_${report.weekKey}.pdf`);
  };

  type WisShareState = 'idle' | 'busy' | 'success' | 'error';
  const wisShareCardRef = useRef<HTMLDivElement | null>(null);
  const wisShareResetTimerRef = useRef<number | null>(null);
  const [wisShareState, setWisShareState] = useState<WisShareState>('idle');
  const [wisShareMessage, setWisShareMessage] = useState<string | null>(null);

  const setWisShareNotice = useCallback((state: WisShareState, message: string | null) => {
    setWisShareState(state);
    setWisShareMessage(message);
    if (wisShareResetTimerRef.current) {
      window.clearTimeout(wisShareResetTimerRef.current);
      wisShareResetTimerRef.current = null;
    }
    if (state !== 'busy' && message) {
      wisShareResetTimerRef.current = window.setTimeout(() => {
        setWisShareState('idle');
        setWisShareMessage(null);
      }, 3500);
    }
  }, []);

  useEffect(() => () => {
    if (wisShareResetTimerRef.current) {
      window.clearTimeout(wisShareResetTimerRef.current);
    }
  }, []);

  const handleShareWisCard = useCallback(async () => {
    if (!currentUser || !weekly) return;
    const card = wisShareCardRef.current;
    if (!card) {
      setWisShareNotice('error', 'Не удалось подготовить карточку WIS. Попробуйте ещё раз.');
      trackWisShareEvent('wis_share_failed', { reason: 'share_card_missing', wis: weekly.wis });
      return;
    }

    setWisShareNotice('busy', 'Готовим PNG-карточку WIS...');
    trackWisShareEvent('wis_share_clicked', { wis: weekly.wis, status: weekly.status });

    try {
      const html2canvasModule = await import('html2canvas');
      const html2canvas = html2canvasModule.default;
      await waitForDocumentFonts();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const canvas = await html2canvas(card, {
        useCORS: true,
        scale: 1,
        backgroundColor: null,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        throw new Error('canvas_to_blob_failed');
      }

      const file = new File([blob], `FitFocus_WIS_${weekly.wis}.png`, { type: 'image/png' });
      const canShareFiles =
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: 'FitFocus WIS',
          text: 'Моя недельная WIS-карточка FitFocus',
        });
        setWisShareNotice('success', 'Карточка готова и передана в системное меню отправки.');
        trackWisShareEvent('wis_share_success', { method: 'share_sheet', wis: weekly.wis });
        void checkAchievements('wis_share_success', { wisCount: Math.max(weeklyReports.length, 1) });
        return;
      }

      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `FitFocus_WIS_${weekly.wis}.png`;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      setWisShareNotice('success', 'Системная отправка недоступна — PNG скачан на устройство.');
      trackWisShareEvent('wis_share_success', { method: 'download', wis: weekly.wis });
      void checkAchievements('wis_share_success', { wisCount: Math.max(weeklyReports.length, 1) });
    } catch (error: unknown) {
      const reason = classifyWisShareFailure(error);
      setWisShareNotice('error', 'Не удалось создать картинку. Попробуйте скачать PDF или повторите позже.');
      trackWisShareEvent('wis_share_failed', { reason, wis: weekly.wis });
    }
  }, [checkAchievements, currentUser, weekly, weeklyReports.length, setWisShareNotice]);

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
    }).catch((err: unknown) => {
      // В dev StrictMode/перезапусках это нормальные "мягкие" ситуации — не засоряем консоль
      if (!isSoftWeeklyAiError(err)) console.error("Weekly AI reporting failed", { code: "WEEKLY_AI_REPORT_FAILED" });
      aiReportGenerationRef.current = null; // Позволяем переповтор при следующем изменении
    });
  }, [currentUser?.id, weekly?.wis]); // Срабатывает только при смене юзера или изменении итогового балла

  const dailyStats = useMemo(() => {
    const todayKey = localDayKey(new Date());
    const todayDiary = foodDiary.filter((item) => localDayKey(item.timestamp) === todayKey);
    return todayDiary.reduce((acc, item) => ({
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
    clearOAuthContinuationState();
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

  const patchProfileInCloudWithAchievements = useCallback(async (patch: Partial<UserProfile>) => {
    await patchProfileInCloud(patch);
    if (patch.profileDetailsCompleted) {
      void checkAchievements('profile_details_completed', { profileDetailsCompleted: true });
    }
    if (Array.isArray(patch.measurementsHistory) && patch.measurementsHistory.length > 0) {
      void checkAchievements('measurement_saved', { measurementsCount: patch.measurementsHistory.length });
    }
    if (typeof patch.wearableSleepHoursLastNight === 'number' && patch.wearableSleepHoursLastNight >= 8) {
      void checkAchievements('sleep_8h_recorded', { sleepHours: patch.wearableSleepHoursLastNight });
    }
  }, [checkAchievements, patchProfileInCloud]);

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
    const sums: Record<string, number> = {};
    for (const f of last7) {
      const key = localDayKey(f.timestamp);
      if (!key) continue;
      sums[key] = (sums[key] ?? 0) + (f.calories ?? 0);
    }
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
    const value = localDayKey(d);
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
    if (type === 'aiFoodPhotoPerDay') return (usage.aiFoodPhotoCount || 0) < (PREMIUM_GATES.aiFoodPhotoPerDay[paywall.plan] || 3);
    if (type === 'aiCoachAdvicePerDay') return (usage.aiCoachCount || 0) < (PREMIUM_GATES.aiCoachAdvicePerDay[paywall.plan] || 1);
    return Boolean(PREMIUM_GATES[type][paywall.plan]);
  }, [currentUser, paywall.plan]);

  const incrementUsage = useCallback((key: keyof UsageStats) => {
    if (!currentUser) return;
    const nextUsage = { ...currentUser.usage, [key]: (Number(currentUser.usage?.[key as keyof UsageStats]) || 0) + 1 };
    persistUser({ ...currentUser, usage: nextUsage });
  }, [currentUser, persistUser]);

  const persistFoodDiary = useCallback((nextDiary: FoodItem[]) => {
    if (!currentUser) return;
    const nextStorage = (nextDiary || []).map(sanitizeFoodEntryForStorage).slice(0, MAX_DIARY_ITEMS);
    safeSetItem(`fitfocus_data_${currentUser.id}_diary`, JSON.stringify(nextStorage));
  }, [currentUser?.id]);

  const addFoodToDiary = useCallback((item: FastLogItem) => {
    if (!currentUser) return;
    const ts = item.timestamp ?? new Date().toISOString();
    // Keep photo in UI state (so user sees it immediately), but strip it from persisted localStorage payload to avoid quota issues.
    const entryForState: FoodItem = { ...item, id: Date.now().toString(), timestamp: ts, mealType: item.mealType ?? inferMealType(ts) };
    const entryForStorage = sanitizeFoodEntryForStorage(entryForState);

    // Use functional update so rapid consecutive adds (e.g. multiple scans)
    // don't overwrite previous entries because of stale closures.
    setFoodDiary((prev) => {
      const prevArr = prev || [];
      const nextState = [entryForState, ...prevArr].slice(0, MAX_DIARY_ITEMS);
      const nextStorage = [entryForStorage, ...prevArr.map(sanitizeFoodEntryForStorage)].slice(0, MAX_DIARY_ITEMS);
      safeSetItem(`fitfocus_data_${currentUser.id}_diary`, JSON.stringify(nextStorage));
      const nextDayKey = localDayKey(ts);
      if (nextDayKey) setSelectedDiaryDayKey(nextDayKey);
      return nextState;
    });
    const historyItem = { ...item };
    delete historyItem.photo;
    if (historyItem.insight) delete historyItem.insight.recipe;
    setFoodHistory((previousHistory) => {
      const nextHistory = [historyItem, ...previousHistory.filter((history) => history.name !== item.name)]
        .slice(0, MAX_HISTORY_ITEMS);
      safeSetItem(`fitfocus_data_${currentUser.id}_history`, JSON.stringify(nextHistory));
      return nextHistory;
    });
    const hasAiPhoto = Boolean(item.photo || item.photoThumb);
    void checkAchievements(hasAiPhoto ? 'ai_photo_success' : 'food_manual_added', {
      foodDiaryCount: foodDiary.length + 1,
      hasAiPhoto,
    });
    return entryForState;
  }, [checkAchievements, foodDiary.length, currentUser]);
  const updateFoodEntry = useCallback((id: string, patch: Partial<FoodItem>) => {
    if (!currentUser) return;
    setFoodDiary((prev) => {
      const next = (prev || []).map(it => (it.id === id ? { ...it, ...patch } : it));
      persistFoodDiary(next);
      const updated = next.find((it) => it.id === id);
      if (updated?.timestamp) setSelectedDiaryDayKey(localDayKey(updated.timestamp));
      return next;
    });
  }, [currentUser, persistFoodDiary]);

  const deleteFoodPhoto = useCallback((id: string) => {
    updateFoodEntry(id, { photo: undefined, photoThumb: undefined });
  }, [updateFoodEntry]);

  const deleteFoodEntry = useCallback((id: string) => {
    if (!currentUser) return;
    setFoodDiary((prev) => {
      const next = (prev || []).filter(it => it.id !== id);
      persistFoodDiary(next);
      return next;
    });
  }, [currentUser, persistFoodDiary]);

  const {
    selectedFoodIds,
    toggleFoodSelected,
    clearFoodSelection,
    bulkUpdateMealType,
    bulkRemoveSelectedFoods,
  } = useFoodSelection(setFoodDiary, deleteFoodEntry, persistFoodDiary);

  const handleDiaryDayChange = useCallback((dayKey: string) => {
    clearFoodSelection();
    setSelectedDiaryDayKey(dayKey);
  }, [clearFoodSelection]);

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
      if (habitKey === 'water' && isDone) {
        void checkAchievements('habit_water_done', { waterToday: true });
      }
    }
  }, [checkAchievements, currentUser, habits, persistUser]);

  const handleToggleTask = useCallback((taskDate: string) => {
    if (!currentUser || !currentUser.tasks) return;
    const nextTasks = currentUser.tasks.map(t => t.date === taskDate ? { ...t, completed: !t.completed } : t);
    persistUser({ ...currentUser, tasks: nextTasks });
  }, [currentUser, persistUser]);

  const exportShortPdf = useCallback(async () => {
    if (!currentUser) return;
    const { downloadShortHealthReportPdf } = await import('./pdf');
    await downloadShortHealthReportPdf({ user: currentUser, targets, foodDiary, habits });
    void checkAchievements('pdf_report_generated');
  }, [checkAchievements, currentUser, targets, foodDiary, habits]);

  const exportDetailedPdf = useCallback(async () => {
    if (!currentUser) return;
    const { downloadDetailedHealthReportPdf } = await import('./pdf');
    await downloadDetailedHealthReportPdf({ user: currentUser, targets, foodDiary, habits, includeMealLog: pdfIncludeMealLog });
    void checkAchievements('pdf_report_generated');
  }, [checkAchievements, currentUser, targets, foodDiary, habits, pdfIncludeMealLog]);

  const bootstrapAuth = useCallback(async () => {
    let continueAfterOAuth = false;
    try {
      continueAfterOAuth = sessionStorage.getItem(AUTH_PENDING_STORAGE_KEY) === '1';
    } catch {}

    try {
      const authParam = new URLSearchParams(window.location.search).get('auth');
      if (authParam === 'google' || authParam === 'apple') {
        continueAfterOAuth = true;
        try {
          sessionStorage.setItem(AUTH_PENDING_STORAGE_KEY, '1');
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
      continueAfterOAuth,
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

        const nonFood = result.nonFood === true;
        const insight: FoodInsight = {
          calories: nonFood ? 0 : result.calories,
          macros: {
            protein: nonFood ? 0 : result.protein,
            fat: nonFood ? 0 : result.fat,
            carbs: nonFood ? 0 : result.carbs,
          },
          ingredients: nonFood || !Array.isArray(result.ingredients) ? [] : result.ingredients,
          notes: Array.isArray(result.notes) ? result.notes : []
        };

        const newEntry = addFoodToDiary({
          ...result,
          ...(nonFood ? { calories: 0, protein: 0, fat: 0, carbs: 0, ingredients: [], nonFood: true } : {}),
          photo,
          photoThumb,
          insight,
        });
        if (newEntry) setInsightModal({ id: newEntry.id, photo, name: result.name, insight, nonFood: newEntry.nonFood === true });
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
    void checkAchievements('log_weight', {
      weightHistoryCount: updatedUser.weightHistory?.length || 0,
      latestWeight: nextWeight,
    });
  }, [checkAchievements, currentUser, newWeight, persistUser]);

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
      void checkAchievements('ai_coach_success');
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
      persistUser,
      setAllUsers,
      setCurrentUser,
      setAuthState,
      setActiveTab,
      setPlanIntroOpen,
      fetchImpl: fetch,
    });
  }, [regData, loginAsUser, persistUser, regNameValid, normalizedAllUsers.length, requireInvite, inviteCode, googleMe, generatePersonalPlan, setLastAiAction]);

  const handleActivateWithTransition = useCallback(() => {
    if (isActivatingPlan) return;
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
  }, [handleRegister, isActivatingPlan, ACTIVATION_STEPS.length, ACTIVATION_STEP_MS, ACTIVATION_TOTAL_MS]);

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
    const today = localDayKey(new Date());
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

  const createFamilyCloudWithAchievements = useCallback(async () => {
    await createFamilyCloud();
    void checkAchievements('family_join_or_create', { familyActive: true });
  }, [checkAchievements, createFamilyCloud]);

  const joinFamilyCloudWithAchievements = useCallback(async () => {
    await joinFamilyCloud();
    void checkAchievements('family_join_or_create', { familyActive: true });
  }, [checkAchievements, joinFamilyCloud]);

  const generateFamilyMenuNowWithAchievements = useCallback(async () => {
    await generateFamilyMenuNow();
    void checkAchievements('weekly_menu_generated', { hasWeeklyMenu: true, familyActive: true });
  }, [checkAchievements, generateFamilyMenuNow]);

  const handleGenerateFamilyWeeklyMenuWithAchievements = useCallback(async () => {
    await handleGenerateFamilyWeeklyMenu();
    void checkAchievements('weekly_menu_generated', { hasWeeklyMenu: true, familyActive: true });
  }, [checkAchievements, handleGenerateFamilyWeeklyMenu]);

  const toggleFamilyShoppingItemWithAchievements = useCallback(async (name: string, checked: boolean) => {
    await toggleFamilyShoppingItem(name, checked);
    if (checked) {
      const checkedCount = (familyShopping?.items || []).filter((item) => item.checked).length + 1;
      void checkAchievements('shopping_item_checked', { shoppingCheckedCount: checkedCount, familyActive: true });
    }
  }, [checkAchievements, familyShopping?.items, toggleFamilyShoppingItem]);

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
      patchProfileInCloud: patchProfileInCloudWithAchievements,
      onExportBackup,
      onImportBackup,
      onConnectAutosave,
      autosaveEnabled,
      profileSyncState,
      profileSyncNote,
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
      foodDiary,
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
      onShareWisCard: handleShareWisCard,
      shareWisState: wisShareState,
      shareWisMessage: wisShareMessage,
      achievementsEnabled: achievements.enabled,
      achievementsCatalog: achievements.catalog,
      achievementsUnlocked: achievements.unlocked,
      achievementsNewlyUnlocked: achievements.newlyUnlocked,
      achievementsLoading: achievements.loading,
      dismissAchievementToast: achievements.dismissAchievementToast,
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
      wearableMetricsDayKey: currentUser?.wearableMetricsDayKey,
      wearableMetricsUpdatedAt: currentUser?.wearableMetricsUpdatedAt,
      onPatchUser: patchProfileInCloudWithAchievements,
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
      toggleFamilyShoppingItem: toggleFamilyShoppingItemWithAchievements,
      loadFamilyShopping,
      familyMenuError,
      familyMenu,
      familyMenuLoading,
      setFamilyMenuPrefsOpen,
      handleGenerateFamilyWeeklyMenu: handleGenerateFamilyWeeklyMenuWithAchievements,
      paywallPlan: paywall.plan,
      allUsers,
      currentUserGoal: currentUser?.goal || Goal.MAINTAIN,
      DEFAULT_DEFICIT,
      DEFAULT_SURPLUS,
      ShoppingListCardComponent: ShoppingListCard,
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
      openInsight: (item: FoodItem) => setInsightModal({ id: item.id, photo: (item.photoThumb || item.photo) as string, name: item.name, insight: item.insight!, nonFood: item.nonFood === true }),
      openEditFood,
      formatTime,
      mealTypeLabel,
      activeDiaryDayKey: resolvedDiaryDayKey,
      activeDiaryDayLabel: resolvedDiaryDayKey ? formatLocalDayLabel(resolvedDiaryDayKey) : 'Сегодня',
      selectedDiaryStats,
      onDiaryDayChange: handleDiaryDayChange,
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
      createFamilyCloud: createFamilyCloudWithAchievements,
      joinFamilyCloud: joinFamilyCloudWithAchievements,
      makeInviteCode,
      generateFamilyMenuNow: generateFamilyMenuNowWithAchievements,
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
      <VersionInfoModal open={versionInfoOpen} onClose={() => setVersionInfoOpen(false)} />
      <AuthChoiceScreen
        inviteCode={inviteCode}
        setInviteCode={setInviteCode}
        inviteError={inviteError}
        setInviteError={setInviteError}
        requireInvite={requireInvite}
        inviteChecking={inviteChecking}
        onOpenVersionInfo={() => setVersionInfoOpen(true)}
      />
    </React.Suspense>
  );

  if (authState === 'register') return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-200"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>}>
      <VersionInfoModal open={versionInfoOpen} onClose={() => setVersionInfoOpen(false)} />
      <RegistrationScreen
        regData={regData}
        setRegData={setRegData}
        planError={planError}
        isActivatingPlan={isActivatingPlan}
        activationStep={activationStep}
        activationSteps={ACTIVATION_STEPS}
        activationTotalMs={ACTIVATION_TOTAL_MS}
        handleActivateWithTransition={handleActivateWithTransition}
        onOpenVersionInfo={() => setVersionInfoOpen(true)}
      />
    </React.Suspense>
  );

  return (
    <div className="min-h-[100dvh] md:min-h-screen md:pl-64 bg-slate-950 text-slate-100 text-left">
      <VersionInfoModal open={versionInfoOpen} onClose={() => setVersionInfoOpen(false)} />
      {isScanning && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex flex-col items-center justify-center">
          <div className="w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6" />
          <p className="text-slate-100 font-black text-xl animate-pulse">Анализирую фото...</p>
        </div>
      )}
      {paywall.isPaywallOpen && (
        <PaywallDialog
          currentPlan={paywall.plan}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onPersistUser={persistUser}
          onClose={paywall.closePaywall}
        />
      )}
      
      {editFoodModal && (
        <FoodEditModal
          draft={editFoodModal}
          onChange={setEditFoodModal}
          onClose={() => setEditFoodModal(null)}
          onSave={() => {
            const currentEntry = foodDiary.find((item) => item.id === editFoodModal.id);
            const patch = buildCorrectedFoodPatch(editFoodModal, currentEntry?.insight);
            updateFoodEntry(editFoodModal.id, patch);
            if (insightModal?.id === editFoodModal.id && patch.insight) {
              setInsightModal({
                ...insightModal,
                name: String(patch.name || insightModal.name),
                insight: patch.insight,
                nonFood: patch.nonFood === true,
              });
            }
            setEditFoodModal(null);
          }}
        />
      )}

{insightModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xl z-[250] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl animate-in zoom-in duration-300">
            <React.Suspense fallback={<div className="rounded-[2rem] bg-slate-900 border border-slate-800 p-6 text-center text-slate-500 font-medium">Загрузка разбора...</div>}>
              <FoodInsightCard
                photo={insightModal.photo}
                name={insightModal.name}
                insight={insightModal.insight}
                nonFood={Boolean(insightEntry?.nonFood ?? insightModal.nonFood)}
                isPro={paywall.canUsePro}
                onEdit={insightEntry ? () => openEditFood(insightEntry) : undefined}
                onUpdateInsight={(next) => { if (!currentUser) return; const newDiary = foodDiary.map(it => it.id === insightModal.id ? { ...it, insight: next } : it); setFoodDiary(newDiary); persistFoodDiary(newDiary); setInsightModal({ ...insightModal, insight: next }); }}
                onSaveRecipe={addFavoriteRecipe}
                onClose={() => setInsightModal(null)}
              />
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
      {activeTab === 'dashboard' && currentUser && weekly && (
        <ShareWisCard
          ref={wisShareCardRef}
          weekly={weekly}
          goalLabel={
            currentUser.goal === Goal.LOSS
              ? 'Фокус: снижение веса'
              : currentUser.goal === Goal.GAIN
                ? 'Фокус: набор веса'
                : 'Фокус: поддержание формы'
          }
        />
      )}
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
