import React from 'react';
import { Goal } from './types';

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

type AppWorkspaceProps = {
  workspaceProps: any;
};

export default function AppWorkspace({ workspaceProps }: AppWorkspaceProps) {
  const { meta, dashboard, plan, nutrition, progress, family, council, content } = workspaceProps;

  const { activeTab, isAdmin, currentUser, paywall, setActiveTab, googleMe, logout, deleteAccount, persistUser, patchProfileInCloud, onExportBackup, onImportBackup, onConnectAutosave, autosaveEnabled, profileSyncState, lastProfileSyncAt, syncAllLocalDataNow, reloadUserFromCloud, resetUiState, aiBadge, retryMeta } = meta;

  const { dailyStats, targets, weightHistory, dailyHabits, weightTrend, currentWeight, handleToggleHabit, exportShortPdf, exportDetailedPdf, pdfIncludeMealLog, setPdfIncludeMealLog, newWeight, setNewWeight, logWeight, plateau, adaptationIndex, adaptationStatus, compliancePct, deltaDays, weightDeltaN, refeedSuggestion, refeedDate, scheduleRefeedTomorrow, expectedN, adaptLoading, setAdaptLoading, setLastAiAction, generatePlateauExplanation, adaptNote, setAdaptNote, adaptExpanded, setAdaptExpanded, adaptRead, setAdaptRead, weekly, weeklyReports, exportWeeklyPDF, onShareWisCard, shareWisState, shareWisMessage } = dashboard;

  const { planTaskDone, setPlanTaskDone, setPlanIntroOpen, setPlanRulesExpanded, planRulesExpanded, planWeekExpanded, setPlanWeekExpanded, weeklyMenuLoading, handleGenerateWeeklyMenu, weeklyMenuError, currentUserAiPlan, currentUserTargetWeight, formatGramsPretty, MealParts, cloudFamily, planScope, setPlanScope, familyShoppingLoading, familyShopping, toggleFamilyShoppingItem, loadFamilyShopping, familyMenuError, familyMenu, familyMenuLoading, setFamilyMenuPrefsOpen, handleGenerateFamilyWeeklyMenu, paywallPlan, allUsers, currentUserGoal = Goal.MAINTAIN, DEFAULT_DEFICIT, DEFAULT_SURPLUS, ShoppingListCardComponent } = plan;

  const { cameraOpen, setCameraOpen, cameraFacing, setCameraFacing, handlePhotoUpload, processPhotoFiles, remainingScans, searchQuery, setSearchQuery, showSearchResults, setShowSearchResults, searchResults, addFoodToDiary, foodDiary, selectedFoodIds, toggleFoodSelected, bulkUpdateMealType, bulkRemoveSelectedFoods, deleteFoodEntry, deleteFoodPhoto, openInsight, openEditFood, formatTime, mealTypeLabel, MacroBarComponent, FoodDiaryGroupedComponent, onDiaryDayChange } = nutrition;

  const { favoriteRecipes, addFavoriteRecipe, removeFavoriteRecipe, clearFavoriteRecipes } = content;
  const { measurementsHistory, progressPhotos, wearableProvider, wearableEnabled, wearableConnectedAt, wearableLastSyncAt, wearableStepsToday, wearableActiveMinutesToday, wearableSleepHoursLastNight, wearableMetricsUpdatedAt, onPatchUser, syncState } = progress;
  const { cloudFamilyMembers, cloudFamilyLoading, cloudFamilyError, setCloudFamilyError, familyInviteCode, familyJoinCode, familyNameDraft, setFamilyJoinCode, setFamilyNameDraft, loadCloudFamily, createFamilyCloud, joinFamilyCloud, makeInviteCode, generateFamilyMenuNow, updateMyFamilyGoal } = family;
  const { councilInput, setCouncilInput, councilLoading, councilStage, councilMessages, expandedCouncilThoughtIds, setExpandedCouncilThoughtIds, councilScrollRef, handleCouncilSubmit, clearCouncilHistory } = council;
  const { courseLibrary, lessons, setCurrentLesson, setIsLessonViewOpen, settings, setSettings, closeLessonView, handleMarkLessonRead, handleStartLessonQuiz } = content;

  return (
    <main className="w-full max-w-[1600px] 2xl:max-w-[1800px] mx-auto p-4 md:p-10 xl:p-12 space-y-10" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
      {activeTab === 'dashboard' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка dashboard...</div>}>
          <DashboardScreen
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
            setAdaptLoading={setAdaptLoading}
            setLastAiAction={setLastAiAction}
            generatePlateauExplanation={generatePlateauExplanation}
            adaptNote={adaptNote}
            setAdaptNote={setAdaptNote}
            adaptExpanded={adaptExpanded}
            setAdaptExpanded={setAdaptExpanded}
            adaptRead={adaptRead}
            setAdaptRead={setAdaptRead}
            weekly={weekly}
            weeklyReports={weeklyReports}
            exportWeeklyPDF={exportWeeklyPDF}
            onShareWisCard={onShareWisCard}
            shareWisState={shareWisState}
            shareWisMessage={shareWisMessage}
            onOpenProgress={() => setActiveTab('progress')}
          />
        </React.Suspense>
      )}
      {activeTab === 'plan' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка плана...</div>}>
          <PlanScreen
            currentUser={currentUser}
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
            ShoppingListCardComponent={ShoppingListCardComponent}
          />
        </React.Suspense>
      )}
      {activeTab === 'progress' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка прогресса...</div>}>
          <ProgressScreen
            currentUser={currentUser}
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
            currentUser={currentUser}
            weightHistory={weightHistory}
            measurementsHistory={measurementsHistory}
            progressPhotos={progressPhotos}
            currentWeight={currentWeight}
            wearableProvider={wearableProvider}
            wearableEnabled={wearableEnabled}
            wearableLastSyncAt={wearableLastSyncAt}
            wearableMetricsUpdatedAt={wearableMetricsUpdatedAt}
            onOpenSettings={() => setActiveTab('settings')}
            onOpenProgress={() => setActiveTab('progress')}
          />
        </React.Suspense>
      )}
      {activeTab === 'nutrition' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка анализа еды...</div>}>
          <NutritionScreen
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
          <RecipesScreen recipes={favoriteRecipes} onAdd={addFavoriteRecipe} onRemove={removeFavoriteRecipe} onClear={clearFavoriteRecipes} />
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
            councilInput={councilInput}
            setCouncilInput={setCouncilInput}
            councilLoading={councilLoading}
            councilStage={councilStage}
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
          <AdminScreen />
        </React.Suspense>
      )}
      {activeTab === 'support' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка поддержки...</div>}>
          <SupportScreen currentUser={currentUser} />
        </React.Suspense>
      )}
      {activeTab === 'guide' && (
        <React.Suspense fallback={<div className="py-16 text-center text-slate-500 font-medium">Загрузка инструкции...</div>}>
          <GuideScreen />
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
            settings={settings}
            onChange={setSettings}
            serverSession={!!googleMe?.sub}
            onServerLogout={logout}
            onDeleteAccount={deleteAccount}
            user={currentUser}
            onChangeUser={(u: any) => u && persistUser?.(u)}
            onPatchUser={(patch: any) => void patchProfileInCloud?.(patch)}
            onExportBackup={onExportBackup}
            onImportBackup={onImportBackup}
            onConnectAutosave={onConnectAutosave}
            autosaveEnabled={autosaveEnabled}
            syncState={profileSyncState}
            lastProfileSyncAt={lastProfileSyncAt}
            onSyncNow={syncAllLocalDataNow}
            onReloadFromCloud={reloadUserFromCloud}
            onResetUiState={resetUiState}
          />
        </React.Suspense>
      )}
    </main>
  );
}
