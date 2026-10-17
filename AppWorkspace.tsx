import React from 'react';
import { Goal } from './types';
import type { AppSettings, UserProfile } from './types';
import type { OutboxReadGuard } from './storage/durableOutbox';
import type { OutboxCommitGuard } from './storage/durableOutbox';
import { ACTIVE_SESSION_CHANNEL, DurableOutbox } from './storage/durableOutbox';
import { accountSessionRenderKey } from './features/state/accountScopedUi';

const DashboardScreen = React.lazy(() => import('./DashboardScreen'));
const PlanScreen = React.lazy(() => import('./PlanScreen'));
const NutritionScreen = React.lazy(() => import('./NutritionScreen'));
const RecipesScreen = React.lazy(() => import('./RecipesScreen'));
const WorkoutsScreen = React.lazy(() => import('./WorkoutsScreen'));
const FamilyScreen = React.lazy(() => import('./FamilyScreen'));
const CouncilScreen = React.lazy(() => import('./CouncilScreen'));
const ProScreen = React.lazy(() => import('./ProScreen'));
const CourseScreen = React.lazy(() => import('./CourseScreen'));
const ProgressScreen = React.lazy(() => import('./ProgressScreen'));
const ProgressArchiveScreen = React.lazy(() => import('./ProgressArchiveScreen'));
const AdminScreen = React.lazy(() => import('./AdminScreen'));
const SettingsScreen = React.lazy(() => import('./SettingsScreen'));
const SupportScreen = React.lazy(() => import('./SupportScreen'));
const GuideScreen = React.lazy(() => import('./GuideScreen'));
const ChangelogScreen = React.lazy(() => import('./ChangelogScreen'));
const PrivacyScreen = React.lazy(() => import('./PrivacyScreen'));

type AppWorkspaceProps = {
  workspaceProps: AppWorkspaceData;
};

type PassThroughProp = unknown;

type AppWorkspaceData = {
  meta: {
    activeTab: string;
    isAdmin: boolean;
    currentUser: UserProfile | null;
    paywall: {
      plan: string;
      canUsePro: boolean;
      openPaywall: () => void;
    };
    setActiveTab: (tab: string) => void;
    googleMe: { sub?: string } | null;
    logout: () => Promise<void> | void;
    deleteAccount: () => Promise<void> | void;
    persistUser?: (user: UserProfile, guard?: OutboxCommitGuard) => Promise<unknown> | void;
    patchProfileInCloud?: (patch: Partial<UserProfile>) => Promise<boolean | void> | boolean | void;
    onProfileDraftChange?: (dirty: boolean) => void;
    onExportBackup?: () => void;
    onImportBackup?: (file: File) => void;
    onConnectAutosave?: () => Promise<boolean>;
    autosaveEnabled?: boolean;
    profileSyncState?: PassThroughProp;
    profileSyncNote?: string | null;
    lastProfileSyncAt?: number | null;
    syncAllLocalDataNow?: () => Promise<void> | void;
    reloadUserFromCloud?: () => Promise<void> | void;
    resetUiState?: () => void;
    onAccountUiCacheRestoreAllowedChange?: (allowed: boolean) => void;
    aiBadge: PassThroughProp;
    retryMeta: PassThroughProp;
  };
  dashboard: Record<string, PassThroughProp>;
  plan: Record<string, PassThroughProp> & {
    currentUserGoal?: Goal;
    loginGuard: OutboxReadGuard | null;
    isCurrentSession: () => boolean;
  };
  nutrition: Record<string, PassThroughProp>;
  progress: Record<string, PassThroughProp> & {
    onPatchUser?: (patch: Partial<UserProfile>) => Promise<boolean | void> | boolean | void;
    syncState?: PassThroughProp;
    isCurrentSession: () => boolean | Promise<boolean>;
  };
  family: Record<string, PassThroughProp>;
  council: Record<string, PassThroughProp> & { councilError?: string | null };
  content: Record<string, PassThroughProp> & {
    settings: AppSettings;
    setSettings: (next: AppSettings) => void;
  };
};

export default function AppWorkspace({ workspaceProps }: AppWorkspaceProps) {
  const { meta, dashboard, plan, nutrition, progress, family, council, content } = workspaceProps;

  const { activeTab, isAdmin, currentUser, paywall, setActiveTab, googleMe, logout, deleteAccount, persistUser, patchProfileInCloud, onProfileDraftChange, onExportBackup, onImportBackup, onConnectAutosave, autosaveEnabled, profileSyncState, profileSyncNote, lastProfileSyncAt, syncAllLocalDataNow, reloadUserFromCloud, resetUiState, onAccountUiCacheRestoreAllowedChange, aiBadge, retryMeta } = meta;

  const { dailyStats, targets, weightHistory, dailyHabits, weightTrend, currentWeight, handleToggleHabit, exportShortPdf, exportDetailedPdf, pdfIncludeMealLog, setPdfIncludeMealLog, newWeight, setNewWeight, logWeight, plateau, adaptationIndex, adaptationStatus, compliancePct, deltaDays, weightDeltaN, refeedSuggestion, refeedDate, scheduleRefeedTomorrow, expectedN, adaptLoading, generatePlateauExplanation, adaptNote, adaptExpanded, setAdaptExpanded, adaptRead, setAdaptRead, weekly, weeklyReports, exportWeeklyPDF, onShareWisCard, shareWisState, shareWisMessage, achievementsEnabled, achievementsCatalog, achievementsUnlocked, achievementsNewlyUnlocked, achievementsLoading, dismissAchievementToast } = dashboard;

  const { planTaskDone, setPlanTaskDone, setPlanIntroOpen, setPlanRulesExpanded, planRulesExpanded, planWeekExpanded, setPlanWeekExpanded, weeklyMenuLoading, handleGenerateWeeklyMenu, weeklyMenuError, currentUserAiPlan, currentUserTargetWeight, formatGramsPretty, MealParts, cloudFamily, planScope, setPlanScope, familyShoppingLoading, familyShopping, toggleFamilyShoppingItem, loadFamilyShopping, familyMenuError, familyMenu, familyMenuLoading, setFamilyMenuPrefsOpen, handleGenerateFamilyWeeklyMenu, paywallPlan, allUsers, currentUserGoal = Goal.MAINTAIN, DEFAULT_DEFICIT, DEFAULT_SURPLUS, loginGuard, isCurrentSession, ShoppingListCardComponent } = plan;

  const { cameraOpen, setCameraOpen, cameraFacing, setCameraFacing, handlePhotoUpload, processPhotoFiles, remainingScans, searchQuery, setSearchQuery, showSearchResults, setShowSearchResults, searchResults, addFoodToDiary, foodDiary, selectedFoodIds, toggleFoodSelected, bulkUpdateMealType, bulkRemoveSelectedFoods, deleteFoodEntry, deleteFoodPhoto, openInsight, openEditFood, formatTime, mealTypeLabel, MacroBarComponent, FoodDiaryGroupedComponent, onDiaryDayChange } = nutrition;

  const { favoriteRecipes, addFavoriteRecipe, removeFavoriteRecipe, clearFavoriteRecipes } = content;
  const { measurementsHistory, progressPhotos, wearableProvider, wearableEnabled, wearableConnectedAt, wearableLastSyncAt, wearableStepsToday, wearableActiveMinutesToday, wearableSleepHoursLastNight, wearableMetricsDayKey, wearableMetricsUpdatedAt, onPatchUser, syncState, isCurrentSession: isCurrentAccountSession } = progress;
  const { cloudFamilyMembers, cloudFamilyLoading, cloudFamilyError, setCloudFamilyError, familyInviteCode, familyJoinCode, familyNameDraft, setFamilyJoinCode, setFamilyNameDraft, loadCloudFamily, createFamilyCloud, joinFamilyCloud, makeInviteCode, generateFamilyMenuNow, updateMyFamilyGoal } = family;
  const { councilInput, setCouncilInput, councilLoading, councilStage, councilError, councilMessages, expandedCouncilThoughtIds, setExpandedCouncilThoughtIds, councilScrollRef, handleCouncilSubmit, clearCouncilHistory } = council;
  const { courseLibrary, lessons, setCurrentLesson, setIsLessonViewOpen, settings, setSettings, closeLessonView, handleMarkLessonRead, handleStartLessonQuiz } = content;
  // Ephemeral screen drafts belong to the active IndexedDB session. The login guard
  // captured by this tab can become stale when another tab accepts a new session.
  const [durableSessionKey, setDurableSessionKey] = React.useState('checking');
  const [durableSessionAccountId, setDurableSessionAccountId] = React.useState<string | null>(null);
  React.useEffect(() => {
    const outbox = new DurableOutbox();
    let disposed = false;
    let checking = false;
    const refreshSessionKey = () => {
      if (checking) return;
      checking = true;
      void outbox.sessionState()
        .then(({ active }) => {
          if (disposed) return;
          setDurableSessionAccountId(active?.accountId ?? null);
          // A sender pause advances authFence; it does not change the owner of local UI state.
          const next = JSON.stringify([
            active?.accountId ?? null,
            active?.serverSessionId ?? null,
            active?.sessionEpoch ?? null,
          ]);
          setDurableSessionKey(previous => previous === next ? previous : next);
        })
        .catch(() => {
          if (!disposed) {
            setDurableSessionAccountId(null);
            setDurableSessionKey('unavailable');
          }
        })
        .finally(() => { checking = false; });
    };
    refreshSessionKey();
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(ACTIVE_SESSION_CHANNEL);
    } catch {
      // The interval and focus listeners remain as a fallback when channels are unavailable.
    }
    channel?.addEventListener('message', refreshSessionKey);
    const interval = window.setInterval(refreshSessionKey, 2_000);
    const refreshWhenVisible = () => { if (!document.hidden) refreshSessionKey(); };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      channel?.removeEventListener('message', refreshSessionKey);
      channel?.close();
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);
  // A second tab can change IndexedDB's active session without changing this tab's React props.
  const screenSessionKey = `${accountSessionRenderKey(loginGuard, currentUser?.id)}:${durableSessionKey}`;
  const activeSessionIdentityMatchesLoginGuard = loginGuard
    ? durableSessionKey === JSON.stringify([
      loginGuard.accountId,
      loginGuard.serverSessionId,
      loginGuard.sessionEpoch,
    ])
    : durableSessionAccountId === null
      ? !currentUser?.id
      : durableSessionAccountId === currentUser?.id;
  const allowCachedAccountUiStateRestore = durableSessionKey !== 'checking'
    && durableSessionKey !== 'unavailable'
    && (!loginGuard || loginGuard.accountId === currentUser?.id)
    && activeSessionIdentityMatchesLoginGuard;
  const canRenderActiveTab = allowCachedAccountUiStateRestore
    || activeTab === 'guide'
    || activeTab === 'privacy'
    || activeTab === 'updates';
  const accountSessionMessage = durableSessionKey === 'checking'
    ? 'Проверяем активную сессию…'
    : durableSessionKey === 'unavailable'
      ? 'Не удалось подтвердить активную сессию. Данные аккаунта скрыты; повторите вход.'
      : 'Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.';
  React.useLayoutEffect(() => {
    onAccountUiCacheRestoreAllowedChange?.(allowCachedAccountUiStateRestore);
  }, [allowCachedAccountUiStateRestore, onAccountUiCacheRestoreAllowedChange]);

  return (
    <main className="w-full max-w-[1600px] 2xl:max-w-[1800px] mx-auto p-4 md:p-10 xl:p-12 space-y-10" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
      {!canRenderActiveTab ? (
        <div role="status" aria-live="polite" className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm font-medium text-slate-300">
          {accountSessionMessage}
        </div>
      ) : (
        <>
      {activeTab === 'dashboard' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка dashboard...</div>}>
          <DashboardScreen
            key={screenSessionKey}
            currentUser={currentUser}
            paywallPlan={paywall.plan}
            canUsePro={paywall.canUsePro}
            dailyStats={dailyStats}
            targets={targets}
            weightHistory={weightHistory}
            measurementsHistory={progress.measurementsHistory}
            progressPhotos={progress.progressPhotos}
            dailyHabits={dailyHabits}
            weightTrend={weightTrend}
            currentWeight={currentWeight}
            handleToggleHabit={handleToggleHabit}
            exportShortPdf={exportShortPdf}
            exportDetailedPdf={exportDetailedPdf}
            pdfIncludeMealLog={pdfIncludeMealLog}
            setPdfIncludeMealLog={setPdfIncludeMealLog}
            newWeight={newWeight}
            setNewWeight={setNewWeight}
            logWeight={logWeight}
            plateau={!!plateau}
            adaptationIndex={adaptationIndex}
            adaptationStatus={adaptationStatus}
            compliancePct={compliancePct}
            deltaDays={deltaDays}
            weightDeltaN={weightDeltaN}
            refeedSuggestion={refeedSuggestion}
            refeedDate={refeedDate}
            scheduleRefeedTomorrow={scheduleRefeedTomorrow}
            expectedN={expectedN}
            adaptLoading={adaptLoading}
            generatePlateauExplanation={generatePlateauExplanation}
            adaptNote={adaptNote}
            adaptExpanded={adaptExpanded}
            setAdaptExpanded={setAdaptExpanded}
            adaptRead={adaptRead}
            setAdaptRead={setAdaptRead}
            weekly={weekly}
            weeklyReports={allowCachedAccountUiStateRestore ? weeklyReports : []}
            exportWeeklyPDF={exportWeeklyPDF}
            onShareWisCard={onShareWisCard}
            shareWisState={shareWisState}
            shareWisMessage={shareWisMessage}
            achievementsEnabled={achievementsEnabled}
            achievementsCatalog={achievementsCatalog}
            achievementsUnlocked={achievementsUnlocked}
            achievementsNewlyUnlocked={achievementsNewlyUnlocked}
            achievementsLoading={achievementsLoading}
            onDismissAchievementToast={dismissAchievementToast}
            onOpenProgress={() => setActiveTab('progress')}
          />
        </React.Suspense>
      )}
      {activeTab === 'plan' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка плана...</div>}>
          <PlanScreen
            key={screenSessionKey}
            currentUser={currentUser}
            allowCachedUiStateRestore={allowCachedAccountUiStateRestore}
            planTaskDone={planTaskDone}
            setPlanTaskDone={setPlanTaskDone}
            setActiveTab={setActiveTab}
            setPlanIntroOpen={setPlanIntroOpen}
            setPlanRulesExpanded={setPlanRulesExpanded}
            planRulesExpanded={planRulesExpanded}
            planWeekExpanded={planWeekExpanded}
            setPlanWeekExpanded={setPlanWeekExpanded}
            weeklyMenuLoading={weeklyMenuLoading}
            handleGenerateWeeklyMenu={handleGenerateWeeklyMenu}
            weeklyMenuError={weeklyMenuError}
            currentUserAiPlan={currentUserAiPlan}
            currentUserTargetWeight={currentUserTargetWeight}
            formatGramsPretty={formatGramsPretty}
            MealParts={MealParts}
            cloudFamily={cloudFamily}
            planScope={planScope}
            setPlanScope={setPlanScope}
            familyShoppingLoading={familyShoppingLoading}
            familyShopping={familyShopping}
            toggleFamilyShoppingItem={toggleFamilyShoppingItem}
            loadFamilyShopping={loadFamilyShopping}
            familyMenuError={familyMenuError}
            familyMenu={familyMenu}
            familyMenuLoading={familyMenuLoading}
            setFamilyMenuPrefsOpen={setFamilyMenuPrefsOpen}
            handleGenerateFamilyWeeklyMenu={handleGenerateFamilyWeeklyMenu}
            paywallPlan={paywallPlan}
            allUsers={allUsers}
            currentUserGoal={currentUserGoal}
            DEFAULT_DEFICIT={DEFAULT_DEFICIT}
            DEFAULT_SURPLUS={DEFAULT_SURPLUS}
            loginGuard={loginGuard}
            isCurrentSession={isCurrentSession}
            ShoppingListCardComponent={ShoppingListCardComponent}
          />
        </React.Suspense>
      )}
      {activeTab === 'progress' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка прогресса...</div>}>
          <ProgressScreen
            key={screenSessionKey}
            currentUser={currentUser}
            allowCachedUiStateRestore={allowCachedAccountUiStateRestore}
            isCurrentSession={isCurrentAccountSession}
            weightHistory={weightHistory}
            measurementsHistory={measurementsHistory}
            progressPhotos={progressPhotos}
            currentWeight={currentWeight}
            targetWeight={currentUser?.targetWeight ?? null}
            wearableProvider={wearableProvider}
            wearableEnabled={wearableEnabled}
            wearableConnectedAt={wearableConnectedAt}
            wearableLastSyncAt={wearableLastSyncAt}
            wearableStepsToday={wearableStepsToday}
            wearableActiveMinutesToday={wearableActiveMinutesToday}
            wearableSleepHoursLastNight={wearableSleepHoursLastNight}
            wearableMetricsDayKey={wearableMetricsDayKey}
            wearableMetricsUpdatedAt={wearableMetricsUpdatedAt}
            onPatchUser={onPatchUser}
            syncState={syncState}
            lastProfileSyncAt={lastProfileSyncAt}
            onSyncNow={syncAllLocalDataNow}
            onOpenArchive={() => setActiveTab('progress-archive')}
            onOpenSettings={() => setActiveTab('settings')}
          />
        </React.Suspense>
      )}
      {activeTab === 'progress-archive' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка архива прогресса...</div>}>
          <ProgressArchiveScreen
            key={screenSessionKey}
            currentUser={currentUser}
            allowCachedUiStateRestore={allowCachedAccountUiStateRestore}
            isCurrentSession={isCurrentAccountSession}
            weightHistory={weightHistory}
            measurementsHistory={measurementsHistory}
            progressPhotos={progressPhotos}
            currentWeight={currentWeight}
            wearableProvider={wearableProvider}
            wearableEnabled={wearableEnabled}
            wearableLastSyncAt={wearableLastSyncAt}
            wearableMetricsDayKey={wearableMetricsDayKey}
            wearableMetricsUpdatedAt={wearableMetricsUpdatedAt}
            onOpenSettings={() => setActiveTab('settings')}
            onOpenProgress={() => setActiveTab('progress')}
          />
        </React.Suspense>
      )}
      {activeTab === 'nutrition' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка анализа еды...</div>}>
          <NutritionScreen
            key={screenSessionKey}
            cameraOpen={cameraOpen}
            setCameraOpen={setCameraOpen}
            cameraFacing={cameraFacing}
            setCameraFacing={setCameraFacing}
            handlePhotoUpload={handlePhotoUpload}
            processPhotoFiles={processPhotoFiles}
            remainingScans={remainingScans}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            showSearchResults={showSearchResults}
            setShowSearchResults={setShowSearchResults}
            searchResults={searchResults}
            addFoodToDiary={addFoodToDiary}
            foodDiary={foodDiary}
            selectedFoodIds={selectedFoodIds}
            toggleFoodSelected={toggleFoodSelected}
            bulkUpdateMealType={bulkUpdateMealType}
            bulkRemoveSelectedFoods={bulkRemoveSelectedFoods}
            deleteFoodEntry={deleteFoodEntry}
            deleteFoodPhoto={deleteFoodPhoto}
            openInsight={openInsight}
            openEditFood={openEditFood}
            formatTime={formatTime}
            mealTypeLabel={mealTypeLabel}
            dailyStats={nutrition.selectedDiaryStats ?? dailyStats}
            activeDiaryDayKey={nutrition.activeDiaryDayKey}
            activeDiaryDayLabel={nutrition.activeDiaryDayLabel}
            onDiaryDayChange={onDiaryDayChange}
            targets={targets}
            MacroBarComponent={MacroBarComponent}
            FoodDiaryGroupedComponent={FoodDiaryGroupedComponent}
          />
        </React.Suspense>
      )}
      {activeTab === 'recipes' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка рецептов...</div>}>
          <RecipesScreen
            key={screenSessionKey}
            userId={currentUser?.id}
            loginGuard={loginGuard}
            isCurrentSession={isCurrentSession}
            recipes={favoriteRecipes}
            onAdd={addFavoriteRecipe}
            onRemove={removeFavoriteRecipe}
            onClear={clearFavoriteRecipes}
          />
        </React.Suspense>
      )}
      {activeTab === 'workouts' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка тренировок...</div>}>
          <WorkoutsScreen />
        </React.Suspense>
      )}
      {activeTab === 'family' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка семьи...</div>}>
          <FamilyScreen
            key={screenSessionKey}
            cloudFamily={cloudFamily}
            cloudFamilyMembers={cloudFamilyMembers}
            cloudFamilyLoading={cloudFamilyLoading}
            cloudFamilyError={cloudFamilyError}
            setCloudFamilyError={setCloudFamilyError}
            familyInviteCode={familyInviteCode}
            familyJoinCode={familyJoinCode}
            familyNameDraft={familyNameDraft}
            setFamilyJoinCode={setFamilyJoinCode}
            setFamilyNameDraft={setFamilyNameDraft}
            loadCloudFamily={loadCloudFamily}
            createFamilyCloud={createFamilyCloud}
            joinFamilyCloud={joinFamilyCloud}
            makeInviteCode={makeInviteCode}
            generateFamilyMenuNow={generateFamilyMenuNow}
            updateMyFamilyGoal={updateMyFamilyGoal}
            loadFamilyShopping={loadFamilyShopping}
            familyShoppingLoading={familyShoppingLoading}
            familyShopping={familyShopping}
            toggleFamilyShoppingItem={toggleFamilyShoppingItem}
            formatGramsPretty={formatGramsPretty}
          />
        </React.Suspense>
      )}
      {activeTab === 'council' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка AI Совета...</div>}>
          <CouncilScreen
            key={screenSessionKey}
            councilInput={councilInput}
            setCouncilInput={setCouncilInput}
            councilLoading={councilLoading}
            councilStage={councilStage}
            councilError={councilError}
            councilMessages={councilMessages}
            expandedCouncilThoughtIds={expandedCouncilThoughtIds}
            setExpandedCouncilThoughtIds={setExpandedCouncilThoughtIds}
            councilScrollRef={councilScrollRef}
            handleCouncilSubmit={handleCouncilSubmit}
            onClearHistory={clearCouncilHistory}
          />
        </React.Suspense>
      )}
      {activeTab === 'pro' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка Pro...</div>}>
          <ProScreen openPaywall={paywall.openPaywall} />
        </React.Suspense>
      )}
      {activeTab === 'course' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка курса...</div>}>
          <CourseScreen
            key={screenSessionKey}
            currentUser={currentUser}
            courseLibrary={courseLibrary}
            lessons={lessons}
            setCurrentLesson={setCurrentLesson}
            setIsLessonViewOpen={setIsLessonViewOpen}
          />
        </React.Suspense>
      )}
      {activeTab === 'admin' && isAdmin && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка админ-панели...</div>}>
          <AdminScreen
            key={screenSessionKey}
            loginGuard={loginGuard}
            isCurrentSession={isCurrentSession}
          />
        </React.Suspense>
      )}
      {activeTab === 'support' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка поддержки...</div>}>
          <SupportScreen
            key={screenSessionKey}
            currentUser={currentUser}
            loginGuard={loginGuard}
            isCurrentSession={isCurrentSession}
          />
        </React.Suspense>
      )}
      {activeTab === 'guide' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка инструкции...</div>}>
          <GuideScreen />
        </React.Suspense>
      )}
      {activeTab === 'privacy' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка политики конфиденциальности...</div>}>
          <PrivacyScreen />
        </React.Suspense>
      )}
      {activeTab === 'updates' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка изменений версии...</div>}>
          <ChangelogScreen />
        </React.Suspense>
      )}
      {activeTab === 'settings' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка настроек...</div>}>
          <SettingsScreen
            key={screenSessionKey}
            allowCachedProfileDraftRestore={allowCachedAccountUiStateRestore}
            settings={settings}
            onChange={setSettings}
            serverSession={!!googleMe?.sub}
            loginGuard={loginGuard}
            isCurrentSession={isCurrentSession}
            onServerLogout={logout}
            onDeleteAccount={deleteAccount}
            user={currentUser}
            onChangeUser={async (u: UserProfile, guard?: OutboxCommitGuard) => { await persistUser?.(u, guard); }}
            onPatchUser={(patch: Partial<UserProfile>) => patchProfileInCloud?.(patch)}
            onProfileDraftChange={onProfileDraftChange}
            onExportBackup={onExportBackup}
            onImportBackup={onImportBackup}
            onConnectAutosave={onConnectAutosave}
            autosaveEnabled={autosaveEnabled}
            syncState={profileSyncState}
            syncNote={profileSyncNote}
            lastProfileSyncAt={lastProfileSyncAt}
            onSyncNow={syncAllLocalDataNow}
            onReloadFromCloud={reloadUserFromCloud}
            onResetUiState={resetUiState}
          />
        </React.Suspense>
      )}
        </>
      )}
    </main>
  );
}
