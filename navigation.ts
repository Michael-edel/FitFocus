import type { ComponentType } from 'react';
import { Activity, BookOpen, Camera, ChefHat, Crown, Dumbbell, History, LifeBuoy, LockKeyhole, MessageSquareText, Settings, ShieldCheck, Sparkles, TrendingUp, Utensils, Users, BookMarked, CalendarDays, ShoppingBasket } from 'lucide-react';

export const sidebarTabIds = ['today', 'shopping', 'dashboard', 'council', 'plan', 'nutrition', 'progress', 'progress-archive', 'recipes', 'workouts', 'course', 'family', 'support', 'guide', 'privacy', 'updates', 'pro', 'settings', 'admin'] as const;

export type AppTabId = typeof sidebarTabIds[number];

export type SidebarTab = {
  id: AppTabId;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  color?: string;
};

export const sidebarTabs: SidebarTab[] = [
  { id: 'today', icon: CalendarDays, label: 'Сегодня' },
  { id: 'family', icon: Users, label: 'Меню семьи' },
  { id: 'shopping', icon: ShoppingBasket, label: 'Покупки' },
  { id: 'dashboard', icon: Activity, label: 'Личный обзор' },
  { id: 'council', icon: MessageSquareText, label: 'AI Совет' },
  { id: 'plan', icon: Sparkles, label: 'Личный план' },
  { id: 'nutrition', icon: Utensils, label: 'Дневник питания' },
  { id: 'progress', icon: TrendingUp, label: 'Прогресс' },
  { id: 'progress-archive', icon: Camera, label: 'Архив' },
  { id: 'recipes', icon: ChefHat, label: 'Рецепты' },
  { id: 'workouts', icon: Dumbbell, label: 'Зал' },
  { id: 'course', icon: BookOpen, label: 'Курс' },
  { id: 'support', icon: LifeBuoy, label: 'Поддержка' },
  { id: 'guide', icon: BookMarked, label: 'Инструкция' },
  { id: 'privacy', icon: LockKeyhole, label: 'Конфиденциальность' },
  { id: 'updates', icon: History, label: 'Что нового' },
  { id: 'admin', icon: ShieldCheck, label: 'Админ' },
  { id: 'pro', icon: Crown, label: 'Тарифы', color: 'text-amber-500' },
  { id: 'settings', icon: Settings, label: 'Настройки' },
];

export const sidebarCoreTabIds: AppTabId[] = ['today', 'family', 'shopping'];
export const sidebarFeatureTabIds: AppTabId[] = ['dashboard', 'plan', 'nutrition', 'council', 'progress', 'progress-archive', 'recipes', 'workouts', 'course', 'support', 'guide', 'privacy', 'updates', 'admin'];
export const sidebarUtilityTabIds: AppTabId[] = ['pro', 'settings'];
export const mobilePrimaryTabIds: AppTabId[] = ['today', 'family', 'shopping'];
