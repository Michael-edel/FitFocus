import { BUILD_SOURCE } from './build-info.generated';

export type AppChannel = 'Бета' | 'Стабильная';

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
  channel: 'Бета',
};

export const APP_VERSION_STRING = `${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.patch}`;
export const APP_VERSION_LABEL = `v${APP_VERSION_STRING} ${APP_VERSION.channel}`;
export const APP_VERSION_UI_LABEL = `Публичный релиз ${APP_VERSION_STRING} ${APP_VERSION.channel}`;
export const BUILD_SEQUENCE_LABEL = BUILD_SOURCE.commitCount > 0
  ? `Сборка main №${BUILD_SOURCE.commitCount}`
  : `Сборка main • ${BUILD_SOURCE.shortSha}`;
export const BUILD_SHORT_LABEL = `${BUILD_SEQUENCE_LABEL} • ${BUILD_SOURCE.shortSha}`;
export const BUILD_VERSION_LABEL = BUILD_SOURCE.commitCount > 0
  ? `Текущая сборка main №${BUILD_SOURCE.commitCount}`
  : `Текущая сборка main • ${BUILD_SOURCE.shortSha}`;
export const BUILD_COMBINED_LABEL = `${APP_VERSION_UI_LABEL} • ${BUILD_SHORT_LABEL}`;

export const API_SCHEMA_VERSION = 3;
export const DATA_SCHEMA_VERSION = 3;
export const DB_MIGRATION_VERSION = "0012_support_feedback.sql";

export const versioningRules = [
  {
    title: 'КРУПНОЕ ОБНОВЛЕНИЕ',
    description: "Ломает совместимость или заметно меняет сценарий работы.",
    examples: ["перестраиваем авторизацию", "меняем модель данных", "ломаем старые API"],
  },
  {
    title: 'НОВАЯ ФУНКЦИЯ',
    description: "Добавляет новую функцию без поломки старого поведения.",
    examples: ["новый экран", "новый workflow", "новая интеграция"],
  },
  {
    title: 'ИСПРАВЛЕНИЕ',
    description: "Исправляет баги, тексты, мелкие UX-проблемы и полировку.",
    examples: ["кнопка не работала", "поправили текст", "устранили падение"],
  },
] as const;

export const versioningLayers = [
  {
    title: "Публичный релиз",
    value: APP_VERSION_UI_LABEL,
    note: "Это номер публичного выпуска. Он меняется только при сознательном релизе новой версии и не обновляется на каждый push в main.",
  },
  {
    title: "Автосборка main",
    value: BUILD_SHORT_LABEL,
    note: "Это номер и идентификатор конкретной сборки на main. Он обновляется автоматически на каждый push и помогает понять, какой код стоит на устройстве прямо сейчас.",
  },
  {
    title: "Схема API",
    value: `v${API_SCHEMA_VERSION}`,
    note: "Контракт ответа /api и совместимость клиентов. Меняется только при изменении формата данных или сценариев.",
  },
  {
    title: "Схема данных",
    value: `v${DATA_SCHEMA_VERSION}`,
    note: "Версии профиля и локальных сущностей пользователя. Нужна, чтобы хранение и синхронизация оставались совместимыми.",
  },
  {
    title: "Миграция БД",
    value: DB_MIGRATION_VERSION,
    note: "Текущая опорная миграция для схемы БД. По ней видно, на какой структуре базы должна работать текущая сборка.",
  },
] as const;
