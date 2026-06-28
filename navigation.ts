import type { ComponentType } from 'react';
import { Activity, BookOpen, Camera, ChefHat, Crown, Dumbbell, History, LifeBuoy, LockKeyhole, MessageSquareText, Settings, ShieldCheck, Sparkles, TrendingUp, Utensils, Users, BookMarked } from 'lucide-react';

export const sidebarTabIds = ['dashboard', 'council', 'plan', 'nutrition', 'progress', 'progress-archive', 'recipes', 'workouts', 'course', 'family', 'support', 'guide', 'privacy', 'updates', 'pro', 'settings', 'admin'] as const;

export type AppTabId = typeof sidebarTabIds[number];

export type SidebarTab = {
  id: AppTabId;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  color?: string;
};

export const sidebarTabs: SidebarTab[] = [
  { id: 'dashboard', icon: Activity, label: 'Обзор' },
  { id: 'council', icon: MessageSquareText, label: 'AI Совет' },
  { id: 'plan', icon: Sparkles, label: 'План' },
  { id: 'nutrition', icon: Utensils, label: 'Питание' },
  { id: 'progress', icon: TrendingUp, label: 'Прогресс' },
  { id: 'progress-archive', icon: Camera, label: 'Архив' },
  { id: 'recipes', icon: ChefHat, label: 'Рецепты' },
  { id: 'workouts', icon: Dumbbell, label: 'Зал' },
  { id: 'course', icon: BookOpen, label: 'Курс' },
  { id: 'family', icon: Users, label: 'Семья' },
  { id: 'support', icon: LifeBuoy, label: 'Поддержка' },
  { id: 'guide', icon: BookMarked, label: 'Инструкция' },
  { id: 'privacy', icon: LockKeyhole, label: 'Конфиденциальность' },
  { id: 'updates', icon: History, label: 'Что нового' },
  { id: 'admin', icon: ShieldCheck, label: 'Админ' },
  { id: 'pro', icon: Crown, label: 'Тарифы', color: 'text-amber-500' },
  { id: 'settings', icon: Settings, label: 'Настройки' },
];

export const sidebarCoreTabIds: AppTabId[] = ['dashboard', 'council', 'plan', 'nutrition'];
export const sidebarFeatureTabIds: AppTabId[] = ['progress', 'progress-archive', 'recipes', 'workouts', 'course', 'family', 'support', 'guide', 'privacy', 'updates', 'admin'];
export const sidebarUtilityTabIds: AppTabId[] = ['pro', 'settings'];
export const mobilePrimaryTabIds: AppTabId[] = ['dashboard', 'council', 'plan', 'nutrition', 'progress'];
