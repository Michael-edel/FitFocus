import React from 'react';
import { Camera, Plus, Search, Utensils } from 'lucide-react';
import type { FoodEntry, FoodItem, MealType } from './types';
import type { FastLogItem } from './storage/foodDiary';
import type { MacroBarProps } from './components/MacroBar';
import type { FoodDiaryGroupedProps } from './FoodDiaryGrouped';
import { StateStorageNotice } from './ui/StateStorageNotice';

const CameraCapture = React.lazy(() => import('./ui/components/CameraCapture'));

type SearchResult = FastLogItem;

type NutritionScreenProps = {
  accountId?: string;
  cameraOpen: boolean;
  setCameraOpen: (open: boolean) => void;
  cameraFacing: 'user' | 'environment';
  setCameraFacing: React.Dispatch<React.SetStateAction<'user' | 'environment'>>;
  handlePhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  processPhotoFiles: (files: File[]) => Promise<void>;
  remainingScans: number;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  showSearchResults: boolean;
  setShowSearchResults: (value: boolean) => void;
  searchResults: SearchResult[];
  addFoodToDiary: (item: FastLogItem) => Promise<FoodItem | undefined>;
  onAddManualFood: () => void;
  foodDiary: FoodItem[];
  selectedFoodIds: ReadonlySet<string>;
  toggleFoodSelected: (id: string) => void;
  bulkUpdateMealType: (mealType: MealType) => void;
  bulkRemoveSelectedFoods: () => void;
  deleteFoodEntry: (id: string) => void;
  deleteFoodPhoto: (id: string) => void;
  openInsight: (item: FoodItem) => void;
  openEditFood: (item: FoodEntry) => void;
  formatTime: (tsIso: string) => string;
  mealTypeLabel: (mealType: MealType) => string;
  dailyStats: { calories: number; protein: number; fat: number; carbs: number };
  activeDiaryDayKey?: string;
  activeDiaryDayLabel?: string;
  onDiaryDayChange?: (dayKey: string) => void;
  targets: { calories: number; protein: number; fat: number; carbs: number };
  MacroBarComponent: React.ComponentType<MacroBarProps>;
  FoodDiaryGroupedComponent: React.ComponentType<FoodDiaryGroupedProps>;
};

export default function NutritionScreen({
  accountId,
  cameraOpen,
  setCameraOpen,
  cameraFacing,
  setCameraFacing,
  handlePhotoUpload,
  processPhotoFiles,
  searchQuery,
  setSearchQuery,
  showSearchResults,
  setShowSearchResults,
  searchResults,
  addFoodToDiary,
  onAddManualFood,
  foodDiary,
  selectedFoodIds,
  toggleFoodSelected,
  bulkUpdateMealType,
  bulkRemoveSelectedFoods,
  deleteFoodEntry,
  deleteFoodPhoto,
  openInsight,
  openEditFood,
  formatTime,
  mealTypeLabel,
  dailyStats,
  activeDiaryDayKey,
  activeDiaryDayLabel,
  onDiaryDayChange,
  targets,
  remainingScans,
  MacroBarComponent,
  FoodDiaryGroupedComponent,
}: NutritionScreenProps) {
  const [foodCommitBusy, setFoodCommitBusy] = React.useState(false);
  const [foodCommitError, setFoodCommitError] = React.useState<string | null>(null);
  const useNativeCameraCapture =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const addSearchResult = async (result: SearchResult) => {
    if (foodCommitBusy) return;
    setFoodCommitBusy(true);
    setFoodCommitError(null);
    try {
      const saved = await addFoodToDiary(result);
      if (!saved) {
        setFoodCommitError('Не удалось сохранить запись в дневнике. Повторите попытку.');
        return;
      }
      setSearchQuery('');
      setShowSearchResults(false);
    } catch {
      setFoodCommitError('Не удалось сохранить запись в дневнике. Повторите попытку.');
    } finally {
      setFoodCommitBusy(false);
    }
  };

  return (
    <div className="min-w-0 space-y-6 animate-in slide-in-from-bottom-6 duration-700">
      <header className="flex flex-col desktop-nav:flex-row desktop-nav:flex-wrap desktop-nav:items-end justify-between gap-4">
        <div className="text-left">
          <h1 className="text-3xl leading-tight md:text-4xl font-black text-slate-100 mb-1">Анализ еды</h1>
          <p className="text-slate-400 font-medium">Оцените блюдо по фото или добавьте его вручную.</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Осталось сегодня</p>
            <p className="text-base font-bold text-indigo-300 tabular-nums">{remainingScans === Infinity ? 'Без лимита' : `Сканов: ${remainingScans}`}</p>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-2 items-stretch gap-2 sm:flex sm:flex-none">
            {useNativeCameraCapture ? (
              <label className="flex min-h-12 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-2.5 py-2 text-sm font-bold text-white hover:bg-indigo-700 sm:px-4">
                <Camera size={18} className="shrink-0" /><span>Снять</span>
                <input type="file" accept="image/*" capture={cameraFacing} className="hidden" onChange={handlePhotoUpload} />
              </label>
            ) : (
              <button type="button" onClick={() => setCameraOpen(true)} className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-2.5 py-2 text-sm font-bold text-white hover:bg-indigo-700 sm:px-4">
                <Camera size={18} className="shrink-0" /><span>Снять</span>
              </button>
            )}
            <label title="Можно выбрать несколько фото" className="flex min-h-12 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-800 px-2.5 py-2 text-sm font-bold text-slate-100 hover:bg-slate-700 sm:px-4">
              <Plus size={18} className="shrink-0" /><span>Загрузить</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
            </label>
          </div>
        </div>
      </header>
      <button type="button" onClick={onAddManualFood} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-100">
        <Plus size={20} /> Добавить вручную
      </button>
      <StateStorageNotice accountId={accountId} reserveSpace={false} />

      <React.Suspense fallback={null}>
        <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCaptured={(file) => processPhotoFiles([file])} facing={cameraFacing} onFacingChange={setCameraFacing} />
      </React.Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-6">
          <div className="relative group">
            <Search className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={22} />
            <input
              type="text"
              placeholder="Поиск блюда в истории..."
              className="w-full pl-14 md:pl-16 pr-5 md:pr-6 py-5 md:py-6 bg-slate-900 border border-slate-800 rounded-[2rem] md:rounded-[2.5rem] shadow-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-slate-100 placeholder:text-slate-700"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSearchResults(true)}
            />
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-4 bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-800 z-20 overflow-hidden animate-in fade-in slide-in-from-top-4">
                {searchResults.map((res, i) => (
                  <div
                    key={i}
                    onClick={() => void addSearchResult(res)}
                    aria-disabled={foodCommitBusy}
                    className={`w-full px-8 py-5 flex items-center justify-between hover:bg-slate-800 text-left border-b border-slate-800 last:border-0 group ${foodCommitBusy ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <span className="font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">{res.name}</span>
                    <span className="text-sm font-black text-slate-600 tabular-nums">{res.calories} ккал</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {foodCommitError && <div role="alert" className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">{foodCommitError}</div>}

          <div className="space-y-4">
            {foodDiary.length === 0 ? (
              <div className="p-20 text-center text-slate-600 bg-slate-900 rounded-[3rem] border-2 border-dashed border-slate-800 flex flex-col items-center gap-4 shadow-inner">
                <Utensils size={48} className="opacity-20" />
                <p className="font-bold text-slate-400">Вы еще ничего не ели сегодня</p>
                <p className="text-sm font-semibold text-slate-500 max-w-md">Добавьте блюдо вручную или подтвердите результат анализа фото.</p>
              </div>
            ) : (
              <FoodDiaryGroupedComponent
                items={foodDiary}
                selectedIds={selectedFoodIds}
                toggleSelected={toggleFoodSelected}
                bulkMoveTo={bulkUpdateMealType}
                bulkDelete={bulkRemoveSelectedFoods}
                deleteEntry={deleteFoodEntry}
                deletePhoto={deleteFoodPhoto}
                openInsight={(item: FoodItem) => openInsight(item)}
                openEdit={openEditFood}
                formatTime={formatTime}
                mealTypeLabel={mealTypeLabel}
                activeDayKey={activeDiaryDayKey}
                onDayChange={onDiaryDayChange}
              />
            )}
          </div>
        </div>

        <div className="bg-slate-900 p-10 rounded-[3rem] shadow-xl border border-slate-800 sticky top-10 h-fit space-y-10">
          <h3 className="text-2xl font-black text-slate-100 text-left">Баланс КБЖУ</h3>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-slate-500">
            {activeDiaryDayLabel ? `Показан день: ${activeDiaryDayLabel}` : 'Показан день: сегодня'}
          </p>
          {targets.calories > 0 ? <div className="space-y-8">
            <MacroBarComponent label="Калории" current={dailyStats.calories} target={targets.calories} color="#818CF8" unit="ккал" />
            <MacroBarComponent label="Белки" current={dailyStats.protein} target={targets.protein} color="#818CF8" />
            <MacroBarComponent label="Жиры" current={dailyStats.fat} target={targets.fat} color="#FCD34D" />
            <MacroBarComponent label="Углеводы" current={dailyStats.carbs} target={targets.carbs} color="#A7F3D0" />
          </div> : <p className="text-sm text-slate-300">Автоматическая цель КБЖУ для этого профиля недоступна.</p>}
        </div>
      </div>
    </div>
  );
}
