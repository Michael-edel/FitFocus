import React from 'react';
import clsx from 'clsx';
import {
  Camera,
  CheckSquare,
  ChevronDown,
  MoreHorizontal,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import type { FoodEntry, MealType } from './types';
import { toLocalDayKey as localDayKey } from './dateUtils';

export type FoodDiaryGroupedProps = {
  items: FoodEntry[];
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  bulkMoveTo: (mealType: MealType) => void;
  bulkDelete: () => void;
  deleteEntry: (id: string) => void;
  deletePhoto: (id: string) => void;
  openInsight: (item: FoodEntry) => void;
  openEdit: (item: FoodEntry) => void;
  formatTime: (t: string) => string;
  mealTypeLabel: (m: MealType) => string;
  activeDayKey?: string;
  onDayChange?: (dayKey: string) => void;
};

export const formatLocalDayLabel = (dayKey: string) => {
  if (!dayKey) return 'Без даты';
  const today = localDayKey(new Date());
  const yesterday = localDayKey(new Date(Date.now() - 86400000));
  if (dayKey === today) return 'Сегодня';
  if (dayKey === yesterday) return 'Вчера';
  const dt = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return dayKey;
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', weekday: 'short' });
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
  activeDayKey,
  onDayChange,
}) => {
  const [mobileActionsFor, setMobileActionsFor] = React.useState<string | null>(null);
  const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

  const groups = React.useMemo(() => {
    const dayMap = new Map<string, FoodEntry[]>();
    for (const item of items) {
      const dayKey = localDayKey(item.timestamp) || 'unknown';
      const next = dayMap.get(dayKey) || [];
      next.push(item);
      dayMap.set(dayKey, next);
    }

    return [...dayMap.entries()]
      .map(([dayKey, dayItems]) => {
        const meals = order
          .map((mt) => {
            const groupItems = dayItems
              .filter((x) => x.mealType === mt)
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            if (!groupItems.length) return null;
            const calories = groupItems.reduce((s, x) => s + (x.calories || 0), 0);
            return { mt, title: mealTypeLabel(mt), calories, groupItems };
          })
          .filter(Boolean) as Array<{ mt: MealType; title: string; calories: number; groupItems: FoodEntry[] }>;

        const calories = dayItems.reduce((s, x) => s + (x.calories || 0), 0);
        const photos = dayItems.filter((x) => x.photo || x.photoThumb).length;
        return {
          dayKey,
          dayLabel: formatLocalDayLabel(dayKey),
          calories,
          photos,
          totalItems: dayItems.length,
          meals,
        };
      })
      .sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
  }, [items, mealTypeLabel]);

  const todayKey = localDayKey(new Date()) || '';
  const preferredDayKey = activeDayKey?.trim() || todayKey;

  const resolvedActiveDayKey = React.useMemo(() => {
    if (preferredDayKey) return preferredDayKey;
    if (groups.length) return groups[0]?.dayKey || '';
    return '';
  }, [groups, preferredDayKey]);

  const visibleGroups = React.useMemo(() => {
    if (!preferredDayKey) return groups;
    const activeGroup = groups.find((group) => group.dayKey === preferredDayKey);
    if (activeGroup) return [activeGroup];
    return [{
      dayKey: preferredDayKey,
      dayLabel: formatLocalDayLabel(preferredDayKey),
      calories: 0,
      photos: 0,
      totalItems: 0,
      meals: [],
    }];
  }, [groups, preferredDayKey]);

  return (
    <div className="space-y-6">
      {groups.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {groups.map((dayGroup) => {
            const isActive = dayGroup.dayKey === resolvedActiveDayKey;
            return (
              <button
                key={dayGroup.dayKey}
                type="button"
                onClick={() => onDayChange?.(dayGroup.dayKey)}
                className={clsx(
                  'shrink-0 min-h-[42px] px-4 py-2 rounded-full border font-black text-[11px] uppercase tracking-widest transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-100 shadow-[0_0_0_1px_rgba(129,140,248,0.18)]'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                )}
              >
                {dayGroup.dayLabel}
              </button>
            );
          })}
        </div>
      )}

      {visibleGroups.map((dayGroup) => (
        <div key={dayGroup.dayKey} className="rounded-[2rem] md:rounded-[3rem] border border-slate-800 bg-slate-900/60 shadow-xl overflow-hidden">
          <div className="px-5 py-5 md:px-8 md:py-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h3 className="text-2xl md:text-3xl font-black text-slate-100">{dayGroup.dayLabel}</h3>
              <span className="text-sm font-black text-slate-500 tabular-nums">{Math.round(dayGroup.calories)} ккал · {dayGroup.totalItems} записей</span>
              <span className="text-xs font-black text-indigo-200/80 uppercase tracking-widest">Фото: {dayGroup.photos}</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                disabled={!selectedIds.size}
                onClick={() => bulkMoveTo('breakfast')}
                className="min-h-[40px] text-[10px] px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 font-black tracking-widest uppercase hover:bg-indigo-500/15 transition disabled:opacity-40"
                title="Перенести выбранные в завтрак"
              >
                → Завтрак
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

          <div className="p-3 md:p-6 space-y-4 md:space-y-5">
            {dayGroup.meals.length === 0 ? (
              <div className="rounded-[1.8rem] md:rounded-[2.5rem] border border-dashed border-slate-700 bg-slate-950/60 px-5 py-10 md:px-8 md:py-12 text-center">
                <p className="text-lg md:text-xl font-black text-slate-100">За этот день ещё нет записей</p>
                <p className="mt-2 text-sm md:text-base font-medium text-slate-500">
                  Добавьте фото еды или сохраните приём пищи, чтобы дневник и КБЖУ обновились именно в этом дне.
                </p>
              </div>
            ) : dayGroup.meals.map((g) => (
              <div key={g.mt} className="rounded-[1.8rem] md:rounded-[2.5rem] border border-slate-800 bg-slate-900/70 shadow-xl overflow-hidden">
                <div className="px-4 py-3 md:px-5 md:py-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <h4 className="text-xl md:text-2xl font-black text-slate-100">{g.title}</h4>
                    <span className="text-sm font-black text-slate-500 tabular-nums">{Math.round(g.calories)} ккал</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      disabled={!selectedIds.size}
                      onClick={() => bulkMoveTo(g.mt)}
                      className="min-h-[38px] text-[10px] px-3.5 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 font-black tracking-widest uppercase hover:bg-indigo-500/15 transition disabled:opacity-40"
                      title="Перенести выбранные в этот прием пищи"
                    >
                      → {g.title}
                    </button>
                    <button
                      disabled={!selectedIds.size}
                      onClick={bulkDelete}
                      className="min-h-[38px] text-[10px] px-3.5 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-200 font-black tracking-widest uppercase hover:bg-rose-500/15 transition disabled:opacity-40"
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
                        className="bg-slate-950 p-3 md:p-6 rounded-[1.8rem] md:rounded-[2.5rem] border border-slate-800 shadow-xl hover:border-slate-700 transition-all cursor-pointer"
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
                                {item.nonFood ? (
                                  <span className="mt-2 inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-200">
                                    Не еда
                                  </span>
                                ) : null}
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



export default FoodDiaryGrouped;
