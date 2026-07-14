import type { Type } from "@google/genai";
import { Recipe, UserProfile, AIPlan, Goal, AIAgentRole, CouncilResponse, FoodItem, UserHabit, WeeklyMenu, FamilyWeeklyMenu, FamilyMenuPrefs, FamilyWeeklyMenuDay } from "./types";
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS } from "./constants";
import { runCouncil } from "./orchestrator";
import { calculateDailyTargets, getBloodGlucoseGuidance } from "./profileMath";

// IMPORTANT (SECURITY):
// Ключ Gemini НЕ должен находиться во фронтенде. Любые вызовы Gemini выполняются ТОЛЬКО
// через серверный прокси /api/ai (Vite dev middleware или Cloudflare Functions).

type JsonRecord = Record<string, unknown>;
type ShoppingListItem = { name: string; grams: number };
type AiContentPart = JsonRecord & {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};
type AiContent = JsonRecord & {
  role?: string;
  parts: AiContentPart[];
};
type AiProxyConfig = JsonRecord;
type AiProxyResponse = JsonRecord & {
  text: string;
};
type FoodPhotoIngredientResult = {
  name: string;
  percent: number;
  amount?: string;
};
export type FoodPhotoAnalysisResult = {
  name: string;
  nonFood: boolean;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients: FoodPhotoIngredientResult[];
  notes: string[];
  portionGrams?: number;
  modelConfidence?: number;
};
type RecipeDraftStepResult = {
  n?: number;
  text: string;
  step?: string;
  timeMin?: number;
  time_minutes?: number;
};
export type EnhancedFoodPhotoAnalysisResult = FoodPhotoAnalysisResult & {
  steps?: Array<string | RecipeDraftStepResult>;
  tips?: string[];
  allergens?: string[];
  intolerances?: string[];
  servings?: number;
  timeMinutes?: number;
  time_minutes?: number;
};
export type CoachAdviceResult = {
  title: string;
  advice: string;
  bullets: string[];
};
type RuntimeGlobal = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
  __ENV?: Record<string, string | undefined>;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function finiteNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function safeJsonObject(text: string | undefined, fallback: JsonRecord = {}): JsonRecord {
  try {
    const parsed = JSON.parse(text || "{}");
    return asRecord(parsed);
  } catch {
    return fallback;
  }
}

function stringArray(value: unknown, maxItems = 20): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const n = Math.round(finiteNumber(value));
  return n > 0 ? n : undefined;
}

function normalizeFoodIngredient(rawItem: unknown): FoodPhotoIngredientResult | null {
  const item = asRecord(rawItem);
  const name = stringValue(item.name).trim();
  if (!name) return null;
  const percent = Math.max(0, Math.min(100, Math.round(finiteNumber(item.percent))));
  const amount = optionalString(item.amount)?.trim();
  return {
    name,
    percent,
    ...(amount ? { amount } : {}),
  };
}

export function normalizeFoodPhotoAnalysis(value: unknown): FoodPhotoAnalysisResult {
  const record = asRecord(value);
  const nonFood = record.nonFood === true;
  const notes = stringArray(record.notes, 8);

  if (nonFood) {
    return {
      name: stringValue(record.name).trim() || "Не еда",
      nonFood: true,
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      ingredients: [],
      notes: notes.length ? notes : ["Это не еда и не пищевой продукт. Запись не учитывается в КБЖУ."],
    };
  }

  const modelConfidence = finiteNumber(record.modelConfidence);
  return {
    name: stringValue(record.name).trim() || "Блюдо",
    nonFood: false,
    calories: Math.max(0, Math.round(finiteNumber(record.calories))),
    protein: Math.max(0, Math.round(finiteNumber(record.protein))),
    fat: Math.max(0, Math.round(finiteNumber(record.fat))),
    carbs: Math.max(0, Math.round(finiteNumber(record.carbs))),
    ingredients: (Array.isArray(record.ingredients) ? record.ingredients : [])
      .map(normalizeFoodIngredient)
      .filter((item): item is FoodPhotoIngredientResult => Boolean(item))
      .slice(0, 12),
    notes,
    portionGrams: optionalPositiveInteger(record.portionGrams),
    modelConfidence: modelConfidence > 0 ? Math.max(0, Math.min(1, modelConfidence)) : undefined,
  };
}

export function normalizeEnhancedFoodPhotoAnalysis(value: unknown): EnhancedFoodPhotoAnalysisResult {
  const record = asRecord(value);
  const base = normalizeFoodPhotoAnalysis(record);
  const steps = (Array.isArray(record.steps) ? record.steps : [])
    .map((rawStep, index): string | RecipeDraftStepResult | null => {
      if (typeof rawStep === "string") {
        const text = rawStep.trim();
        return text ? text : null;
      }
      const step = asRecord(rawStep);
      const text = (stringValue(step.text) || stringValue(step.step)).trim();
      if (!text) return null;
      const n = optionalPositiveInteger(step.n);
      const timeMin = optionalPositiveInteger(step.timeMin);
      const timeMinutesAlias = optionalPositiveInteger(step.time_minutes);
      return {
        ...(n ? { n } : { n: index + 1 }),
        text,
        step: text,
        ...(timeMin ? { timeMin } : {}),
        ...(timeMinutesAlias ? { time_minutes: timeMinutesAlias } : {}),
      };
    })
    .filter((step): step is string | RecipeDraftStepResult => Boolean(step))
    .slice(0, 30);
  const servings = optionalPositiveInteger(record.servings);
  const timeMinutes = optionalPositiveInteger(record.timeMinutes);
  const timeMinutesAlias = optionalPositiveInteger(record.time_minutes);

  return {
    ...base,
    ...(steps.length ? { steps } : {}),
    tips: stringArray(record.tips, 12),
    allergens: stringArray(record.allergens, 20),
    intolerances: stringArray(record.intolerances, 20),
    ...(servings ? { servings } : {}),
    ...(timeMinutes ? { timeMinutes } : {}),
    ...(timeMinutesAlias ? { time_minutes: timeMinutesAlias } : {}),
  };
}

export function normalizeCoachAdvice(value: unknown): CoachAdviceResult {
  const record = asRecord(value);
  return {
    title: stringValue(record.title).trim() || "Совет на сегодня",
    advice: stringValue(record.advice).trim() || "Не удалось сформировать персональный совет. Попробуйте позже.",
    bullets: stringArray(record.bullets, 8),
  };
}

export function normalizeRecipe(value: unknown): Recipe {
  const record = asRecord(value);
  const ingredients = (Array.isArray(record.ingredients) ? record.ingredients : [])
    .map((rawItem) => {
      const item = asRecord(rawItem);
      const name = stringValue(item.name).trim();
      const amount = optionalString(item.amount)?.trim();
      return name ? { name, ...(amount ? { amount } : {}) } : null;
    })
    .filter((item): item is { name: string; amount?: string } => Boolean(item))
    .slice(0, 40);
  const steps = (Array.isArray(record.steps) ? record.steps : [])
    .map((rawStep, index) => {
      const step = asRecord(rawStep);
      const text = stringValue(step.text).trim();
      if (!text) return null;
      const timeMin = optionalPositiveInteger(step.timeMin);
      return {
        n: optionalPositiveInteger(step.n) ?? index + 1,
        text,
        ...(timeMin ? { timeMin } : {}),
      };
    })
    .filter((step): step is { n: number; text: string; timeMin?: number } => Boolean(step))
    .slice(0, 30);

  return {
    title: stringValue(record.title).trim() || "Рецепт",
    servings: optionalPositiveInteger(record.servings),
    timeMinutes: optionalPositiveInteger(record.timeMinutes),
    ingredients,
    steps,
    tips: stringArray(record.tips, 12),
  };
}

function isAiContent(value: unknown): value is AiContent {
  return isRecord(value) && Array.isArray(value.parts);
}

const getEnv = (key: string): string | undefined => {
  try {
    const g = globalThis as RuntimeGlobal;
    const viteEnv = import.meta.env as Record<string, string | undefined>;
    return (
      g?.process?.env?.[key] ??
      viteEnv?.[key] ??
      viteEnv?.[`VITE_${key}`] ??
      optionalString(g?.[key]) ??
      // иногда AI Studio прокидывает env в window.__ENV
      g?.__ENV?.[key]
    );
  } catch {
    return undefined;
  }
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const SHOPPING_QTY_RE = /(\d+(?:[.,]\d+)?)\s*(кг|kg|г|гр|g)(?=\s|$|[),.;])/i;

function extractShoppingGrams(value: string): number {
  const text = String(value || "").replace(/,/g, ".").toLowerCase();
  const match = text.match(SHOPPING_QTY_RE);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const unit = match[2].toLowerCase();
  return Math.round(unit === "кг" || unit === "kg" ? amount * 1000 : amount);
}

function stripShoppingQuantity(value: string): string {
  return String(value || "")
    .replace(/\s*[—–-]\s*\d+(?:[.,]\d+)?\s*(?:кг|kg|г|гр|g)(?=\s|$|[),.;])/gi, " ")
    .replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*(?:кг|kg|г|гр|g)(?=\s|$|[),.;])\s*\)/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:кг|kg|г|гр|g)(?=\s|$|[),.;])/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeShoppingListItems(rawItems: unknown, shoppingList: string[]): ShoppingListItem[] {
  const fallbackByName = new Map<string, number>();
  for (const line of shoppingList || []) {
    const text = String(line || "").trim();
    if (!text) continue;
    const grams = extractShoppingGrams(text);
    if (!grams) continue;
    fallbackByName.set(stripShoppingQuantity(text).toLowerCase(), grams);
  }

  const normalized = (Array.isArray(rawItems) ? rawItems : [])
    .map((rawItem): ShoppingListItem => {
      const item = asRecord(rawItem);
      const rawName = stringValue(item.name).trim();
      const cleanedName = stripShoppingQuantity(rawName);
      const fallbackGrams = fallbackByName.get(cleanedName.toLowerCase()) || 0;
      const grams = Math.max(
        0,
        Math.round(
          finiteNumber(item.grams) > 0
            ? finiteNumber(item.grams)
            : extractShoppingGrams(rawName) || fallbackGrams
        )
      );
      return {
        name: cleanedName || rawName,
        grams,
      };
    })
    .filter((it): it is ShoppingListItem => Boolean(it.name && it.grams > 0));

  if (normalized.length) {
    return normalized;
  }

  return (Array.isArray(shoppingList) ? shoppingList : [])
    .map((line): ShoppingListItem | null => {
      const text = String(line || "").trim();
      if (!text) return null;
      const name = stripShoppingQuantity(text);
      const grams = extractShoppingGrams(text);
      if (!name || grams <= 0) return null;
      return { name, grams };
    })
    .filter((it): it is ShoppingListItem => Boolean(it));
}

/**
 * Прокси-вызов для AI (используется для соблюдения лимитов на сервере)
 */
async function callAiProxy(
  model: string,
  contents: unknown,
  feature: string,
  config?: AiProxyConfig
): Promise<AiProxyResponse> {
  // Всегда используем серверный прокси с лимитами (ключ на сервере).

  // ✅ Глобальная языковая политика продукта
  // Gemini часто "уходит" в английский на названиях блюд/ингредиентов (особенно vision).
  // Поэтому добавляем жёсткую инструкцию в начало каждого запроса.
  const RU_POLICY =
    "ВАЖНО: отвечай строго на русском языке. " +
    "Все названия блюд, продуктов и ингредиентов — только на русском (без латиницы). " +
    "Единицы: граммы (г), миллилитры (мл), килокалории (ккал). " +
    "Если возвращаешь JSON — все строковые значения тоже на русском.";

  // ✅ Нормализуем contents (на всякий случай) — текст всегда Content[]
  let normalizedContents: AiContent[];
  if (typeof contents === "string") {
    normalizedContents = [{ role: "user", parts: [{ text: `${RU_POLICY}\n\n${contents}` }] }];
  } else if (isAiContent(contents)) {
    // Один Content (часто для vision). Подмешиваем RU_POLICY первой текстовой частью.
    const parts = [...contents.parts];
    parts.unshift({ text: RU_POLICY });
    normalizedContents = [{ ...contents, role: contents.role || "user", parts }];
  } else if (Array.isArray(contents)) {
    // Content[]
    normalizedContents = [
      { role: "user", parts: [{ text: RU_POLICY }] },
      ...contents.filter(isAiContent),
    ];
  } else {
    // Непредвиденный формат — всё равно обеспечиваем инструкцию
    normalizedContents = [{ role: "user", parts: [{ text: RU_POLICY }] }];
  }

  // ✅ Gemini не принимает поле `config` — прокидываем как `generationConfig`
  const basePayload: JsonRecord = { contents: normalizedContents, feature };
  if (config && typeof config === "object") basePayload.generationConfig = config;

  const doReq = async (m: string) => {
    const payload = { ...basePayload, model: m };
    const res = await fetch("/api/ai", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = asRecord(await res.json().catch(() => ({})));
    return { res, data };
  };

  // 1) пробуем основную модель
  let { res, data } = await doReq(model);

  // 2) если нет доступа/модель не найдена — фолбэк на стабильные модели
  if (!res.ok && (res.status === 403 || res.status === 404)) {
    const fallback = model.toLowerCase().includes("pro") ? "gemini-2.5-pro" : "gemini-2.5-flash";
    ({ res, data } = await doReq(fallback));
  }

  if (!res.ok) {
    const error = asRecord(data.error);
    // Если исчерпан бесплатный лимит гостя — попросим авторизацию
    if (res.status === 402 && stringValue(error.code) === "PAYWALL") {
      try {
        window.dispatchEvent(new CustomEvent("ff:auth-required", { detail: error }));
      } catch {}
    }
    const msg = stringValue(error.message) || stringValue(data.message) || `AI proxy error: ${res.status}`;
    throw new Error(msg);
  }

  // Нормализуем ответ: UI ожидает поле `text`,
  // а Gemini API часто возвращает структуру candidates[].content.parts[].text
  const text = extractTextFromGemini(data);
  if (!text || !String(text).trim()) {
    const statusCode = stringValue(data.status) || stringValue(asRecord(data.error).code);
    const status = statusCode ? ` (status: ${statusCode})` : "";
    throw new Error(`AI вернул пустой ответ${status}. Возможен safety-block или недоступная модель.`);
  }
  return { ...data, text };
}

export function extractTextFromGemini(data: unknown): string {
  const record = asRecord(data);
  if (typeof record.text === "string") return record.text;

  const out: string[] = [];
  const candidates = record.candidates;
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const content = asRecord(asRecord(c).content);
      const parts = content.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          const text = stringValue(asRecord(p).text);
          if (text) out.push(text);
        }
      }
    }
  }

  if (!out.length && typeof record.output_text === "string") return record.output_text;
  return out.join("\n").trim();
}



export async function callAiCouncil(
  query: string,
  user: UserProfile,
  diary: FoodItem[],
  habits: UserHabit[]
): Promise<CouncilResponse> {
  const callModel = async (prompt: string, role: AIAgentRole) => {
    const res = await callAiProxy('gemini-2.5-flash', prompt, `council_${role}`);
    return res.text || '';
  };

  return await runCouncil(query, user, { diary, habits }, callModel);
}

// --- Resilience layer (quota/caching) ---
let aiStorageScope: string | null = null;

export const setAiStorageScope = (userId: string | null) => {
  aiStorageScope = userId && String(userId).trim() ? String(userId) : null;
};

const scopedKey = (base: string) => (aiStorageScope ? `fitfocus_data_${aiStorageScope}_${base}` : base);
const LS_COOLDOWN_KEY = () => scopedKey("ai_gemini_cooldown_until");
const LS_STATUS_KEY = () => scopedKey("ai_last_status_v1");
const LS_CACHE_PREFIX = () => scopedKey("ai_cache_v1:");
const LS_FEATURE_LASTCALL_PREFIX = () => scopedKey("ai_feature_lastcall_v1:");
const LS_LAST_ACTION_KEY = () => scopedKey("ai_last_action_v1");

const FEATURE_MIN_INTERVAL_MS: Record<string, number> = {
  coach_advice: 10 * 60 * 1000,
  foodphoto: 60 * 1000,
  recipe: 2 * 60 * 1000,
  personal_plan: 24 * 60 * 60 * 1000,
  wis_text: 6 * 60 * 60 * 1000,
  plateau: 60 * 60 * 1000,
  family_menu: 12 * 60 * 60 * 1000,
};

const MIN_CALL_INTERVAL_MS = 4000;
let lastCallAt = 0;
let queue: Promise<unknown> = Promise.resolve();

type AiStatusSource = 'live' | 'cache' | 'stale-cache' | 'fallback' | 'cooldown-cache' | 'cooldown-stale-cache' | 'cooldown-fallback' | 'error';

export type AiLastStatus = {
  ts: number;
  feature: string;
  source: AiStatusSource;
  reason?: string;
  cooldownUntil?: number;
  cacheTs?: number;
  stale?: boolean;
};

const recordAiStatus = (s: AiLastStatus) => {
  try {
    localStorage.setItem(LS_STATUS_KEY(), JSON.stringify(s));
  } catch {}
};

export const readAiStatus = (): AiLastStatus | null => {
  try {
    const raw = localStorage.getItem(LS_STATUS_KEY());
    if (!raw) return null;
    return JSON.parse(raw) as AiLastStatus;
  } catch { return null; }
};

const nowMs = () => Date.now();

const getCooldownUntil = (): number => {
  try {
    const v = localStorage.getItem(LS_COOLDOWN_KEY());
    return v ? Number(v) || 0 : 0;
  } catch { return 0; }
};

const setFeatureLastCall = (feature: string) => {
  try {
    localStorage.setItem(LS_FEATURE_LASTCALL_PREFIX() + feature, String(nowMs()));
  } catch {}
};

const getFeatureLastCall = (feature: string): number => {
  try {
    const v = localStorage.getItem(LS_FEATURE_LASTCALL_PREFIX() + feature);
    return v ? Number(v) || 0 : 0;
  } catch { return 0; }
};

const isFeatureThrottled = (feature: string): { throttled: boolean; waitMs: number } => {
  const min = FEATURE_MIN_INTERVAL_MS[feature] ?? 0;
  if (!min) return { throttled: false, waitMs: 0 };
  const last = getFeatureLastCall(feature);
  const elapsed = nowMs() - last;
  const waitMs = Math.max(0, min - elapsed);
  return { throttled: waitMs > 0, waitMs };
};

export const clearAiCache = () => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(LS_CACHE_PREFIX()) || k.startsWith(LS_FEATURE_LASTCALL_PREFIX()) || k === LS_COOLDOWN_KEY() || k === LS_STATUS_KEY()) {
        keys.push(k);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
};

export const allowAiRetryNow = (feature?: string, opts?: { force?: boolean }) => {
  try {
    const now = nowMs();
    const cdRaw = localStorage.getItem(LS_COOLDOWN_KEY());
    const cooldownUntil = cdRaw ? parseInt(cdRaw, 10) : 0;
    const cooling = cooldownUntil > now;
    if (cooling && !opts?.force) {
      recordAiStatus({ 
        ts: now, 
        feature: feature ?? 'all', 
        source: 'cooldown-cache', 
        reason: 'cooldown-active', 
        cooldownUntil 
      });
      return false;
    }
    localStorage.removeItem(LS_COOLDOWN_KEY());
    if (feature) {
      localStorage.removeItem(LS_FEATURE_LASTCALL_PREFIX() + feature);
    } else {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith(LS_FEATURE_LASTCALL_PREFIX())) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    }
    return true;
  } catch { return true; }
};

/**
 * Установить последнее действие AI для возможности повтора
 */
export const setLastAiAction = (action: { feature: string; type: string; userId: string } | null) => {
  try {
    if (!action) localStorage.removeItem(LS_LAST_ACTION_KEY());
    else localStorage.setItem(LS_LAST_ACTION_KEY(), JSON.stringify(action));
  } catch {}
};

/**
 * Получить последнее действие AI
 */
export const getLastAiAction = (): { feature: string; type: string; userId: string } | null => {
  try {
    const raw = localStorage.getItem(LS_LAST_ACTION_KEY());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};


/**
 * Меню на неделю (строгий JSON + schema). Используется для вкладки "План".
 */
export async function generateWeeklyMenu(user: UserProfile, plan: AIPlan): Promise<WeeklyMenu> {
  const schema = {
    type: "OBJECT",
    properties: {
      days: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            day: { type: "STRING" },
            breakfast: { type: "STRING" },
            lunch: { type: "STRING" },
            dinner: { type: "STRING" },
            snack: { type: "STRING" }
          },
          required: ["day", "breakfast", "lunch", "dinner", "snack"]
        }
      },
      shoppingList: { type: "ARRAY", items: { type: "STRING" } },
      shoppingListItems: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            grams: { type: "NUMBER" }
          },
          required: ["name", "grams"]
        }
      }
    },
    required: ["days", "shoppingList", "shoppingListItems"]
  } as const;

  const prompt = `Составь простое меню на 7 дней для пользователя.
Пользователь: ${user.name}, пол: ${user.gender}, возраст: ${user.age}, рост: ${user.height} см, вес: ${user.weight} кг, цель: ${user.goal}.
Дневные KPI: ${plan.dailyKpi.calories} ккал, Б ${plan.dailyKpi.protein} г, Ж ${plan.dailyKpi.fat} г, У ${plan.dailyKpi.carbs} г.
Сахар крови: ${user.bloodGlucoseMmolL ? `${Number(user.bloodGlucoseMmolL).toFixed(1)} ммоль/л (${getBloodGlucoseGuidance(user.bloodGlucoseMmolL)})` : 'не указан'}.
Ограничения (если есть):
- Медицинские ограничения: ${user.medicalRestrictions || 'нет'}
- Аллергены (строго): ${(user.dietary?.allergens || []).join(', ') || 'нет'}
- Непереносимость/избегать: ${(user.dietary?.intolerances || []).join(', ') || 'нет'}
- Не ем совсем: ${(user.dietary?.excludedFoods || []).join(', ') || (user.exclusions || 'нет')}
- Строгость: ${user.dietary?.severity || 'strict'}.
Если указан сахар крови, учитывай его только как дополнительный контекст для питания и не добавляй в расчёт ккал/БЖУ.

Требования:
- Верни СТРОГО валидный JSON по schema (без текста, без markdown).
- 7 дней в массиве days, порядок: Понедельник..Воскресенье.
- Блюда должны быть простые, из доступных продуктов, повторы допустимы.
- Порции в описании коротко (пример: "курица 150г + гречка 80г + салат").
- Если сахар повышен, делай углеводы более равномерными, убирай сладкие напитки и десерты, делай акцент на белок/клетчатку.
- Если сахар низкий, не предлагай жёсткий дефицит, длинные голодные окна и пропуск завтрака.
- Если сахар в норме или не указан, меню строится по обычным KPI без дополнительных ограничений.
- shoppingList: общий список покупок на неделю, 15–30 пунктов, кратко.
- shoppingListItems: агрегированный список покупок с весом в граммах на неделю. Формат: [{name, grams}]. Названия строго на русском.`;

  const res = await callAiProxy("gemini-2.5-flash", prompt, "weekly_menu", {
    responseMimeType: "application/json",
    responseSchema: schema
  });

  const obj = safeJsonObject(res.text);

  const dayNames = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
  const days = Array.isArray(obj.days) ? obj.days : [];
  const normDays = dayNames.map((dn, i) => {
    const d = asRecord(days[i]);
    return {
      day: stringValue(d.day) || dn,
      breakfast: stringValue(d.breakfast),
      lunch: stringValue(d.lunch),
      dinner: stringValue(d.dinner),
      snack: stringValue(d.snack)
    };
  });

  const shoppingList = (Array.isArray(obj.shoppingList) ? obj.shoppingList : [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 40);

  const shoppingListItems = normalizeShoppingListItems(obj.shoppingListItems, shoppingList)
    .slice(0, 120);

  // weekStart (UTC Monday) for storage/export
  const weekStart = (() => {
    const d0 = new Date();
    const date = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()));
    const day = date.getUTCDay();
    const diff = (day === 0 ? -6 : 1 - day);
    date.setUTCDate(date.getUTCDate() + diff);
    return date.toISOString().slice(0, 10);
  })();

  // Best-effort: store normalized items server-side for aggregated shopping list + CSV export
  try {
    await fetch("/api/weekly_menu/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ week_start: weekStart, items: shoppingListItems })
    });
  } catch {}

  // Legacy list fallback from items if shoppingList empty
  const legacyFromItems = shoppingListItems.map((it) => `${it.name} — ${it.grams} г`);
  const finalShoppingList = shoppingList.length ? shoppingList : legacyFromItems;

  return { days: normDays, shoppingList: finalShoppingList, shoppingListItems, weekStart };
}

/**
 * Семейное меню на неделю: одно блюдо на всех + порции под разные калории.
 * ВАЖНО: исключения семьи учитываются (общие + индивидуальные).
 */
export async function generateFamilyWeeklyMenu(
  owner: UserProfile,
  familyProfiles: UserProfile[],
  prefs: FamilyMenuPrefs
): Promise<FamilyWeeklyMenu> {
  // Источник семьи: зарегистрированные профили (Family тариф)
  const uniqueById = new Map<string, UserProfile>();
  [owner, ...(familyProfiles || [])].forEach(p => uniqueById.set(p.id, p));
  const allProfiles = Array.from(uniqueById.values());
  const allPeople = allProfiles.map(p => {
    const targets = p.aiPlan?.dailyKpi || calculateDailyTargets(p);
    return {
      id: p.id,
      name: p.name,
      gender: p.gender,
      age: p.age,
      weight: p.weight,
      height: p.height,
      activityLevel: p.activityLevel,
      goal: p.goal,
      exclusions: p.exclusions || "",
      medicalRestrictions: p.medicalRestrictions || "",
      dietary: p.dietary || null,
      targets
    };
  });

  const includeSet = new Set(prefs.includeIds || [owner.id]);
  const people = allPeople.filter(p => includeSet.has(p.id));

  const globalExcl = [owner.familyExclusions || ""].filter(Boolean).join("; ").trim();
  const individualExcl = people
    .map(p => p.exclusions ? `${p.name}: ${p.exclusions}` : "")
    .filter(Boolean)
    .join("; ")
  const medicalBlock = people
    .map(p => p.medicalRestrictions ? `${p.name}: ${p.medicalRestrictions}` : "")
    .filter(Boolean)
    .join("; ")
const dietaryBlock = (() => {
  const strictAllergens = Array.from(new Set(people.flatMap(p => (p.dietary?.allergens || [])))).filter(Boolean);
  const intolerances = Array.from(new Set(people.flatMap(p => (p.dietary?.intolerances || [])))).filter(Boolean);
  const excludedFoods = Array.from(new Set(people.flatMap(p => (p.dietary?.excludedFoods || [])))).filter(Boolean);
  const perPerson = people.map(p => {
    const a = (p.dietary?.allergens || []).join(", ");
    const i = (p.dietary?.intolerances || []).join(", ");
    const e = (p.dietary?.excludedFoods || []).join(", ");
    const parts = [
      a ? `аллергены: ${a}` : "",
      i ? `избегать: ${i}` : "",
      e ? `не ем: ${e}` : ""
    ].filter(Boolean);
    return parts.length ? `${p.name}: ${parts.join(" / ")}` : "";
  }).filter(Boolean).join("; ");

  return {
    strictAllergens,
    intolerances,
    excludedFoods,
    perPerson,
  };
})();

;

  const schema = {
    type: "OBJECT",
    properties: {
      days: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            day: { type: "STRING" },
            breakfast: {
              type: "OBJECT",
              properties: {
                base: { type: "STRING" },
                portions: { type: "OBJECT" }
              },
              required: ["base", "portions"]
            },
            lunch: {
              type: "OBJECT",
              properties: {
                base: { type: "STRING" },
                portions: { type: "OBJECT" }
              },
              required: ["base", "portions"]
            },
            dinner: {
              type: "OBJECT",
              properties: {
                base: { type: "STRING" },
                portions: { type: "OBJECT" }
              },
              required: ["base", "portions"]
            },
            snack: {
              type: "OBJECT",
              properties: {
                base: { type: "STRING" },
                portions: { type: "OBJECT" }
              },
              required: ["base", "portions"]
            }
          },
          required: ["day", "breakfast", "lunch", "dinner", "snack"]
        }
      },
      shoppingList: { type: "ARRAY", items: { type: "STRING" } },
      shoppingListItems: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            grams: { type: "NUMBER" }
          },
          required: ["name", "grams"]
        }
      }
    },
    required: ["days", "shoppingList", "shoppingListItems"]
  } as const;

  const dayNames = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
  const peopleLine = people.map(p => {
    const t = p.targets;
    return `${p.name} (${p.gender}, ${p.age} лет): цель ${t?.calories ?? "?"} ккал/день; Б${t?.protein ?? "?"} Ж${t?.fat ?? "?"} У${t?.carbs ?? "?"}`;
  }).join("\n");

  const prompt = `Ты — диетолог-организатор меню для семьи.\n\nЗадача: составить единое меню на 7 дней, где готовим ОДНИ и те же блюда для всех,\nно порции/граммовки отличаются под разные калории.\n\nРЕЖИМ ГОТОВКИ: ${prefs.cookingMode === "once_per_day" ? "готовим 1 раз в день (ужин + остатки/контейнеры на следующий день)" : "готовим для каждого приёма пищи"}.\nБЮДЖЕТ (если указан): ${prefs.budgetPerWeek ? `${prefs.budgetPerWeek} ${prefs.currency || ""}` : "не задан"}.\n\nСостав семьи (учесть ВСЕХ ниже):\n${peopleLine}\n\nОБЩИЕ ИСКЛЮЧЕНИЯ (нельзя в общей готовке): ${globalExcl || "нет"}.\nИНДИВИДУАЛЬНЫЕ ИСКЛЮЧЕНИЯ (учесть порциями/заменами): ${individualExcl || "нет"}.\nМЕДИЦИНСКИЕ ОГРАНИЧЕНИЯ: ${medicalBlock || "нет"}.\n\nТребования к результату:\n- Верни СТРОГО валидный JSON по schema (без текста, без markdown).\n- days: 7 дней, порядок: Понедельник..Воскресенье.\n- Для каждого приёма: base — одно блюдо для всех (коротко: "рыба + рис + салат").\n- portions — объект вида {"<personId>": "граммовки/порция кратко"}. Должен содержать ВСЕ id из списка семьи.\n- Если есть индивидуальные исключения: делай замены внутри portions (например, без молока, без мёда) НЕ меняя base радикально.\n- Пиши граммовки (пример: "курица 160г + гречка 80г + овощи") и/или количество ("2 яйца").\n- КАЖДАЯ строка portions ОБЯЗАНА содержать: (1) ориентир по общему весу порции, (2) примерные калории.\n  Формат-ориентир: "всего ~420г: курица 160г + рис 80г + салат 180г (≈560 ккал)".\n- Если режим once_per_day: допускаются контейнеры/остатки, но всё равно укажи вес/ккал порции.\n- shoppingList: общий список покупок на неделю, 20–40 пунктов, без запрещённых продуктов.\n\nВажно: не задавай вопросов — входные данные уже переданы.`;

  const res = await callAiProxy("gemini-2.5-flash", prompt, "family_menu", {
    responseMimeType: "application/json",
    responseSchema: schema
  });

  const obj = safeJsonObject(res.text);

  const daysRaw = Array.isArray(obj.days) ? obj.days : [];
  const normMeal = (mealValue: unknown): FamilyWeeklyMenuDay["breakfast"] => {
    const meal = asRecord(mealValue);
    const portions = asRecord(meal.portions);
    const normPortions: Record<string, string> = {};
    for (const p of people) {
      normPortions[p.id] = stringValue(portions[p.id]).trim();
    }
    return { base: stringValue(meal.base).trim(), portions: normPortions };
  };

  const normDays: FamilyWeeklyMenuDay[] = dayNames.map((dn, i) => {
    const d = asRecord(daysRaw[i]);
    return {
      day: stringValue(d.day) || dn,
      breakfast: normMeal(d.breakfast),
      lunch: normMeal(d.lunch),
      dinner: normMeal(d.dinner),
      snack: normMeal(d.snack),
    };
  });

  const shoppingList = stringArray(obj.shoppingList, 60);
  const shoppingListItems = normalizeShoppingListItems(obj.shoppingListItems, shoppingList)
    .slice(0, 80);

  // Валидация: пользователю важно видеть "сколько кому" — требуем вес/ккал в каждой порции.
  const hasWeightAndKcal = (s: string) => {
    const t = String(s || "");
    const hasNum = /\d/.test(t);
    const hasKcal = /(ккал|kcal)/i.test(t);
    const hasWeightUnit = /(г|гр|г\.|мл|шт|порц)/i.test(t);
    return hasNum && hasKcal && hasWeightUnit;
  };

  const needsRepair = normDays.some(d => {
    const meals = [d.breakfast, d.lunch, d.dinner, d.snack];
    return meals.some(m => Object.values(m.portions || {}).some(v => !hasWeightAndKcal(v)));
  });

  if (needsRepair) {
    const repairPrompt = `Ты — редактор семейного меню. У тебя уже есть меню JSON.

НЕ МЕНЯЯ список блюд (base) и структуру days, перепиши ТОЛЬКО поле portions так, чтобы:
- для каждого personId у каждого приёма была строка с весом порции (г/мл/шт) и (≈N ккал)
- соблюдены общие/индивидуальные исключения
- порции различались под разные калории

Верни СТРОГО валидный JSON по schema (без текста, без markdown).

Текущее меню JSON:
${JSON.stringify({ days: normDays, shoppingList }, null, 2)}
`;

    const rep = await callAiProxy("gemini-2.5-flash", repairPrompt, "family_menu_repair", {
      responseMimeType: "application/json",
      responseSchema: schema
    });

    const robj = safeJsonObject(rep.text);
    const rdaysRaw = Array.isArray(robj.days) ? robj.days : [];
    const rnormDays: FamilyWeeklyMenuDay[] = dayNames.map((dn, i) => {
      const d = asRecord(rdaysRaw[i]);
      return {
        day: stringValue(d.day) || dn,
        breakfast: normMeal(d.breakfast),
        lunch: normMeal(d.lunch),
        dinner: normMeal(d.dinner),
        snack: normMeal(d.snack),
      };
    });
    const rshoppingList = stringArray(robj.shoppingList, 60);
    const rshoppingListItems = normalizeShoppingListItems(
      robj.shoppingListItems,
      rshoppingList.length ? rshoppingList : shoppingList
    ).slice(0, 80);
    return {
      prefs,
      days: rnormDays,
      shoppingList: rshoppingList.length ? rshoppingList : shoppingList,
      shoppingListItems: rshoppingListItems.length ? rshoppingListItems : shoppingListItems,
    };
  }

  return { prefs, days: normDays, shoppingList, shoppingListItems };
}

/**
 * Анализ фото еды с использованием Gemini Flash
 */
export async function analyzeFoodPhoto(base64: string): Promise<FoodPhotoAnalysisResult> {
  const response = await callAiProxy('gemini-2.5-flash', {
    parts: [
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64,
        },
      },
      {
        text: 'Определи, является ли изображение едой или напитком для человека. Если это не еда и не напиток, верни nonFood=true, calories=0, protein=0, fat=0, carbs=0, ingredients=[] и notes с кратким объяснением НА РУССКОМ; не оценивай калорийность непищевого объекта. Если это еда или напиток, анализируй блюдо. Верни JSON с полями: nonFood (boolean), name (название НА РУССКОМ), calories (число), protein (г), fat (г), carbs (г), ingredients (массив объектов с name НА РУССКОМ и percent), notes (массив строк НА РУССКОМ). Не используй латиницу. Ответ строго в формате JSON.',
      },
    ],
  }, 'foodphoto', {
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        nonFood: { type: "BOOLEAN" },
        calories: { type: "NUMBER" },
        protein: { type: "NUMBER" },
        fat: { type: "NUMBER" },
        carbs: { type: "NUMBER" },
        ingredients: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              percent: { type: "NUMBER" }
            }
          }
        },
        notes: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["name", "nonFood", "calories", "protein", "fat", "carbs", "ingredients"]
    }
  });
  return normalizeFoodPhotoAnalysis(safeJsonObject(response.text));
}

    // Enhanced re-analysis: stricter prompt, portion grams estimate, more detailed ingredients
    export async function analyzeFoodPhotoEnhanced(base64: string): Promise<EnhancedFoodPhotoAnalysisResult> {
      const schema = {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          calories: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          fat: { type: "NUMBER" },
          carbs: { type: "NUMBER" },
          ingredients: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                amount: { type: "STRING" },
              },
            },
          },
          notes: { type: "ARRAY", items: { type: "STRING" } },
          portionGrams: { type: "NUMBER" },
          modelConfidence: { type: "NUMBER" }
        },
        required: ["name","calories","protein","fat","carbs","ingredients","notes"]
      };

      const prompt = `Ты — эксперт по нутрициологии и пищевому анализу по фото.
Проанализируй изображение максимально детально.
Обязательно:
- Оцени примерный вес порции (portionGrams) в граммах
- Раздели крем/соусы по типу, если применимо
- Для каждого ингредиента укажи примерную граммовку или меру (amount)
- Если не уверен, укажи это в notes
- Дай modelConfidence от 0 до 1
Верни строго JSON по схеме.`;

      const response = await callAiProxy("gemini-2.5-flash", {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64,
            },
          },
          { text: prompt },
        ],
      }, "foodphoto_enhanced", {
        responseMimeType: "application/json",
        responseSchema: schema,
      });

      return normalizeEnhancedFoodPhotoAnalysis(safeJsonObject(response.text));
    }

/**
 * Получение персонального совета от AI коуча
 */
export async function getCoachAdvice(data: unknown): Promise<CoachAdviceResult> {
  const response = await callAiProxy('gemini-2.5-flash', 
    `Ты - персональный фитнес-коуч. Данные пользователя: ${JSON.stringify(data)}. Если в данных есть давление, пульс, сахар крови, обхваты, фото прогресса, историю замеров или медицинские ограничения, учитывай их при рекомендациях по нагрузке, питанию и восстановлению. Сахар крови трактуй так: низкий = не давать агрессивный дефицит и долгие голодные окна; норма = нейтральный контекст; повышен = меньше быстрых углеводов, больше белка/клетчатки и равномерное распределение углеводов; не меняй калорийную цель, меняй состав и ритм питания. Дай краткий совет на сегодня. Верни JSON с полями title, advice, bullets (массив строк).`,
    'coach_advice',
    {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          advice: { type: "STRING" },
          bullets: { type: "ARRAY", items: { type: "STRING" } }
        },
        required: ["title", "advice", "bullets"]
      }
    }
  );
  return normalizeCoachAdvice(safeJsonObject(response.text));
}

/**
 * Генерация персонального плана (используется Gemini Pro)
 */
export async function generatePersonalPlan(user: UserProfile): Promise<AIPlan> {
  const schema = {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      strategySummary: { type: "STRING" },
      weeklyFocus: { type: "STRING" },
      dailyKpi: {
        type: "OBJECT",
        properties: {
          calories: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          fat: { type: "NUMBER" },
          carbs: { type: "NUMBER" }
        },
        required: ["calories", "protein", "fat", "carbs"]
      },
      rules: { type: "ARRAY", items: { type: "STRING" } },
      firstTasks: { type: "ARRAY", items: { type: "STRING" } },
      mealTemplate: {
        type: "OBJECT",
        properties: {
          breakfast: { type: "STRING" },
          lunch: { type: "STRING" },
          dinner: { type: "STRING" },
          snack: { type: "STRING" }
        },
        required: ["breakfast", "lunch", "dinner", "snack"]
      }
    },
    required: ["title", "strategySummary", "weeklyFocus", "dailyKpi", "rules", "firstTasks", "mealTemplate"]
  } as const;

  const LIMITS = {
    title: 80,
    strategySummary: 520,
    weeklyFocus: 200,
    ruleItem: 110,
    taskItem: 120,
    mealField: 260,
    maxRules: 8,
    maxTasks: 5,
  } as const;

  const isNonEmptyStr = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  const clamp = (s: string, max: number) => {
    const t = (s ?? '').trim().replace(/\s+/g, ' ');
    if (t.length <= max) return t;
    return t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
  };

  const normalizePlan = (p: unknown): AIPlan => {
    const plan = asRecord(p);
    const dailyKpi = asRecord(plan.dailyKpi);
    const mealTemplate = asRecord(plan.mealTemplate);
    const stripMealPrefix = (value: string, label: string) => {
      const raw = String(value || '').trim();
      if (!raw) return raw;
      const rx = new RegExp(`^${label}\\s*[:\\-–—]?\\s*`, 'i');
      return raw.replace(rx, '').trim();
    };
    const normalizeTextList = (value: unknown, maxItems: number, maxLength: number): string[] =>
      stringArray(value, maxItems)
        .map((item) => clamp(item, maxLength))
        .filter(isNonEmptyStr);

    const out: AIPlan = {
      title: clamp(stringValue(plan.title) || 'Ваш AI‑план', LIMITS.title),
      strategySummary: clamp(stringValue(plan.strategySummary), LIMITS.strategySummary),
      weeklyFocus: clamp(stringValue(plan.weeklyFocus), LIMITS.weeklyFocus),
      dailyKpi: {
        calories: finiteNumber(dailyKpi.calories),
        protein: finiteNumber(dailyKpi.protein),
        fat: finiteNumber(dailyKpi.fat),
        carbs: finiteNumber(dailyKpi.carbs),
      },
      rules: normalizeTextList(plan.rules, LIMITS.maxRules, LIMITS.ruleItem),
      firstTasks: normalizeTextList(plan.firstTasks, LIMITS.maxTasks, LIMITS.taskItem),
      mealTemplate: {
        breakfast: clamp(stringValue(mealTemplate.breakfast), LIMITS.mealField),
        lunch: clamp(stringValue(mealTemplate.lunch), LIMITS.mealField),
        dinner: clamp(stringValue(mealTemplate.dinner), LIMITS.mealField),
        snack: clamp(stringValue(mealTemplate.snack), LIMITS.mealField),
      },
      createdAt: optionalString(plan.createdAt) || new Date().toISOString(),
      model: optionalString(plan.model),
    };

    // Ensure minimum content (avoid empty fields)
    if (!isNonEmptyStr(out.strategySummary)) out.strategySummary = 'Умеренный дефицит, акцент на белок и регулярность. Трекаем порции, сон и шаги.';
    if (!isNonEmptyStr(out.weeklyFocus)) out.weeklyFocus = 'Стабильный режим: питание, шаги, силовые 2–3 раза.';
    if (out.rules.length === 0) out.rules = ['Белок в каждом приёме пищи.', 'Вода 2–2.5 л/день.', 'Овощи на половину тарелки в обед/ужин.'];
    if (out.firstTasks.length === 0) out.firstTasks = ['Купить кухонные весы.', 'Запланировать 3 дня питания.', 'Сделать 2 короткие тренировки на неделе.'];
    out.mealTemplate.breakfast = stripMealPrefix(out.mealTemplate.breakfast, 'Завтрак');
    out.mealTemplate.lunch = stripMealPrefix(out.mealTemplate.lunch, 'Обед');
    out.mealTemplate.dinner = stripMealPrefix(out.mealTemplate.dinner, 'Ужин');
    out.mealTemplate.snack = stripMealPrefix(out.mealTemplate.snack, 'Перекус');
    if (!isNonEmptyStr(out.mealTemplate.snack)) out.mealTemplate.snack = 'Творог/йогурт + ягоды или фрукт + 20–30 г орехов.';
    if (!isNonEmptyStr(out.mealTemplate.breakfast)) out.mealTemplate.breakfast = 'Каша/йогурт + фрукты + 1–2 яйца/творог.';
    if (!isNonEmptyStr(out.mealTemplate.lunch)) out.mealTemplate.lunch = 'Белок + гарнир + овощи (например, курица + рис/гречка + салат).';
    if (!isNonEmptyStr(out.mealTemplate.dinner)) out.mealTemplate.dinner = 'Белок + овощи (рыба/мясо/творог + овощи).';
    return out;
  };

  const looksTooLong = (p: AIPlan) => {
    const big = (s: string, max: number) => (s || '').trim().length > max;
    return (
      big(p.strategySummary, LIMITS.strategySummary) ||
      big(p.weeklyFocus, LIMITS.weeklyFocus) ||
      big(p.mealTemplate.breakfast, LIMITS.mealField) ||
      big(p.mealTemplate.lunch, LIMITS.mealField) ||
      big(p.mealTemplate.dinner, LIMITS.mealField) ||
      big(p.mealTemplate.snack, LIMITS.mealField) ||
      (p.rules?.some(r => big(r, LIMITS.ruleItem)) ?? false) ||
      (p.firstTasks?.some(t => big(t, LIMITS.taskItem)) ?? false)
    );
  };

  const basePrompt = `Ты — фитнес-коуч и нутрициолог.\nСоздай персональный план питания и активности для пользователя: ${JSON.stringify(user)}.\nЕсли у пользователя указаны давление, пульс, сахар крови, обхваты, фото прогресса, история замеров или медицинские ограничения, учитывай их при выборе нагрузки, темпа прогрессии, соли и восстановительных рекомендаций.\nСахар крови трактуй так: низкий = не давать агрессивный дефицит и длинные голодные окна; норма = нейтральный контекст; повышен = меньше быстрых углеводов, больше белка и клетчатки, равномернее распределяй углеводы по дню; не меняй ккал-цель, меняй состав и ритм питания.\n\nФормат ответа:\n- Верни ТОЛЬКО валидный JSON без пояснений/markdown.\n- Строго по схеме AIPlan.\n- Будь очень кратким: strategySummary 3–5 предложений, weeklyFocus 1–2 предложения.\n- rules: 5–8 коротких пунктов. firstTasks: 3–5 коротких пунктов.\n- mealTemplate (breakfast/lunch/dinner/snack): 1 строка, максимум ~2 предложения каждое.\n`;

  const repairPrompt = (badJson: unknown) => `Ниже JSON плана, но он слишком длинный/"простыня".\nПерепиши его КОРОТКО и ЧИСТО.\n\nПравила:\n- Верни ТОЛЬКО валидный JSON (без текста, без markdown).\n- Сохрани смысл и числа (ккал/БЖУ), но укороти текст.\n- strategySummary 3–5 предложений, weeklyFocus 1–2 предложения.\n- mealTemplate — по 1 строке на приём пищи, максимум ~2 предложения.\n- rules максимум ${LIMITS.maxRules}, firstTasks максимум ${LIMITS.maxTasks}.\n\nВходной JSON: ${JSON.stringify(badJson)}\n`;

  const applyFallbackKpi = (plan: AIPlan): AIPlan => {
    const targets = calculateDailyTargets(user);
    return {
      ...plan,
      dailyKpi: {
        calories: plan.dailyKpi.calories > 0 ? plan.dailyKpi.calories : targets.calories,
        protein: plan.dailyKpi.protein > 0 ? plan.dailyKpi.protein : targets.protein,
        fat: plan.dailyKpi.fat > 0 ? plan.dailyKpi.fat : targets.fat,
        carbs: plan.dailyKpi.carbs > 0 ? plan.dailyKpi.carbs : targets.carbs,
      },
    };
  };

  // Attempt 1 (schema-enforced)
  const r1 = await callAiProxy('gemini-2.5-pro', basePrompt, 'personal_plan', {
    responseMimeType: "application/json",
    responseSchema: schema
  });

  let plan = applyFallbackKpi(normalizePlan(safeJsonObject(r1.text)));

  // Attempt 2: repair if model returned huge strings
  if (looksTooLong(plan)) {
    const r2 = await callAiProxy('gemini-2.5-pro', repairPrompt(plan), 'personal_plan', {
      responseMimeType: "application/json",
      responseSchema: schema
    });
    const repaired = safeJsonObject(r2.text);
    plan = applyFallbackKpi(normalizePlan(Object.keys(repaired).length ? repaired : plan));
  }

  return plan;
}

/**
 * Объяснение причин плато и рекомендации
 */
export async function generatePlateauExplanation(data: unknown): Promise<string> {
  const response = await callAiProxy('gemini-2.5-flash', 
    `Объясни пользователю причину плато и дай рекомендации. Данные: ${JSON.stringify(data)}. Ответ должен быть на русском языке, дружелюбным и профессиональным.`,
    'plateau'
  );
  return response.text || "Не удалось получить объяснение от AI.";
}

/**
 * Интерпретация еженедельных показателей прогресса
 */
export async function getWeeklyIntelligenceInterpretation(data: unknown): Promise<string> {
  const response = await callAiProxy('gemini-2.5-flash', 
    `Интерпретируй еженедельные результаты пользователя: ${JSON.stringify(data)}. Напиши краткий мотивирующий анализ на 3-4 предложения.`,
    'wis_text'
  );
  return response.text || "Анализ недели не сформирован.";
}

/**
 * Генерация рецепта по изображению
 */
export async function getRecipeFromPhoto(photoBase64: string): Promise<Recipe> {
  const response = await callAiProxy('gemini-2.5-flash', {
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: photoBase64 } },
      { text: 'Напиши пошаговый рецепт этого блюда на русском. Верни JSON с полями: title, servings, timeMinutes, ingredients (массив объектов name, amount), steps (массив объектов n, text, timeMin), tips (массив строк). Для каждого ингредиента указывай amount как короткую измеримую строку: например "200 г", "1 шт.", "150 мл", "1 ст. л.". Если точный вес по фото неизвестен, дай реалистичную оценку, но не оставляй amount пустым без необходимости.' }
    ]
  }, 'recipe', {
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        servings: { type: "NUMBER" },
        timeMinutes: { type: "NUMBER" },
        ingredients: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              amount: { type: "STRING" }
            }
          }
        },
        steps: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              n: { type: "NUMBER" },
              text: { type: "STRING" },
              timeMin: { type: "NUMBER" }
            }
          }
        },
        tips: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["title", "ingredients", "steps"]
    }
  });
  return normalizeRecipe(safeJsonObject(response.text));
}
