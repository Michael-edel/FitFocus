import React, { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
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
import { analyzeFoodPhoto, generatePersonalPlan, allowAiRetryNow, setLastAiAction, getWeeklyIntelligenceInterpretation, callAiCouncil, generateFamilyWeeklyMenu, setAiStorageScope } from './geminiService';
import { compressFoodPhoto } from './services/foodPhoto';
import { fetchWithResilience } from './services/httpClient';
import { listenForPageExit } from './storage/sessionTransport';
import { type FastLogItem } from './storage/foodDiary';
import { computeConfidence, confidenceLabel, shouldShowImprove, shouldSuggestPortionAdjust } from './services/aiConfidence';
import { classifyWisShareFailure } from './services/frontendErrors';
import { Gender, Goal, UserProfile, FoodItem, FoodEntry, MealType, ActivityLevel, CoachTask, UserHabit, CourseLesson, UsageStats, FoodInsight, AIPlan, FamilyWeeklyMenu } from './types';
import { formatTime, last7DayKeys, toLocalDayKey as localDayKey } from './dateUtils';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS } from './constants';
import { calculateDailyTargets } from './profileMath';
import { calculateStreak, getTodayKey } from './habits';
import { detectPlateau } from './plateau';
import { generateWeeklyIntelligence } from './weeklyIntelligence';
import { type WeeklyStoredReport } from './weeklyAutoEngine';
import { calculateFoodStreak } from './analytics/foodStreak';
import { useAchievements } from './useAchievements';
import { usePaywall } from './usePaywall';
import { isTestModeEnabled, planLabel, setDevPlanOverride } from './money';
import { buildFallbackAiPlan } from './aiPlanFallback';
import { buildCorrectedFoodPatch, buildFoodCorrectionDraft, type FoodCorrectionDraft } from './foodCorrection';
import {
  clearLocalUserData,
  normalizeUserProfiles,
  readStoredAllUsersSnapshotForUser,
} from './storage/hybrid';
import {
  bootstrapAuthSession,
  clearOAuthContinuationState,
  consumeOAuthContinuationState,
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
import { useProfilePersistence } from './features/profile/useProfilePersistence';
import { useProfileAutoSync } from './features/profile/useProfileAutoSync';
import { useCloudSyncRecovery } from './features/profile/useCloudSyncRecovery';
import { buildCloudSyncBadge } from './features/profile/cloudSyncBadge';
import { clearAppUiStorage } from './features/profile/clearUiState';
import { isRegistrationSessionReady, type RegistrationSessionState } from './features/auth/registrationSession';
import { useDiaryDaySelection } from './features/diary/useDiaryDaySelection';
import { useFoodDiary } from './features/diary/useFoodDiary';
import { useCoachAdvice } from './features/ai/useCoachAdvice';
import { usePlateauExplanation } from './features/ai/usePlateauExplanation';
import { AiActionScope } from './features/ai/actionScope';
import { getRemainingFoodPhotoScans, useFoodPhotoAnalysis } from './features/ai/useFoodPhotoAnalysis';
import { useWeeklyMenuGeneration } from './features/ai/useWeeklyMenuGeneration';
import { retryLastAiAction } from './features/ai/aiRetry';
import { useWeeklyAiReport } from './features/ai/useWeeklyAiReport';
import { useAiActivityStatus } from './features/ai/useAiActivityStatus';
import { buildAiActivityBadge } from './features/ai/aiActivityBadge';
import { buildAiRetryMeta } from './features/ai/aiRetryMeta';
import { resetUsageIfNewPeriod } from './features/usage/resetUsage';
import { PREMIUM_GATES, canUsePremiumGate, incrementUsageCounter, type UsageCounter } from './features/usage/premiumGates';
import { useFavoriteRecipes } from './features/recipes/useFavoriteRecipes';
import { useCourseUiState } from './features/course/useCourseUiState';
import { useCourseActions } from './features/course/useCourseActions';
import { useSettingsPersistence } from './features/settings/useSettingsPersistence';
import { useDocumentTheme } from './features/settings/useDocumentTheme';
import { useNutritionSearchState } from './features/nutrition/useNutritionSearchState';
import { useCameraFacingPreference } from './features/nutrition/useCameraFacingPreference';
import { useAdaptationUiState } from './features/adaptation/useAdaptationUiState';
import { useRefeedSchedule } from './features/adaptation/useRefeedSchedule';
import { calculateAdaptationCompliance, calculateAdaptationIndex, calculateAdaptationWeightProgress, calculateExpectedWeightDelta, getAdaptationStatus, getRefeedSuggestion } from './features/adaptation/adaptationMetrics';
import { usePlanTaskState } from './features/plan/usePlanTaskState';
import { togglePlanTask } from './features/plan/planTasks';
import { usePlanUiState } from './features/plan/usePlanUiState';
import { useDashboardPreferences } from './features/dashboard/useDashboardPreferences';
import { authenticatedAccountSessionScope, accountSessionRenderKey, getAccountScopedUiValue, useAccountScopedUiState } from './features/state/accountScopedUi';
import { recordDashboardWeight } from './features/dashboard/weightLogging';
import { shareWisCard } from './features/dashboard/shareWisCard';
import { calculateDailyNutrition, calculateDashboardWeightTrend } from './features/dashboard/dashboardMetrics';
import { calculateNextWeekWeightForecast, findFoodSearchResults } from './features/dashboard/dashboardViewModels';
import { exportWeeklyReportPdf } from './features/progress/exportWeeklyReportPdf';
import { useWisShareNotice } from './features/dashboard/useWisShareNotice';
import { useInviteCodeState } from './features/auth/useInviteCodeState';
import { usePlanActivation } from './features/auth/usePlanActivation';
import { useRegistrationDraft } from './features/auth/useRegistrationDraft';
import { buildAchievementContext } from './features/achievements/achievementContext';
import { prepareLoginSession } from './features/auth/loginSession';
import { startStateSyncLifecycle } from './features/auth/stateSyncLifecycle';
import { ACTIVE_SESSION_CHANNEL, DurableOutbox, type OutboxCommitGuard, type OutboxLocalCommitGuard, type OutboxReadGuard, type OutboxWriteGuard } from './storage/durableOutbox';
import { assertReadSession } from './storage/sessionRead';
import { applyHabitToggle } from './features/habits/legacyProgress';
import { useHashTabNavigation } from './features/navigation/useHashTabNavigation';
import { UserStateRepository } from './storage/userStateRepository';
import { stateSync } from './storage/stateSync';
import { StateStorageNotice } from './ui/StateStorageNotice';
import { getStateQueueSummaries, getStateSaveIssues, reportStateSaveIssue, subscribeStateSaveIssues } from './storage/stateSaveStatus';
import { parseJson } from './safeJson';
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
  mobilePrimaryTabIds,
  sidebarCoreTabIds,
  sidebarFeatureTabIds,
  sidebarTabs,
  sidebarUtilityTabIds,
} from './navigation';

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


type UnknownRecord = Record<string, unknown>;
type FontReadyDocument = Document & { fonts?: { ready?: Promise<unknown> } };

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const waitForDocumentFonts = async () => {
  const ready = (document as FontReadyDocument).fonts?.ready;
  if (ready) await ready;
};







// NOTE: PDF генерация вынесена в ./pdf (см. pdf/font.ts). Это решает "кракозябры" (кириллица) и упрощает поддержку.



const INITIAL_HABITS: UserHabit[] = [
  { id: 'h_water', title: 'Пить воду', goal: 8, current: 0, unit: 'ст.', streak: 0, lastCompletedDate: null },
  { id: 'h_steps', title: '10,000 шагов', goal: 10000, current: 0, unit: 'шаг', streak: 0, lastCompletedDate: null },
  { id: 'h_veg', title: 'Здоровый завтрак', goal: 1, current: 0, unit: 'порц.', streak: 0, lastCompletedDate: null },
  { id: 'h_sleep', title: 'Сон 8 часов', goal: 8, current: 0, unit: 'ч.', streak: 0, lastCompletedDate: null }
];

const INITIAL_REGISTRATION_DATA: RegistrationData = {
  name: '',
  gender: Gender.MALE,
  weight: 70,
  height: 170,
  age: 25,
  activityLevel: ActivityLevel.MODERATELY_ACTIVE,
  goal: Goal.LOSS,
  targetWeight: 65,
  dietary: { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' },
  medicalRestrictions: '',
  bloodPressureSystolic: 0,
  bloodPressureDiastolic: 0,
  restingPulse: 0,
  bloodGlucoseMmolL: 0,
  waistCm: 0,
  chestCm: 0,
  hipsCm: 0,
  plan: 'free',
  lossDeficit: DEFAULT_DEFICIT,
  gainSurplus: DEFAULT_SURPLUS,
  riskAckLoss: false,
  riskAckGain: false,
};







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
  const authStateRef = useRef(authState);
  authStateRef.current = authState;
  const [requireInvite, setRequireInvite] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteChecking, setInviteChecking] = useState<boolean>(false);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allowCachedUiStateRestore, setAllowCachedUiStateRestore] = useState(false);
  const uiAccountId = allowCachedUiStateRestore ? currentUser?.id ?? null : null;
  const { inviteCode, setInviteCode } = useInviteCodeState(uiAccountId);
  const [profileSyncState, setProfileSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastProfileSyncAt, setLastProfileSyncAt] = useState<number | null>(null);
  const [planScopeState, setPlanScopeState] = useState<{ ownerId: string | null; value: 'personal' | 'family' }>({
    ownerId: null,
    value: 'personal',
  });
  const planScope = getAccountScopedUiValue(
    currentUser?.id ?? null,
    planScopeState.ownerId,
    planScopeState.value,
    'personal',
    allowCachedUiStateRestore,
  );
  const setPlanScope = useCallback<React.Dispatch<React.SetStateAction<'personal' | 'family'>>>((update) => {
    if (!allowCachedUiStateRestore) return;
    const ownerId = currentUser?.id ?? null;
    setPlanScopeState((previous) => {
      const currentValue = previous.ownerId === ownerId ? previous.value : 'personal';
      return { ownerId, value: typeof update === 'function' ? update(currentValue) : update };
    });
  }, [allowCachedUiStateRestore, currentUser?.id]);
  const [userStateRepository, setUserStateRepository] = useState<UserStateRepository | null>(null);
  const [userProfileRepository, setUserProfileRepository] = useState<UserStateRepository | null>(null);
  const [loginReadGuard, setLoginReadGuard] = useState<OutboxReadGuard | null>(null);
  const rootAccountSessionScope = allowCachedUiStateRestore && currentUser?.id
    ? accountSessionRenderKey(loginReadGuard, currentUser.id)
    : null;
  // Feedback belongs to the login session while the workspace reconciles its cache.
  const profileSyncNoteScope = authenticatedAccountSessionScope(loginReadGuard, currentUser?.id);
  const { value: profileSyncNote, setValue: setProfileSyncNote } = useAccountScopedUiState<string | null>(
    profileSyncNoteScope,
    null,
  );
  const [completedProfileReload, setCompletedProfileReload] = useState<OutboxReadGuard | null>(null);
  useLayoutEffect(() => {
    if (!completedProfileReload) return;
    // Consume once after the scope hook's layout reset. A completion that lost
    // its session cannot reappear on a later login or cache reconciliation.
    setCompletedProfileReload(null);
    if (authenticatedAccountSessionScope(completedProfileReload, currentUser?.id) !== profileSyncNoteScope
      || profileSyncNoteScope === null) return;
    setProfileSyncNote('Профиль обновлён из облака.');
  }, [completedProfileReload, currentUser?.id, profileSyncNoteScope, setProfileSyncNote]);
  const paywall = usePaywall(currentUser?.plan || 'free', requireInvite, rootAccountSessionScope);
  const loginAttemptRef = useRef(0);
  const authBootstrapAttemptRef = useRef(0);
  const registrationAttemptRef = useRef(0);
  const registrationControllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => { registrationControllerRef.current?.abort(); }, []);
  const stateQueues = useSyncExternalStore(subscribeStateSaveIssues, getStateQueueSummaries, getStateQueueSummaries);
  const stateSaveIssues = useSyncExternalStore(subscribeStateSaveIssues, getStateSaveIssues, getStateSaveIssues);

  const [googleMe, setGoogleMe] = useState<
  null | { sub?: string; email?: string; name?: string; picture?: string; roles?: string[] }
>(null);
  const [registrationSessionState, setRegistrationSessionState] = useState<RegistrationSessionState>({
    identity: null,
    status: 'checking',
  });
  const registrationSessionStateRef = useRef(registrationSessionState);
  registrationSessionStateRef.current = registrationSessionState;
  const registrationSessionGuardRef = useRef<{
    identity: string;
    sessionKey: string | null;
    invalid: boolean;
  } | null>(null);
  useEffect(() => {
    const identity = authState === 'register' ? googleMe?.sub : undefined;
    registrationSessionGuardRef.current = null;
    if (!identity) {
      setRegistrationSessionState({ identity: null, status: 'checking' });
      return;
    }

    let disposed = false;
    let checking = false;
    const setSessionStatus = (status: 'checking' | 'active' | 'unavailable' | 'changed') => {
      setRegistrationSessionState(previous => previous.identity === identity && previous.status === status
        ? previous
        : { identity, status });
    };
    setSessionStatus('checking');
    const outbox = new DurableOutbox();
    const refreshSession = () => {
      if (checking) return;
      checking = true;
      void outbox.sessionState()
        .then(({ active }) => {
          if (disposed) return;
          let guard = registrationSessionGuardRef.current;
          if (!guard || guard.identity !== identity) {
            guard = { identity, sessionKey: null, invalid: false };
            registrationSessionGuardRef.current = guard;
          }
          if (guard.invalid) {
            setSessionStatus('changed');
            return;
          }

          const sessionKey = active
            ? JSON.stringify([active.accountId, active.serverSessionId ?? null, active.sessionEpoch])
            : null;
          if (!active || active.accountId !== identity || !sessionKey
            || (guard.sessionKey !== null && guard.sessionKey !== sessionKey)) {
            guard.invalid = true;
            setSessionStatus('changed');
            return;
          }

          guard.sessionKey = sessionKey;
          setSessionStatus('active');
        })
        .catch(() => {
          if (!disposed) setSessionStatus('unavailable');
        })
        .finally(() => { checking = false; });
    };

    refreshSession();
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(ACTIVE_SESSION_CHANNEL);
    } catch {
      // IndexedDB polling and focus listeners remain as fallbacks.
    }
    channel?.addEventListener('message', refreshSession);
    const interval = window.setInterval(refreshSession, 2_000);
    const refreshWhenVisible = () => { if (!document.hidden) refreshSession(); };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      channel?.removeEventListener('message', refreshSession);
      channel?.close();
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [authState, googleMe?.sub]);
  const authIdentityRef = useRef(googleMe?.sub);
  authIdentityRef.current = googleMe?.sub;
  const isCurrentProfileSession = useMemo(() => {
    const attempt = loginAttemptRef.current;
    return () => attempt === loginAttemptRef.current;
  }, [userProfileRepository]);
  const suppressNextFullProfileSyncRef = useRef(false);
  const hasPendingProfileChangesRef = useRef(false);
  const profileEditRevisionRef = useRef(0);
  const hasProfileDraftRef = useRef(false);
  const [hasProfileDraft, setHasProfileDraft] = useState(false);
  const onProfileDraftChange = useCallback((dirty: boolean) => {
    if (hasProfileDraftRef.current !== dirty) setHasProfileDraft(dirty);
    hasProfileDraftRef.current = dirty;
    if (dirty) profileEditRevisionRef.current += 1;
  }, []);
  const persistUser = useProfilePersistence({
    repository: userProfileRepository,
    currentUser,
    isCurrentSession: isCurrentProfileSession,
    profileEditRevisionRef,
    hasPendingProfileChangesRef,
    setCurrentUser,
    setAllUsers,
    setProfileSyncState,
  });

  const isAdmin = !!googleMe?.roles?.includes('admin');
  useEffect(() => stateSync.subscribeReadGuard(guard => {
    setLoginReadGuard(current => {
      if (!current || current.accountId !== guard.accountId || current.serverSessionId !== guard.serverSessionId) return current;
      if (current.sessionEpoch === guard.sessionEpoch && current.authFence === guard.authFence) return current;
      return guard;
    });
  }), []);
  useEffect(() => {
    if (currentUser?.id && currentUser.id === googleMe?.sub) return startStateSyncLifecycle(currentUser.id);
    stateSync.stop();
  }, [currentUser?.id, googleMe?.sub]);
  const normalizedAllUsers = useMemo(() => normalizeUserProfiles(allUsers), [allUsers]);

  const [foodDiary, setFoodDiary] = useState<FoodItem[]>([]);
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
    familyMenuRepository,
  } = useFamilyCloud({
    currentUser,
    loginGuard: loginReadGuard,
    isCurrentSession: isCurrentProfileSession,
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
    familyMenuProfiles,
    handleGenerateFamilyWeeklyMenu,
    setFamilyMenuError,
    setFamilyMenuPrefs,
    setFamilyMenuPrefsOpen,
  } = useFamilyMenu({
    cloudFamily, cloudFamilyMembers, cloudFamilyMenu, currentUser, generateFamilyWeeklyMenu,
    familyMenuRepository, loginGuard: loginReadGuard, isCurrentSession: isCurrentProfileSession,
    profileEditRevisionRef, persistUser, setCloudFamilyMenu, setFamilyShopping, weekStartISO,
  });

  useEffect(() => {
    setAiStorageScope(currentUser?.id ?? null);
  }, [currentUser?.id]);

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
  
  const {
    setSelectedDiaryDayKey,
    resolvedDiaryDayKey,
    selectedDiaryStats,
  } = useDiaryDaySelection(currentUser?.id, foodDiary, allowCachedUiStateRestore);
  const { value: insightModal, setValue: setInsightModal } = useAccountScopedUiState<
    null | { id: string; photo: string; name: string; insight: FoodInsight; nonFood?: boolean }
  >(rootAccountSessionScope, null);
  const { value: editFoodModal, setValue: setEditFoodModal } = useAccountScopedUiState<FoodCorrectionDraft | null>(
    rootAccountSessionScope,
    null,
  );
  const insightEntry = useMemo(() => (insightModal ? foodDiary.find(it => it.id === insightModal.id) ?? null : null), [insightModal, foodDiary]);
  const { activeTab, setActiveTab } = useHashTabNavigation('today');
  const isFamilyWorkspaceTab = activeTab === 'today' || activeTab === 'family' || activeTab === 'shopping';
  const { value: mobileMoreOpen, setValue: setMobileMoreOpen } = useAccountScopedUiState(rootAccountSessionScope, false);
  const sidebarVisibleTabs = isAdmin ? sidebarTabs : sidebarTabs.filter(tab => tab.id !== 'admin');
  const sidebarCoreTabs = sidebarVisibleTabs.filter(tab => sidebarCoreTabIds.includes(tab.id));
  const sidebarFeatureTabs = sidebarVisibleTabs.filter(tab => sidebarFeatureTabIds.includes(tab.id));
  const sidebarUtilityTabs = sidebarVisibleTabs.filter(tab => sidebarUtilityTabIds.includes(tab.id));
  const mobilePrimaryTabs = sidebarVisibleTabs.filter(tab => mobilePrimaryTabIds.includes(tab.id));
  const mobileMoreTabs = sidebarVisibleTabs.filter(tab => !mobilePrimaryTabIds.includes(tab.id));


  // Daily family screens own their guarded context; do not run the former weekly writer in parallel.
  useEffect(() => {
    setMobileMoreOpen(false);
  }, [activeTab]);

  const { value: isScanning, setValue: setIsScanning } = useAccountScopedUiState(rootAccountSessionScope, false);
  const { value: cameraOpen, setValue: setCameraOpen } = useAccountScopedUiState(rootAccountSessionScope, false);
  const { cameraFacing, setCameraFacing } = useCameraFacingPreference(currentUser?.id, allowCachedUiStateRestore);
  const {
    newWeight,
    setNewWeight,
    pdfIncludeMealLog,
    setPdfIncludeMealLog,
  } = useDashboardPreferences(currentUser?.id, allowCachedUiStateRestore);
  
  const [courseLibrary, setCourseLibrary] = useState<CourseLesson[] | null>(null);
  const {
    currentLesson,
    setCurrentLesson,
    isLessonViewOpen,
    setIsLessonViewOpen,
    isQuizActive,
    setIsQuizActive,
    selectedQuizOption,
    setSelectedQuizOption,
  } = useCourseUiState({
    currentUser,
    courseLibrary,
    allowCachedUiStateRestore,
  });

  // Metabolic Adaptation States
  const { value: adaptLoading, setValue: setAdaptLoading } = useAccountScopedUiState(rootAccountSessionScope, false);
  const { value: adaptNote, setValue: setAdaptNote } = useAccountScopedUiState(rootAccountSessionScope, '');
  const { refeedDate, scheduleRefeedTomorrow } = useRefeedSchedule(uiAccountId);

  const {
    adaptExpanded,
    setAdaptExpanded,
    adaptRead,
    setAdaptRead,
  } = useAdaptationUiState(uiAccountId);

  const resetUiState = useCallback(() => {
    clearAppUiStorage(currentUser?.id);

    setNewWeight('');
    setPdfIncludeMealLog(false);
    setMobileMoreOpen(false);
    setCameraFacing('environment');
    setIsScanning(false);
    setCameraOpen(false);
    paywall.closePaywall();
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
  }, [currentUser?.id, paywall.closePaywall, setCameraOpen, setEditFoodModal, setFamilyMenuPrefsOpen,
    setInsightModal, setIsScanning, setMobileMoreOpen, setPlanScope]);

  // Weekly Reports History
  const [weeklyReports, setWeeklyReports] = useState<WeeklyStoredReport[]>([]);

  const { settings, setSettings } = useSettingsPersistence({
    userId: uiAccountId,
    repository: uiAccountId ? userStateRepository : null,
    loginGuard: loginReadGuard,
    isCurrentSession: isCurrentProfileSession,
  });

  // AI status badge (shows when AI is live/cache/fallback or cooling down due to quota)
  const { aiStatus, lastAiAction } = useAiActivityStatus(
    allowCachedUiStateRestore ? currentUser?.id ?? null : null,
  );

  useDocumentTheme(settings.theme);

  const {
    favoriteRecipes,
    addFavoriteRecipe,
    removeFavoriteRecipe,
    clearFavoriteRecipes,
  } = useFavoriteRecipes({
    userId: uiAccountId,
    repository: uiAccountId ? userStateRepository : null,
    loginGuard: loginReadGuard,
    isCurrentSession: isCurrentProfileSession,
  });

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
  const [habits, setHabits] = useState<UserHabit[]>(INITIAL_HABITS);
  // AI Council (Orchestrator v2)
  const {
    councilInput,
    setCouncilInput,
    councilLoading,
    councilStage,
    councilError,
    councilMessages,
    canClearCouncilHistory,
    expandedCouncilThoughtIds,
    setExpandedCouncilThoughtIds,
    councilScrollRef,
    handleCouncilSubmit,
    clearCouncilHistory,
  } = useCouncilChat({
    currentUser, foodDiary, habits,
    loginGuard: loginReadGuard,
    isCurrentSession: isCurrentProfileSession,
    allowCachedUiStateRestore,
  });
  const [foodHistory, setFoodHistory] = useState<FastLogItem[]>([]);
  const [foodFavorites, setFoodFavorites] = useState<FastLogItem[]>([]);
  const {
    searchQuery,
    setSearchQuery,
    showSearchResults,
    setShowSearchResults,
  } = useNutritionSearchState(currentUser?.id, allowCachedUiStateRestore);

  const openEditFood = (item: FoodEntry) => {
    if (!allowCachedUiStateRestore) return;
    setEditFoodModal(buildFoodCorrectionDraft(item, inferMealType(item.timestamp || new Date().toISOString())));
  };
  const registrationScope = googleMe?.sub ? `registration:${googleMe.sub}` : null;
  const registrationGuard = registrationSessionGuardRef.current;
  const registrationDraftScope = authState === 'register'
    && isRegistrationSessionReady(googleMe?.sub, registrationSessionState)
    && registrationGuard?.identity === googleMe?.sub && !registrationGuard?.invalid
    && registrationGuard?.sessionKey ? `registration:${registrationGuard.sessionKey}` : null;
  const { value: regData, setValue: setRegData } = useRegistrationDraft(
    registrationDraftScope,
    INITIAL_REGISTRATION_DATA,
  );

  useEffect(() => {
    if (authState !== 'register') return;
    if (regData.name.trim()) return;
    const fallbackName = googleMe?.name?.trim() || googleMe?.email?.split('@')[0]?.trim() || 'Пользователь';
    if (!fallbackName) return;
    setRegData((prev) => (prev.name.trim() ? prev : { ...prev, name: fallbackName }));
  }, [authState, googleMe?.email, googleMe?.name, regData.name]);

  const [onboardingMode, setOnboardingMode] = useState<'mvp' | 'investor'>('mvp');

  const { planTaskDone, setPlanTaskDone } = usePlanTaskState(uiAccountId);
  const {
    planIntroOpen,
    setPlanIntroOpen,
    planRulesExpanded,
    setPlanRulesExpanded,
    planWeekExpanded,
    setPlanWeekExpanded,
  } = usePlanUiState({
    userId: currentUser?.id,
    allowCachedUiStateRestore,
    weekDayKeys: currentUser?.aiPlan?.weeklyMenu?.days.map((day) => day.day) ?? [],
    planScope,
    setPlanScope,
    familyMenuPrefsOpen,
    setFamilyMenuPrefsOpen,
  });
  const [versionInfoOpen, setVersionInfoOpen] = useState(false);

  const { value: planError, setValue: setPlanError } = useAccountScopedUiState<string | null>(registrationScope, null);

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

  const getAchievementContext = useCallback(() => buildAchievementContext({
    currentUser,
    foodDiary,
    weeklyReportsCount: weeklyReports.length,
    shoppingItems: familyShopping?.items,
    familyActive: Boolean(cloudFamily),
    todayKey: getTodayKey(),
  }), [cloudFamily, currentUser, familyShopping?.items, foodDiary, weeklyReports.length]);

  const achievements = useAchievements({ userId: currentUser?.id, getContext: getAchievementContext,
    isCurrentSession: isCurrentProfileSession, loginGuard: loginReadGuard });
  const checkAchievements = achievements.checkAchievements;
  const {
    persistFoodDiary,
    addFoodToDiary,
    addFoodToDiaryGuarded,
    updateFoodEntry,
    updateFoodEntryGuarded,
    deleteFoodPhoto,
    deleteFoodEntry,
  } = useFoodDiary({
    userId: currentUser?.id,
    repository: userStateRepository,
    loginGuard: loginReadGuard,
    isCurrentSession: isCurrentProfileSession,
    foodDiary,
    foodHistory,
    setFoodDiary,
    inferMealType,
    setFoodHistory,
    setSelectedDiaryDayKey,
    checkAchievements,
  });
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
  const {
    weeklyMenuLoading,
    weeklyMenuError,
    handleGenerateWeeklyMenu,
  } = useWeeklyMenuGeneration({
    currentUser,
    loginGuard: loginReadGuard,
    persistUser,
    checkAchievements,
    isCurrentSession: isCurrentProfileSession,
    profileEditRevisionRef,
  });

  const targets = useMemo(() => {
    if (!currentUser) return { calories: 0, protein: 0, fat: 0, carbs: 0 };
    return calculateDailyTargets(currentUser);
  }, [currentUser]);

  const weekly = useMemo(() => {
    if (!currentUser) return null;
    return generateWeeklyIntelligence(currentUser, foodDiary, habits, targets.calories);
  }, [currentUser, foodDiary, habits, targets.calories]);

  const forecastNextWeek = useMemo(() => calculateNextWeekWeightForecast(currentUser, Boolean(weekly), {
    lossDeficit: DEFAULT_DEFICIT,
    gainSurplus: DEFAULT_SURPLUS,
  }), [weekly, currentUser]);

  const wisShareCardRef = useRef<HTMLDivElement | null>(null);
  const wisShareScope = accountSessionRenderKey(loginReadGuard, currentUser?.id);
  const { wisShareState, wisShareMessage, setWisShareNotice } = useWisShareNotice(
    wisShareScope,
    allowCachedUiStateRestore,
  );

  const isCurrentAccountSession = useCallback(async () => {
    if (!allowCachedUiStateRestore || !isCurrentProfileSession()) return false;
    if (loginReadGuard) {
      try {
        await assertReadSession(loginReadGuard, { isCurrentSession: isCurrentProfileSession });
      } catch {
        return false;
      }
    }
    return allowCachedUiStateRestore && isCurrentProfileSession();
  }, [allowCachedUiStateRestore, isCurrentProfileSession, loginReadGuard]);

  const exportWeeklyPDF = useCallback(async (report: WeeklyStoredReport) => {
    if (!await isCurrentAccountSession()) return;
    const saved = await exportWeeklyReportPdf(report, { isCurrentSession: isCurrentAccountSession });
    if (!saved || !await isCurrentAccountSession()) return;
  }, [isCurrentAccountSession]);

  const handleShareWisCard = useCallback(async () => {
    if (!currentUser || !weekly || !allowCachedUiStateRestore || !isCurrentProfileSession()) return;
    const card = wisShareCardRef.current;
    if (!card) {
      setWisShareNotice('error', 'Не удалось подготовить карточку WIS. Попробуйте ещё раз.');
      return;
    }

    setWisShareNotice('busy', 'Готовим PNG-карточку WIS...');

    try {
      const method = await shareWisCard({
        card,
        wis: weekly.wis,
        waitForFonts: waitForDocumentFonts,
        isCurrentSession: isCurrentAccountSession,
      });
      if (!await isCurrentAccountSession()) return;
      setWisShareNotice('success', method === 'share_sheet'
        ? 'Карточка готова и передана в системное меню отправки.'
        : 'Системная отправка недоступна — PNG скачан на устройство.');
      void checkAchievements('wis_share_success', { wisCount: Math.max(weeklyReports.length, 1) });
      return;
    } catch (error: unknown) {
      if (!await isCurrentAccountSession()) return;
      const reason = classifyWisShareFailure(error);
      setWisShareNotice('error', 'Не удалось создать картинку. Попробуйте скачать PDF или повторите позже.');
    }
  }, [allowCachedUiStateRestore, checkAchievements, currentUser, isCurrentProfileSession, isCurrentAccountSession,
    weekly, weeklyReports.length, setWisShareNotice]);

  const aiReportGenerationRef = useWeeklyAiReport({
    currentUser,
    weekly,
    targets,
    setWeeklyReports,
    loginGuard: loginReadGuard,
    isCurrentSession: isCurrentProfileSession,
  });

  const dailyStats = useMemo(() => calculateDailyNutrition(foodDiary), [foodDiary]);
  const lessons = courseLibrary ?? [];

  const weightTrend = useMemo(() => calculateDashboardWeightTrend(currentUser?.weightHistory), [currentUser?.weightHistory]);

  const searchResults = useMemo(() => findFoodSearchResults(searchQuery, foodHistory, foodFavorites), [searchQuery, foodHistory, foodFavorites]);

  const logout = useMemo(() => createLogoutSession({
    onClearLocalSession: () => {
      authBootstrapAttemptRef.current += 1;
      registrationAttemptRef.current += 1;
      registrationControllerRef.current?.abort();
      loginAttemptRef.current += 1; setUserStateRepository(null);
      setUserProfileRepository(null);
      setLoginReadGuard(null);
      hasProfileDraftRef.current = false;
      setHasProfileDraft(false);
      void stateSync.invalidate().catch(() => {
        if (googleMe?.sub) reportStateSaveIssue({ accountId: googleMe.sub, key: `fitfocus_data_${googleMe.sub}_sync`, kind: 'error', reason: 'logout-storage' });
      });
    },
    googleSub: googleMe?.sub,
    loginGuard: loginReadGuard,
    assertCurrentSession: async () => {
      if (!loginReadGuard) throw new Error('LOGIN_SESSION_CHANGED');
      await assertReadSession(loginReadGuard, { isCurrentSession: isCurrentProfileSession });
    },
    setGoogleMe,
    setCurrentUser,
    setProfileSyncState,
    setLastProfileSyncAt,
    setAuthState,
  }), [googleMe?.sub, isCurrentProfileSession, loginReadGuard]);

  const deleteAccount = useCallback(async () => {
    const deletedUserId = googleMe?.sub ?? currentUser?.id ?? null;
    await deleteAccountSession({
      googleSub: googleMe?.sub,
      loginGuard: loginReadGuard,
      assertCurrentSession: async () => {
        if (!loginReadGuard) throw new Error('LOGIN_SESSION_CHANGED');
        await assertReadSession(loginReadGuard, { isCurrentSession: isCurrentProfileSession });
      },
      clearLocalData: deletedUserId ? async () => {
        const cleanup = await clearLocalUserData(deletedUserId);
        setAllUsers(prev => prev.filter(user => user.id !== deletedUserId));
        if (!cleanup.complete) {
          const reasons = [
            !cleanup.localStorageCleared ? 'часть данных localStorage недоступна для удаления' : '',
            !cleanup.indexedDbCleared ? 'не удалось полностью очистить IndexedDB' : '',
            cleanup.legacyEvidenceRetained ? 'legacy-очередь содержит записи аккаунта или данные без подтверждённого владельца; они сохранены для безопасной миграции' : '',
          ].filter(Boolean);
          alert(`Аккаунт удалён на сервере, но локальная очистка завершена не полностью: ${reasons.join('; ')}.`);
        }
      } : undefined,
      onLogout: logout,
    });
  }, [currentUser?.id, googleMe?.sub, isCurrentProfileSession, loginReadGuard, logout, setAllUsers]);

  const loginAsUser = useCallback(async (
    user: UserProfile,
    authUser: null | { sub?: string; email?: string; picture?: string },
    isCurrent: () => boolean = () => true,
    readGuard?: OutboxReadGuard,
  ) => {
    if (!isCurrent()) return;
    const loginAttempt = ++loginAttemptRef.current;
    const prepared = await prepareLoginSession(user, authUser, {
      initialHabits: INITIAL_HABITS,
      resetUsageIfNewTime: resetUsageIfNewPeriod,
      isCurrentSession: () => loginAttempt === loginAttemptRef.current && isCurrent(),
      readGuard,
    });
    if (loginAttempt !== loginAttemptRef.current || !isCurrent()) return;
    const profileRepository = prepared.hydrated.repository ?? new UserStateRepository(prepared.currentUser.id);
    const pendingProfile = await profileRepository.hasPending('profile');
    if (prepared.hydrated.readGuard) await assertReadSession(prepared.hydrated.readGuard, { isCurrentSession: isCurrent });
    if (loginAttempt !== loginAttemptRef.current || !isCurrent()) return;
    setUserStateRepository(profileRepository);
    setUserProfileRepository(profileRepository);
    setLoginReadGuard(prepared.hydrated.readGuard ?? null);
    hasProfileDraftRef.current = false;
    setHasProfileDraft(false);
    setCurrentUser(prepared.currentUser);
    if (prepared.hydrated.allUsers.length > 0) setAllUsers(prepared.hydrated.allUsers);
    setWeeklyReports(prepared.hydrated.weeklyReports);
    setFoodDiary(prepared.hydrated.foodDiary);
    setHabits(prepared.hydrated.habits);
    setFoodHistory(prepared.hydrated.foodHistory);
    setFoodFavorites(prepared.hydrated.foodFavorites);
    setCoachCard(prepared.hydrated.coachCard);
    setCurrentLesson(null);
    clearOAuthContinuationState();
    setAuthState('app');
    hasPendingProfileChangesRef.current = pendingProfile;
    setProfileSyncState(pendingProfile ? 'saving' : 'idle');
    setLastProfileSyncAt(null);
  }, []);


  const applyRemoteProfile = useCallback((profile: UserProfile, readGuard: OutboxReadGuard) => {
    loginAttemptRef.current += 1;
    const refreshed = resetUsageIfNewPeriod(profile);
    setUserProfileRepository(new UserStateRepository(profile.id));
    setCurrentUser(refreshed);
    setAllUsers(previous => normalizeUserProfiles(previous.map(user => user.id === profile.id ? refreshed : user)));
    hasPendingProfileChangesRef.current = false;
    setProfileSyncState('idle');
    setCompletedProfileReload({ ...readGuard });
  }, []);

  const flushPendingProfileToCloud = useCallback(async (profile: UserProfile) => {
    if (!googleMe?.sub) {
      setProfileSyncState('idle');
      setProfileSyncNote(null);
      return;
    }
    await pushProfileToCloudService(profile, {
      currentUser,
      repository: userProfileRepository,
      isCurrentSession: isCurrentProfileSession,
      syncStateImpl: id => stateSync.flushPending(id),
      profileEditRevisionRef,
      hasUncommittedDraft: () => hasProfileDraftRef.current,
      setProfileSyncState,
      setProfileSyncNote,
      setLastProfileSyncAt,
      persistUser,
      applyRemoteProfile,
    });
  }, [currentUser, googleMe?.sub, applyRemoteProfile, persistUser, userProfileRepository, isCurrentProfileSession, setProfileSyncNote]);

  const patchProfileInCloud = useCallback(async (patch: Partial<UserProfile>) => {
    return patchProfileInCloudService(patch, {
      currentUser,
      repository: userProfileRepository,
      isCurrentSession: isCurrentProfileSession,
      loginGuard: loginReadGuard,
      profileEditRevisionRef,
      hasUncommittedDraft: () => hasProfileDraftRef.current,
      setProfileSyncState,
      setProfileSyncNote,
      setLastProfileSyncAt,
      persistUser,
      applyRemoteProfile,
    });
  }, [currentUser, applyRemoteProfile, loginReadGuard, persistUser, userProfileRepository, isCurrentProfileSession, setProfileSyncNote]);

  const patchProfileInCloudWithAchievements = useCallback(async (patch: Partial<UserProfile>) => {
    const committed = await patchProfileInCloud(patch);
    if (!committed || !isCurrentProfileSession()) return false;
    if (patch.profileDetailsCompleted) {
      void checkAchievements('profile_details_completed', { profileDetailsCompleted: true });
    }
    if (Array.isArray(patch.measurementsHistory) && patch.measurementsHistory.length > 0) {
      void checkAchievements('measurement_saved', { measurementsCount: patch.measurementsHistory.length });
    }
    if (typeof patch.wearableSleepHoursLastNight === 'number' && patch.wearableSleepHoursLastNight >= 8) {
      void checkAchievements('sleep_8h_recorded', { sleepHours: patch.wearableSleepHoursLastNight });
    }
    return true;
  }, [checkAchievements, patchProfileInCloud, isCurrentProfileSession]);

  const syncAllLocalDataNow = useCallback(async () => {
    if (!googleMe?.sub) {
      setProfileSyncState('idle');
      setProfileSyncNote(null);
      setLastProfileSyncAt(null);
      return;
    }
    await syncAllLocalDataNowService({
      currentUser,
      repository: userProfileRepository,
      isCurrentSession: isCurrentProfileSession,
      profileEditRevisionRef,
      hasUncommittedDraft: () => hasProfileDraftRef.current,
      setProfileSyncState,
      setProfileSyncNote,
      setLastProfileSyncAt,
      persistUser,
      applyRemoteProfile,
    });
  }, [currentUser, googleMe?.sub, applyRemoteProfile, persistUser, userProfileRepository, isCurrentProfileSession, setProfileSyncNote]);

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
      repository: userProfileRepository,
      isCurrentSession: isCurrentProfileSession,
      profileEditRevisionRef,
      hasUncommittedDraft: () => hasProfileDraftRef.current,
      setProfileSyncState,
      setProfileSyncNote,
      setLastProfileSyncAt,
      persistUser,
      refreshProfileWithGuardImpl: id => stateSync.refreshProfileWithGuard(id),
      assertReadGuardImpl: guard => assertReadSession(guard, { isCurrentSession: isCurrentProfileSession }),
      setLoginReadGuard,
      applyRemoteProfile,
    });
  }, [currentUser, googleMe?.sub, applyRemoteProfile, persistUser, userProfileRepository, isCurrentProfileSession, setLoginReadGuard, setProfileSyncNote]);

  // Edits are already durable. A debounce wakes the current sender without obtaining fresh proof.
  useProfileAutoSync({
    currentUser,
    cloudUserId: googleMe?.sub,
    hasUncommittedDraft: hasProfileDraft,
    suppressNextFullProfileSyncRef,
    hasPendingProfileChangesRef,
    pushProfileToCloud: flushPendingProfileToCloud,
    setProfileSyncState,
    setProfileSyncNote,
    setLastProfileSyncAt,
  });

  const adaptationWeightProgress = useMemo(
    () => calculateAdaptationWeightProgress(currentUser?.weightHistory),
    [currentUser?.weightHistory],
  );
  const deltaDays = adaptationWeightProgress.deltaDays;
  const weightDeltaN = adaptationWeightProgress.weightDelta;

  const expectedN = useMemo(
    () => currentUser ? calculateExpectedWeightDelta(currentUser, deltaDays) : 0,
    [currentUser, deltaDays],
  );

  const compliancePct = useMemo(
    () => currentUser ? calculateAdaptationCompliance(foodDiary, habits, targets.calories) : 0,
    [currentUser, foodDiary, habits, targets.calories],
  );

  const adaptationIndex = useMemo(
    () => currentUser ? calculateAdaptationIndex(currentUser.goal, expectedN, weightDeltaN) : 0,
    [currentUser, expectedN, weightDeltaN],
  );

  const adaptationStatus = useMemo(
    () => currentUser ? getAdaptationStatus(currentUser.goal, adaptationIndex) : { label: '—', color: 'text-slate-400', level: 'none' as const },
    [currentUser, adaptationIndex],
  );

  const refeedSuggestion = useMemo(
    () => currentUser ? getRefeedSuggestion(currentUser.goal, compliancePct, adaptationIndex, targets.calories) : { type: 'stay' as const },
    [currentUser, compliancePct, adaptationIndex, targets.calories],
  );

  const checkLimit = useCallback((type: keyof typeof PREMIUM_GATES) => {
    if (!currentUser) return false;
    return canUsePremiumGate(type, paywall.plan, currentUser.usage);
  }, [currentUser, paywall.plan]);

  const incrementUsage = useCallback((key: UsageCounter) => {
    if (!currentUser) return;
    persistUser({ ...currentUser, usage: incrementUsageCounter(currentUser.usage, key) });
  }, [currentUser, persistUser]);

  const remainingPhotoScans = useMemo(() => {
    if (!currentUser) return 0;
    const allowance = PREMIUM_GATES.aiFoodPhotoPerDay[paywall.plan];
    return getRemainingFoodPhotoScans(allowance, currentUser.usage?.aiFoodPhotoCount);
  }, [currentUser, paywall.plan]);

  const incrementPhotoUsage = useCallback((guard: OutboxCommitGuard) => {
    if (!currentUser) return Promise.resolve(null);
    return persistUser(previous => ({
      ...previous,
      usage: incrementUsageCounter(previous.usage, 'aiFoodPhotoCount'),
    }), guard);
  }, [currentUser, persistUser]);

  const processPhotoFiles = useFoodPhotoAnalysis({
    userId: currentUser?.id,
    loginGuard: loginReadGuard,
    isCurrentSession: isCurrentProfileSession,
    remainingScans: remainingPhotoScans,
    openPaywall: paywall.openPaywall,
    setScanning: setIsScanning,
    compressPhoto: compressFoodPhoto,
    analyzePhoto: analyzeFoodPhoto,
    addFoodToDiary: addFoodToDiaryGuarded,
    incrementUsage: incrementPhotoUsage,
    showInsight: setInsightModal,
  });

  const {
    selectedFoodIds,
    toggleFoodSelected,
    clearFoodSelection,
    bulkUpdateMealType,
    bulkRemoveSelectedFoods,
  } = useFoodSelection(
    foodDiary,
    setFoodDiary,
    persistFoodDiary,
    allowCachedUiStateRestore && currentUser?.id
      ? accountSessionRenderKey(loginReadGuard, currentUser.id)
      : null,
  );

  const handleDiaryDayChange = useCallback((dayKey: string) => {
    clearFoodSelection();
    setSelectedDiaryDayKey(dayKey);
  }, [clearFoodSelection]);

  const handleToggleHabit = useCallback(async (habitKey: 'water' | 'steps' | 'breakfast' | 'sleep'): Promise<'saved' | 'failed'> => {
    if (!currentUser || !loginReadGuard || loginReadGuard.accountId !== currentUser.id || !isCurrentProfileSession()) return 'failed';
    const result = applyHabitToggle(currentUser, habits, habitKey);
    try {
      const operation = await persistUser(result.updatedProfile, {
        readGuard: { ...loginReadGuard },
        canCommit: isCurrentProfileSession,
      }, { durable: true });
      if (operation?.status !== 'pending' || !isCurrentProfileSession()) return 'failed';
      setHabits(result.habits);
      if (result.waterGoalReached) {
        void checkAchievements('habit_water_done', { waterToday: true });
      }
      return 'saved';
    } catch {
      return 'failed';
    }
  }, [checkAchievements, currentUser, habits, isCurrentProfileSession, loginReadGuard, persistUser]);

  const handleToggleTask = useCallback((taskDate: string) => {
    if (!currentUser) return;
    const nextTasks = togglePlanTask(currentUser.tasks, taskDate);
    if (nextTasks) persistUser({ ...currentUser, tasks: nextTasks });
  }, [currentUser, persistUser]);

  const exportShortPdf = useCallback(async () => {
    if (!currentUser || !await isCurrentAccountSession()) return;
    const { downloadShortHealthReportPdf } = await import('./pdf');
    if (!await isCurrentAccountSession()) return;
    const saved = await downloadShortHealthReportPdf({
      user: currentUser, targets, foodDiary, habits, isCurrentSession: isCurrentAccountSession,
    });
    if (!saved || !await isCurrentAccountSession()) return;
    void checkAchievements('pdf_report_generated');
  }, [checkAchievements, currentUser, targets, foodDiary, habits, isCurrentAccountSession]);

  const exportDetailedPdf = useCallback(async () => {
    if (!currentUser || !await isCurrentAccountSession()) return;
    const { downloadDetailedHealthReportPdf } = await import('./pdf');
    if (!await isCurrentAccountSession()) return;
    const saved = await downloadDetailedHealthReportPdf({
      user: currentUser, targets, foodDiary, habits, includeMealLog: pdfIncludeMealLog,
      isCurrentSession: isCurrentAccountSession,
    });
    if (!saved || !await isCurrentAccountSession()) return;
    void checkAchievements('pdf_report_generated');
  }, [checkAchievements, currentUser, targets, foodDiary, habits, pdfIncludeMealLog, isCurrentAccountSession]);

  const bootstrapAuth = useCallback(async () => {
    const attempt = ++authBootstrapAttemptRef.current;
    const isCurrent = () => attempt === authBootstrapAttemptRef.current;
    const continueAfterOAuth = consumeOAuthContinuationState();

    await bootstrapAuthSession({
      requireInvite,
      loginAsUser: (user, authUser, readGuard) => loginAsUser(user, authUser, isCurrent, readGuard),
      isCurrentSession: isCurrent,
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
    return () => { authBootstrapAttemptRef.current += 1; };
  }, [bootstrapAuth]);

  // A PWA reopened while offline cannot confirm its cloud session. Keep this
  // listener active during the initial bootstrap too: connectivity can return
  // before a failed request moves authState to auth_choice.
  useEffect(() => {
    const retryBootstrapWhenOnline = () => {
      const state = authStateRef.current;
      if (navigator.onLine && !authIdentityRef.current && (state === 'loading' || state === 'auth_choice')) {
        void bootstrapAuth();
      }
    };
    window.addEventListener('online', retryBootstrapWhenOnline);
    return () => window.removeEventListener('online', retryBootstrapWhenOnline);
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

  useCloudSyncRecovery({
    cloudUserId: googleMe?.sub,
    currentUserId: currentUser?.id,
    sessionKey: loginReadGuard
      ? JSON.stringify([loginReadGuard.accountId, loginReadGuard.serverSessionId, loginReadGuard.sessionEpoch])
      : null,
    profileSyncState,
    hasPendingProfileChangesRef,
    syncAllLocalDataNow,
    reloadUserFromCloud,
  });

  // Load public env flags (no auth)
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let controller: AbortController | null = null;
    let removePageExit = () => {};

    const loadPublicEnv = () => {
      const requestGeneration = ++generation;
      removePageExit();
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      removePageExit = listenForPageExit(() => {
        if (requestGeneration !== generation) return;
        generation += 1;
        requestController.abort();
      });

      void (async () => {
        try {
          const r = await fetchWithResilience('/api/env', {
            credentials: 'include',
            signal: requestController.signal,
          }, { retries: 1 });
          if (disposed || requestGeneration !== generation || !r.ok) return;
          const raw = await r.json().catch(() => null) as unknown;
          if (!disposed && requestGeneration === generation && isRecord(raw)
            && typeof raw.requireInvite === 'boolean') {
            setRequireInvite(raw.requireInvite);
          }
        } catch {
          // Public configuration is optional until the next page load/restore.
        } finally {
          if (requestGeneration === generation) removePageExit();
        }
      })();
    };

    const onPageShow = (event: Event) => {
      if (!(event as PageTransitionEvent).persisted || disposed) return;
      setInviteChecking(false);
      loadPublicEnv();
    };

    window.addEventListener('pageshow', onPageShow);
    loadPublicEnv();
    return () => {
      disposed = true;
      generation += 1;
      removePageExit();
      window.removeEventListener('pageshow', onPageShow);
      controller?.abort();
    };
  }, []);

  const ensureInviteOk = useCallback(async (): Promise<boolean> => {
    return ensureInviteCodeIsValid({
      requireInvite,
      inviteCode,
      setInviteError,
      setInviteChecking,
    });
  }, [requireInvite, inviteCode]);

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await processPhotoFiles(files);
    // allow uploading the same file again
    try { e.target.value = ''; } catch {}
  }, [processPhotoFiles]);

const logWeight = useCallback(async (): Promise<'saved' | 'invalid' | 'failed'> => {
    if (!currentUser || !newWeight) return 'invalid';
    const result = recordDashboardWeight(currentUser, newWeight);
    if (result.kind === 'invalid') return 'invalid';
    if (!loginReadGuard || loginReadGuard.accountId !== currentUser.id || !isCurrentProfileSession()) return 'failed';
    try {
      const operation = await persistUser(result.profile, {
        readGuard: { ...loginReadGuard },
        canCommit: isCurrentProfileSession,
      }, { durable: true });
      if (operation?.status !== 'pending' || !isCurrentProfileSession()) return 'failed';
      setNewWeight('');
      void checkAchievements('log_weight', {
        weightHistoryCount: result.profile.weightHistory?.length || 0,
        latestWeight: result.weight,
      });
      return 'saved';
    } catch {
      return 'failed';
    }
  }, [checkAchievements, currentUser, isCurrentProfileSession, loginReadGuard, newWeight, persistUser, setNewWeight]);

  const {
    coachCard,
    setCoachCard,
    coachLoading,
    handleGetCoachAdvice,
  } = useCoachAdvice({
    currentUser,
    loginGuard: loginReadGuard,
    isCurrentSession: isCurrentProfileSession,
    profileEditRevisionRef,
    targets,
    dailyStats,
    canUseCoachAdvice: () => checkLimit('aiCoachAdvicePerDay'),
    openPaywall: paywall.openPaywall,
    incrementUsage: guard => persistUser(previous => ({
      ...previous,
      usage: incrementUsageCounter(previous.usage, 'aiCoachCount'),
    }), guard),
    repository: userStateRepository,
    checkAchievements: () => checkAchievements('ai_coach_success'),
  });

  const handlePlateauExplanation = usePlateauExplanation({
    currentUserId: currentUser?.id ?? null,
    loginGuard: loginReadGuard,
    isCurrentSession: isCurrentProfileSession,
    profileEditRevisionRef,
    setLoading: setAdaptLoading,
    setNote: setAdaptNote,
  });

  const aiRetryScope = useMemo(() => new AiActionScope(isCurrentProfileSession), [currentUser?.id, isCurrentProfileSession]);
  useLayoutEffect(() => {
    aiRetryScope.activate();
    const hide = () => { aiRetryScope.invalidate(); setAdaptLoading(false); };
    const show = (event: PageTransitionEvent) => { if (event.persisted) aiRetryScope.activate(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', hide);
      window.addEventListener('pageshow', show);
    }
    return () => {
      aiRetryScope.invalidate();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', hide);
        window.removeEventListener('pageshow', show);
      }
    };
  }, [aiRetryScope, setAdaptLoading]);

  const handleAiRetry = useCallback((opts?: { force?: boolean }) => {
    const attempt = aiRetryScope.begin();
    if (!attempt) return Promise.resolve();
    return retryLastAiAction({
      currentUser,
      weekly,
      targets,
      compliancePct,
      weightDeltaN,
      expectedN,
      adaptationIndex,
      refeedSuggestion,
      persistUser,
      retryCoachAdvice: (action, retryOptions) => handleGetCoachAdvice(action, retryOptions),
      retryPlateauExplanation: (input, action, retryOptions) => handlePlateauExplanation(input, action, retryOptions),
      weeklyReportGenerationRef: aiReportGenerationRef,
      controller: attempt.controller,
      profileEditRevisionRef,
      loginGuard: loginReadGuard,
      isCurrentSession: attempt.isCurrent,
      setWeeklyReports,
    }, opts).finally(attempt.finish);
  }, [
    adaptationIndex,
    aiRetryScope,
    compliancePct,
    currentUser,
    expectedN,
    handleGetCoachAdvice,
    handlePlateauExplanation,
    loginReadGuard,
    profileEditRevisionRef,
    persistUser,
    refeedSuggestion,
    targets,
    weekly,
    weightDeltaN,
  ]);

  const handleRegister = useCallback(async () => {
    const attempt = ++registrationAttemptRef.current;
    registrationControllerRef.current?.abort();
    const controller = new AbortController();
    registrationControllerRef.current = controller;
    const bootstrap = authBootstrapAttemptRef.current;
    const accountId = googleMe?.sub;
    const isCurrent = () => {
      const sessionGuard = registrationSessionGuardRef.current;
      return attempt === registrationAttemptRef.current && bootstrap === authBootstrapAttemptRef.current
        && accountId === authIdentityRef.current
        && isRegistrationSessionReady(accountId, registrationSessionStateRef.current)
        && sessionGuard?.identity === accountId && sessionGuard.sessionKey !== null && !sessionGuard.invalid;
    };
    const getProfileWriteGuard = async (): Promise<OutboxLocalCommitGuard | null> => {
      if (!accountId || !isCurrent()) return null;
      const { active } = await new DurableOutbox().sessionState();
      if (!isCurrent() || !active || active.accountId !== accountId
        || typeof active.serverSessionId !== 'string' || !/^[a-f0-9]{64}$/.test(active.serverSessionId)
        || !active.sessionEpoch) return null;
      const sessionGuard = registrationSessionGuardRef.current;
      const sessionKey = JSON.stringify([active.accountId, active.serverSessionId, active.sessionEpoch]);
      if (sessionGuard?.identity !== accountId || sessionGuard.invalid || sessionGuard.sessionKey !== sessionKey) return null;
      return {
        localCommitGuard: {
          accountId,
          serverSessionId: active.serverSessionId,
          sessionEpoch: active.sessionEpoch,
        },
        canCommit: isCurrent,
      };
    };
    try {
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
        loginAsUser: (user, readGuard) => loginAsUser(user, googleMe, isCurrent, readGuard),
        controller,
        isCurrentSession: isCurrent,
        getProfileWriteGuard,
        setActiveTab,
        setPlanIntroOpen,
        fetchImpl: fetch,
      });
    } finally {
      if (registrationControllerRef.current === controller) registrationControllerRef.current = null;
    }
  }, [regData, loginAsUser, regNameValid, normalizedAllUsers.length, requireInvite, inviteCode, googleMe,
    registrationSessionState, setPlanError, setActiveTab, setPlanIntroOpen, generatePersonalPlan, setDevPlanOverride, setLastAiAction]);

  const { isActivatingPlan, activationStep, startPlanActivation: handleActivateWithTransition } = usePlanActivation({
    totalMs: ACTIVATION_TOTAL_MS,
    stepCount: ACTIVATION_STEPS.length,
    onComplete: handleRegister,
  });

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.aiPlan) return;
    if (hasProfileDraftRef.current) return;
    if (loginReadGuard && loginReadGuard.accountId !== currentUser.id) return;
    const writeGuard: OutboxWriteGuard | undefined = loginReadGuard ? {
      readGuard: { ...loginReadGuard },
      canCommit: isCurrentProfileSession,
    } : undefined;
    void persistUser(previous => previous.aiPlan ? previous : {
      ...previous,
      aiPlan: buildFallbackAiPlan(previous),
    }, writeGuard, { durable: true }).catch(() => undefined);
  }, [currentUser, hasProfileDraft, isCurrentProfileSession, loginReadGuard, persistUser]);

  const courseWriteGuard: OutboxWriteGuard | undefined = loginReadGuard ? {
    localCommitGuard: {
      accountId: loginReadGuard.accountId,
      serverSessionId: loginReadGuard.serverSessionId,
      sessionEpoch: loginReadGuard.sessionEpoch,
    },
    canCommit: isCurrentProfileSession,
  } : undefined;
  const { closeLessonView, handleMarkLessonRead, handleStartLessonQuiz, handleQuizSubmit, isSavingLesson, lessonSaveError } = useCourseActions({
    currentUser,
    currentLesson,
    selectedQuizOption,
    persistUser,
    writeGuard: courseWriteGuard,
    isCurrentSession: isCurrentProfileSession,
    setIsLessonViewOpen,
    setIsQuizActive,
    setSelectedQuizOption,
    toDayKey: localDayKey,
  });

  const todayTask = useMemo(() => {
    const today = localDayKey(new Date());
    return currentUser?.tasks?.find(t => t.date === today);
  }, [currentUser]);

  const plateau = useMemo(() => currentUser ? detectPlateau(currentUser) : false, [currentUser]);

  const aiBadge = useMemo(() => buildAiActivityBadge(aiStatus), [aiStatus]);

  const retryMeta = useMemo(() => buildAiRetryMeta(lastAiAction, aiStatus), [aiStatus, lastAiAction]);

  const syncBadge = useMemo(() => buildCloudSyncBadge({
    hasCloudSession: Boolean(googleMe?.sub),
    state: profileSyncState,
    note: profileSyncNote,
    lastSyncAt: lastProfileSyncAt,
    stateQueue: stateQueues.find((queue) => queue.accountId === currentUser?.id),
    localSaveError: stateSaveIssues.some((issue) => issue.accountId === currentUser?.id && issue.kind === 'error'),
  }), [googleMe?.sub, currentUser?.id, lastProfileSyncAt, profileSyncNote, profileSyncState, stateQueues, stateSaveIssues]);

  const createFamilyCloudWithAchievements = useCallback(async () => {
    await createFamilyCloud();
    void checkAchievements('family_join_or_create', { familyActive: true });
  }, [checkAchievements, createFamilyCloud]);

  const joinFamilyCloudWithAchievements = useCallback(async () => {
    await joinFamilyCloud();
    void checkAchievements('family_join_or_create', { familyActive: true });
  }, [checkAchievements, joinFamilyCloud]);

  const generateFamilyMenuNowWithAchievements = useCallback(async () => {
    const menu = await generateFamilyMenuNow();
    if (menu) void checkAchievements('weekly_menu_generated', { hasWeeklyMenu: true, familyActive: true });
  }, [checkAchievements, generateFamilyMenuNow]);

  const handleGenerateFamilyWeeklyMenuWithAchievements = useCallback(async () => {
    const menu = await handleGenerateFamilyWeeklyMenu();
    if (menu) void checkAchievements('weekly_menu_generated', { hasWeeklyMenu: true, familyActive: true });
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
      onProfileDraftChange,
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
      onAccountUiCacheRestoreAllowedChange: setAllowCachedUiStateRestore,
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
      generatePlateauExplanation: handlePlateauExplanation,
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
      isCurrentSession: isCurrentAccountSession,
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
      loginGuard: loginReadGuard,
      isCurrentSession: isCurrentProfileSession,
      ShoppingListCardComponent: ShoppingListCard,
    },
    nutrition: {
      cameraOpen,
      setCameraOpen,
      cameraFacing,
      setCameraFacing,
      handlePhotoUpload,
      processPhotoFiles,
      remainingScans: remainingPhotoScans,
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
      openInsight: (item: FoodItem) => {
        if (!allowCachedUiStateRestore) return;
        setInsightModal({ id: item.id, photo: (item.photoThumb || item.photo) as string, name: item.name, insight: item.insight!, nonFood: item.nonFood === true });
      },
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
      councilError,
      councilMessages,
      canClearCouncilHistory,
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

  if (authState === 'register' && !isRegistrationSessionReady(googleMe?.sub, registrationSessionState)) {
    const status = registrationSessionState.identity === googleMe?.sub
      ? registrationSessionState.status
      : 'checking';
    const registrationSessionMessage = status === 'checking'
      ? 'Проверяем активную сессию…'
      : status === 'unavailable'
        ? 'Не удалось подтвердить активную сессию. Данные регистрации скрыты; повторите вход.'
        : 'Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.';
    return (
      <div className="min-h-[100dvh] bg-slate-950 px-4 flex items-center justify-center text-slate-200">
        <div role="status" aria-live="polite" className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm font-medium text-slate-300">
          {registrationSessionMessage}
        </div>
      </div>
    );
  }

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
        onClearPlanError={() => setPlanError(null)}
      />
    </React.Suspense>
  );

  return (
    <div className="min-h-[100dvh] md:min-h-screen md:pl-64 bg-slate-950 text-slate-100 text-left">
      {/* Purchase delivery failures must remain visible while the More dialog is closed. */}
      {allowCachedUiStateRestore && (!isFamilyWorkspaceTab || activeTab === 'shopping') && <StateStorageNotice accountId={currentUser?.id} />}
      <VersionInfoModal open={versionInfoOpen} onClose={() => setVersionInfoOpen(false)} />
      {allowCachedUiStateRestore && isScanning && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex flex-col items-center justify-center">
          <div className="w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6" />
          <p className="text-slate-100 font-black text-xl animate-pulse">Анализирую фото...</p>
        </div>
      )}
      {allowCachedUiStateRestore && paywall.isPaywallOpen && (
        <PaywallDialog
          currentPlan={paywall.plan}
          currentUser={currentUser}
          isAdmin={isAdmin}
          loginGuard={loginReadGuard}
          isCurrentSession={isCurrentProfileSession}
          onPersistUser={persistUser}
          onClose={paywall.closePaywall}
        />
      )}
      
      {allowCachedUiStateRestore && editFoodModal && (
        <FoodEditModal
          draft={editFoodModal}
          onChange={setEditFoodModal}
          onClose={() => setEditFoodModal(null)}
          onSave={async () => {
            const currentEntry = foodDiary.find((item) => item.id === editFoodModal.id);
            const patch = buildCorrectedFoodPatch(editFoodModal, currentEntry?.insight);
            const saved = await updateFoodEntry(editFoodModal.id, patch);
            if (!saved) return false;
            if (insightModal?.id === editFoodModal.id && patch.insight) {
              setInsightModal({
                ...insightModal,
                name: String(patch.name || insightModal.name),
                insight: patch.insight,
                nonFood: patch.nonFood === true,
              });
            }
            setEditFoodModal(null);
            return true;
          }}
        />
      )}

{allowCachedUiStateRestore && insightModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xl z-[250] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl animate-in zoom-in duration-300">
            <React.Suspense fallback={<div className="rounded-[2rem] bg-slate-900 border border-slate-800 p-6 text-center text-slate-500 font-medium">Загрузка разбора...</div>}>
              <FoodInsightCard
                sourceId={insightModal.id}
                currentUserId={currentUser?.id}
                loginGuard={loginReadGuard}
                isCurrentSession={isCurrentProfileSession}
                photo={insightModal.photo}
                name={insightModal.name}
                insight={insightModal.insight}
                nonFood={Boolean(insightEntry?.nonFood ?? insightModal.nonFood)}
                isPro={paywall.canUsePro}
                onEdit={insightEntry ? () => openEditFood(insightEntry) : undefined}
                onUpdateInsight={async (next, guard, isCurrent) => {
                  const sourceId = insightModal.id;
                  const saved = await updateFoodEntryGuarded(sourceId, { insight: next }, guard, isCurrent);
                  if (!saved || !isCurrent()) return false;
                  setInsightModal(previous => previous?.id === sourceId && isCurrent()
                    ? { ...previous, insight: next }
                    : previous);
                  return true;
                }}
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
        storageNotice={allowCachedUiStateRestore && isFamilyWorkspaceTab && activeTab !== 'shopping'
          ? <React.Fragment key={rootAccountSessionScope ?? 'no-account'}><StateStorageNotice accountId={currentUser?.id} /></React.Fragment>
          : undefined}
      />

      <AppWorkspace
        workspaceProps={workspaceProps}
      />
      {allowCachedUiStateRestore && activeTab === 'dashboard' && currentUser && weekly && (
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
      {allowCachedUiStateRestore && familyMenuPrefsOpen && currentUser && paywall.plan === 'family' && (
        <React.Suspense fallback={null}>
          <FamilyMenuPrefsModal
            allUsers={familyMenuProfiles}
            familyMenuPrefs={familyMenuPrefs}
            setFamilyMenuPrefs={setFamilyMenuPrefs}
            onClose={() => setFamilyMenuPrefsOpen(false)}
            onGenerate={() => handleGenerateFamilyWeeklyMenu()}
          />
        </React.Suspense>
      )}

      {allowCachedUiStateRestore && (
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
      )}
      <React.Suspense fallback={null}>
        {allowCachedUiStateRestore && isLessonViewOpen && currentLesson && (
          <LessonViewModal
            currentLesson={currentLesson}
            isQuizActive={isQuizActive}
            selectedQuizOption={selectedQuizOption}
            isSaving={isSavingLesson}
            saveError={lessonSaveError}
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
