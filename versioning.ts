import { BUILD_SOURCE } from './build-info.generated';

export type AppChannel = "Beta" | "Stable";

export type AppVersion = {
  major: number;
  minor: number;
  patch: number;
  channel: AppChannel;
};

export const APP_VERSION: AppVersion = {
  major: 2,
  minor: 4,
  patch: 0,
  channel: "Beta",
};

export const APP_VERSION_STRING = `${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.patch}`;
export const APP_VERSION_LABEL = `v${APP_VERSION_STRING} ${APP_VERSION.channel}`;
export const BUILD_VERSION_LABEL = `main №${BUILD_SOURCE.commitCount} • ${BUILD_SOURCE.shortSha}`;
export const BUILD_COMBINED_LABEL = `${APP_VERSION_LABEL} • Сборка ${BUILD_VERSION_LABEL}`;

export const API_SCHEMA_VERSION = 3;
export const DATA_SCHEMA_VERSION = 3;
export const DB_MIGRATION_VERSION = "0012_support_feedback.sql";

export const versioningRules = [
  {
    title: "MAJOR",
    description: "Ломает совместимость или заметно меняет сценарий работы.",
    examples: ["перестраиваем авторизацию", "меняем модель данных", "ломаем старые API"],
  },
  {
    title: "MINOR",
    description: "Добавляет новую функцию без поломки старого поведения.",
    examples: ["новый экран", "новый workflow", "новая интеграция"],
  },
  {
    title: "PATCH",
    description: "Исправляет баги, тексты, мелкие UX-проблемы и полировку.",
    examples: ["кнопка не работала", "поправили текст", "устранили падение"],
  },
] as const;

export const versioningLayers = [
  {
    title: "Приложение",
    value: APP_VERSION_LABEL,
    note: "UI и пользовательские сценарии.",
  },
  {
    title: "Сборка main",
    value: BUILD_COMBINED_LABEL,
    note: "Автоматически обновляется на каждый push в main.",
  },
  {
    title: "Схема API",
    value: `v${API_SCHEMA_VERSION}`,
    note: "Контракт ответа /api и совместимость клиентов.",
  },
  {
    title: "Схема данных",
    value: `v${DATA_SCHEMA_VERSION}`,
    note: "Версии профиля и локальных сущностей пользователя.",
  },
  {
    title: "Миграция БД",
    value: DB_MIGRATION_VERSION,
    note: "Текущая опорная миграция для схемы БД.",
  },
] as const;
