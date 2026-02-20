import type { Type } from "@google/genai";
import { Recipe, UserProfile, AIPlan, Goal, AIAgentRole, CouncilResponse, FoodItem, UserHabit, WeeklyMenu, FamilyWeeklyMenu, FamilyMenuPrefs, FamilyWeeklyMenuDay } from "./types";
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, MIN_DEFICIT, MAX_DEFICIT, MIN_SURPLUS, MAX_SURPLUS } from "./constants";
import { runCouncil } from "./orchestrator";
import { calculateDailyTargets } from "./profileMath";

// IMPORTANT (SECURITY):
// Ключ Gemini НЕ должен находиться во фронтенде. Любые вызовы Gemini выполняются ТОЛЬКО
// через серверный прокси /api/ai (Vite dev middleware или Cloudflare Functions).

const getEnv = (key: string): string | undefined => {
  try {
    const g: any = globalThis as any;
    return (
      g?.process?.env?.[key] ??
      (import.meta as any)?.env?.[key] ??
      (import.meta as any)?.env?.[`VITE_${key}`] ??
      g?.[key] ??
      // иногда AI Studio прокидывает env в window.__ENV
      g?.__ENV?.[key]
    );
  } catch {
    return undefined;
  }
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Прокси-вызов для AI (используется для соблюдения лимитов на сервере)
 */
async function callAiProxy(model: string, contents: any, feature: string, config?: any) {
  // Всегда используем серверный прокси с лимитами (ключ на сервере).

  // ✅ Нормализуем contents (на всякий случай) — текст всегда Content[]
  if (typeof contents === "string") {
    contents = [{ role: "user", parts: [{ text: contents }] }];
  } else if (contents && !Array.isArray(contents) && Array.isArray((contents as any).parts)) {
    contents = [contents];
  }

  // ✅ Gemini не принимает поле `config` — прокидываем как `generationConfig`
  const basePayload: any = { contents, feature };
  if (config && typeof config === "object") basePayload.generationConfig = config;

  const doReq = async (m: string) => {
    const payload = { ...basePayload, model: m };
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
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
    // Если исчерпан бесплатный лимит гостя — попросим авторизацию
    if (res.status === 402 && (data as any)?.error?.code === "PAYWALL") {
      try {
        window.dispatchEvent(new CustomEvent("ff:auth-required", { detail: (data as any).error }));
      } catch {}
    }
    const msg = (data as any)?.error?.message || (data as any)?.message || `AI proxy error: ${res.status}`;
    throw new Error(msg);
  }

  // Нормализуем ответ: UI ожидает поле `text`,
  // а Gemini API часто возвращает структуру candidates[].content.parts[].text
  const text = extractTextFromGemini(data);
  if (!text || !String(text).trim()) {
    const status = (data && (data.status || data.error?.code)) ? ` (status: ${data.status || data.error?.code})` : "";
    throw new Error(`AI вернул пустой ответ${status}. Возможен safety-block или недоступная модель.`);
  }
  return { ...data, text };
}

function extractTextFromGemini(data: any): string {
  if (data && typeof data.text === "string") return data.text;

  const out: string[] = [];
  const candidates = data?.candidates;
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const parts = c?.content?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (p && typeof p.text === "string") out.push(p.text);
        }
      }
    }
  }

  if (!out.length && typeof data?.output_text === "string") return data.output_text;
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
    return (res as any).text || '';
  };

  return await runCouncil(query, user, { diary, habits }, callModel);
}

// --- Resilience layer (quota/caching) ---
const LS_COOLDOWN_KEY = "ff_gemini_cooldown_until";
const LS_STATUS_KEY = "ff_ai_last_status_v1";
const LS_CACHE_PREFIX = "ff_ai_cache_v1:";
const LS_FEATURE_LASTCALL_PREFIX = "ff_ai_feature_lastcall_v1:";
const LS_LAST_ACTION_KEY = "ff_ai_last_action_v1";

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
let queue: Promise<any> = Promise.resolve();

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
  try { localStorage.setItem(LS_STATUS_KEY, JSON.stringify(s)); } catch {}
};

export const readAiStatus = (): AiLastStatus | null => {
  try {
    const raw = localStorage.getItem(LS_STATUS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AiLastStatus;
  } catch { return null; }
};

const nowMs = () => Date.now();

const getCooldownUntil = (): number => {
  try {
    const v = localStorage.getItem(LS_COOLDOWN_KEY);
    return v ? Number(v) || 0 : 0;
  } catch { return 0; }
};

const setFeatureLastCall = (feature: string) => {
  try { localStorage.setItem(LS_FEATURE_LASTCALL_PREFIX + feature, String(nowMs())); } catch {}
};

const getFeatureLastCall = (feature: string): number => {
  try {
    const v = localStorage.getItem(LS_FEATURE_LASTCALL_PREFIX + feature);
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
      if (k.startsWith(LS_CACHE_PREFIX) || k.startsWith(LS_FEATURE_LASTCALL_PREFIX) || k === LS_COOLDOWN_KEY || k === LS_STATUS_KEY) {
        keys.push(k);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
};

export const allowAiRetryNow = (feature?: string, opts?: { force?: boolean }) => {
  try {
    const now = nowMs();
    const cdRaw = localStorage.getItem(LS_COOLDOWN_KEY);
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
    localStorage.removeItem(LS_COOLDOWN_KEY);
    if (feature) {
      localStorage.removeItem(LS_FEATURE_LASTCALL_PREFIX + feature);
    } else {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith(LS_FEATURE_LASTCALL_PREFIX)) keys.push(k);
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
    if (!action) localStorage.removeItem(LS_LAST_ACTION_KEY);
    else localStorage.setItem(LS_LAST_ACTION_KEY, JSON.stringify(action));
  } catch {}
};

/**
 * Получить последнее действие AI
 */
export const getLastAiAction = (): { feature: string; type: string; userId: string } | null => {
  try {
    const raw = localStorage.getItem(LS_LAST_ACTION_KEY);
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
      shoppingList: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: ["days", "shoppingList"]
  } as const;

  const prompt = `Составь простое меню на 7 дней для пользователя.
Пользователь: ${user.name}, пол: ${user.gender}, возраст: ${user.age}, рост: ${user.height} см, вес: ${user.weight} кг, цель: ${user.goal}.
Дневные KPI: ${plan.dailyKpi.calories} ккал, Б ${plan.dailyKpi.protein} г, Ж ${plan.dailyKpi.fat} г, У ${plan.dailyKpi.carbs} г.
Ограничения (если есть):
- Аллергены (строго): ${(user.dietary?.allergens || []).join(', ') || 'нет'}
- Непереносимость/избегать: ${(user.dietary?.intolerances || []).join(', ') || 'нет'}
- Не ем совсем: ${(user.dietary?.excludedFoods || []).join(', ') || (user.exclusions || 'нет')}
- Строгость: ${user.dietary?.severity || 'strict'}.

Требования:
- Верни СТРОГО валидный JSON по schema (без текста, без markdown).
- 7 дней в массиве days, порядок: Понедельник..Воскресенье.
- Блюда должны быть простые, из доступных продуктов, повторы допустимы.
- Порции в описании коротко (пример: "курица 150г + гречка 80г + салат").
- shoppingList: общий список покупок на неделю, 15–30 пунктов, кратко.`;

  const res = await callAiProxy("gemini-2.5-flash", prompt, "weekly_menu", {
    responseMimeType: "application/json",
    responseSchema: schema
  });

  let obj: any = {};
  try { obj = JSON.parse(res.text || "{}"); } catch { obj = {}; }

  const dayNames = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
  const days = Array.isArray(obj.days) ? obj.days : [];
  const normDays = dayNames.map((dn, i) => {
    const d: any = days[i] || {};
    return {
      day: String(d?.day || dn),
      breakfast: String(d?.breakfast || ""),
      lunch: String(d?.lunch || ""),
      dinner: String(d?.dinner || ""),
      snack: String(d?.snack || "")
    };
  });

  const shoppingList = (Array.isArray(obj.shoppingList) ? obj.shoppingList : [])
    .map((s: any) => String(s).trim())
    .filter(Boolean)
    .slice(0, 40);

  return { days: normDays, shoppingList };
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
    const targets = p.aiPlan?.dailyKpi || calculateDailyTargets(p as any);
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
      shoppingList: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: ["days", "shoppingList"]
  } as const;

  const dayNames = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
  const peopleLine = people.map(p => {
    const t = p.targets;
    return `${p.name} (${p.gender}, ${p.age} лет): цель ${t?.calories ?? "?"} ккал/день; Б${t?.protein ?? "?"} Ж${t?.fat ?? "?"} У${t?.carbs ?? "?"}`;
  }).join("\n");

  const prompt = `Ты — диетолог-организатор меню для семьи.\n\nЗадача: составить единое меню на 7 дней, где готовим ОДНИ и те же блюда для всех,\nно порции/граммовки отличаются под разные калории.\n\nРЕЖИМ ГОТОВКИ: ${prefs.cookingMode === "once_per_day" ? "готовим 1 раз в день (ужин + остатки/контейнеры на следующий день)" : "готовим для каждого приёма пищи"}.\nБЮДЖЕТ (если указан): ${prefs.budgetPerWeek ? `${prefs.budgetPerWeek} ${prefs.currency || ""}` : "не задан"}.\n\nСостав семьи (учесть ВСЕХ ниже):\n${peopleLine}\n\nОБЩИЕ ИСКЛЮЧЕНИЯ (нельзя в общей готовке): ${globalExcl || "нет"}.\nИНДИВИДУАЛЬНЫЕ ИСКЛЮЧЕНИЯ (учесть порциями/заменами): ${individualExcl || "нет"}.\n\nТребования к результату:\n- Верни СТРОГО валидный JSON по schema (без текста, без markdown).\n- days: 7 дней, порядок: Понедельник..Воскресенье.\n- Для каждого приёма: base — одно блюдо для всех (коротко: "рыба + рис + салат").\n- portions — объект вида {"<personId>": "граммовки/порция кратко"}. Должен содержать ВСЕ id из списка семьи.\n- Если есть индивидуальные исключения: делай замены внутри portions (например, без молока, без мёда) НЕ меняя base радикально.\n- Пиши граммовки (пример: "курица 160г + гречка 80г + овощи") и/или количество ("2 яйца").\n- КАЖДАЯ строка portions ОБЯЗАНА содержать: (1) ориентир по общему весу порции, (2) примерные калории.\n  Формат-ориентир: "всего ~420г: курица 160г + рис 80г + салат 180г (≈560 ккал)".\n- Если режим once_per_day: допускаются контейнеры/остатки, но всё равно укажи вес/ккал порции.\n- shoppingList: общий список покупок на неделю, 20–40 пунктов, без запрещённых продуктов.\n\nВажно: не задавай вопросов — входные данные уже переданы.`;

  const res = await callAiProxy("gemini-2.5-flash", prompt, "family_menu", {
    responseMimeType: "application/json",
    responseSchema: schema
  });

  let obj: any = {};
  try { obj = JSON.parse(res.text || "{}"); } catch { obj = {}; }

  const daysRaw = Array.isArray(obj.days) ? obj.days : [];
  const normMeal = (m: any): any => {
    const base = String(m?.base || "").trim();
    const portions = (m && typeof m.portions === "object" && m.portions) ? m.portions : {};
    const normPortions: Record<string, string> = {};
    for (const p of people) {
      normPortions[p.id] = String((portions as any)[p.id] || "").trim();
    }
    return { base, portions: normPortions };
  };

  const normDays: FamilyWeeklyMenuDay[] = dayNames.map((dn, i) => {
    const d: any = daysRaw[i] || {};
    return {
      day: String(d?.day || dn),
      breakfast: normMeal(d?.breakfast),
      lunch: normMeal(d?.lunch),
      dinner: normMeal(d?.dinner),
      snack: normMeal(d?.snack),
    };
  });

  const shoppingList = (Array.isArray(obj.shoppingList) ? obj.shoppingList : [])
    .map((s: any) => String(s).trim())
    .filter(Boolean)
    .slice(0, 60);

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

    try {
      const robj: any = JSON.parse(rep.text || "{}");
      const rdaysRaw = Array.isArray(robj.days) ? robj.days : [];
      const rnormDays: FamilyWeeklyMenuDay[] = dayNames.map((dn, i) => {
        const d: any = rdaysRaw[i] || {};
        return {
          day: String(d?.day || dn),
          breakfast: normMeal(d?.breakfast),
          lunch: normMeal(d?.lunch),
          dinner: normMeal(d?.dinner),
          snack: normMeal(d?.snack),
        };
      });
      const rshoppingList = (Array.isArray(robj.shoppingList) ? robj.shoppingList : shoppingList)
        .map((s: any) => String(s).trim())
        .filter(Boolean)
        .slice(0, 60);
      return { prefs, days: rnormDays, shoppingList: rshoppingList };
    } catch {
      // если ремонт не удался — возвращаем как есть (без падений)
      return { prefs, days: normDays, shoppingList };
    }
  }

  return { prefs, days: normDays, shoppingList };
}

/**
 * Анализ фото еды с использованием Gemini Flash
 */
export async function analyzeFoodPhoto(base64: string): Promise<any> {
  const response = await callAiProxy('gemini-2.5-flash', {
    parts: [
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64,
        },
      },
      {
        text: 'Анализируй это блюдо. Верни JSON с полями: name (название), calories (число), protein (г), fat (г), carbs (г), ingredients (массив объектов с name и percent), notes (массив строк). Ответ строго в формате JSON.',
      },
    ],
  }, 'foodphoto', {
    responseMimeType: "application/json",
    responseSchema: {
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
              percent: { type: "NUMBER" }
            }
          }
        },
        notes: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["name", "calories", "protein", "fat", "carbs", "ingredients"]
    }
  });
  return JSON.parse(response.text || "{}");
}

    // Enhanced re-analysis: stricter prompt, portion grams estimate, more detailed ingredients
    export async function analyzeFoodPhotoEnhanced(base64: string): Promise<any> {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          calories: { type: "number" },
          protein: { type: "number" },
          fat: { type: "number" },
          carbs: { type: "number" },
          ingredients: { type: "array", items: { type: "string" } },
          notes: { type: "array", items: { type: "string" } },
          portionGrams: { type: "number" },
          modelConfidence: { type: "number" }
        },
        required: ["name","calories","protein","fat","carbs","ingredients","notes"]
      };

      const prompt = `Ты — эксперт по нутрициологии и пищевому анализу по фото.
Проанализируй изображение максимально детально.
Обязательно:
- Оцени примерный вес порции (portionGrams) в граммах
- Раздели крем/соусы по типу, если применимо
- Если не уверен, укажи это в notes
- Дай modelConfidence от 0 до 1
Верни строго JSON по схеме.`;

      return callAI({
        feature: "food-photo-enhanced",
        prompt,
        imageBase64: base64,
        schema
      });
    }

/**
 * Получение персонального совета от AI коуча
 */
export async function getCoachAdvice(data: any): Promise<any> {
  const response = await callAiProxy('gemini-2.5-flash', 
    `Ты - персональный фитнес-коуч. Данные пользователя: ${JSON.stringify(data)}. Дай краткий совет на сегодня. Верни JSON с полями title, advice, bullets (массив строк).`,
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
  return JSON.parse(response.text || "{}");
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

  const isNonEmptyStr = (v: any) => typeof v === 'string' && v.trim().length > 0;
  const clamp = (s: string, max: number) => {
    const t = (s ?? '').trim().replace(/\s+/g, ' ');
    if (t.length <= max) return t;
    return t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
  };

  const normalizePlan = (p: any): AIPlan => {
    const plan: any = p && typeof p === 'object' ? p : {};
    const out: any = {
      title: clamp(String(plan.title || 'Ваш AI‑план'), LIMITS.title),
      strategySummary: clamp(String(plan.strategySummary || ''), LIMITS.strategySummary),
      weeklyFocus: clamp(String(plan.weeklyFocus || ''), LIMITS.weeklyFocus),
      dailyKpi: {
        calories: Number(plan?.dailyKpi?.calories ?? 0),
        protein: Number(plan?.dailyKpi?.protein ?? 0),
        fat: Number(plan?.dailyKpi?.fat ?? 0),
        carbs: Number(plan?.dailyKpi?.carbs ?? 0),
      },
      rules: Array.isArray(plan.rules) ? plan.rules.slice(0, LIMITS.maxRules).map((x: any) => clamp(String(x || ''), LIMITS.ruleItem)).filter(isNonEmptyStr) : [],
      firstTasks: Array.isArray(plan.firstTasks) ? plan.firstTasks.slice(0, LIMITS.maxTasks).map((x: any) => clamp(String(x || ''), LIMITS.taskItem)).filter(isNonEmptyStr) : [],
      mealTemplate: {
        breakfast: clamp(String(plan?.mealTemplate?.breakfast || ''), LIMITS.mealField),
        lunch: clamp(String(plan?.mealTemplate?.lunch || ''), LIMITS.mealField),
        dinner: clamp(String(plan?.mealTemplate?.dinner || ''), LIMITS.mealField),
        snack: clamp(String(plan?.mealTemplate?.snack || ''), LIMITS.mealField),
      }
    };

    // Ensure minimum content (avoid empty fields)
    if (!isNonEmptyStr(out.strategySummary)) out.strategySummary = 'Умеренный дефицит, акцент на белок и регулярность. Трекаем порции, сон и шаги.';
    if (!isNonEmptyStr(out.weeklyFocus)) out.weeklyFocus = 'Стабильный режим: питание, шаги, силовые 2–3 раза.';
    if (out.rules.length === 0) out.rules = ['Белок в каждом приёме пищи.', 'Вода 2–2.5 л/день.', 'Овощи на половину тарелки в обед/ужин.'];
    if (out.firstTasks.length === 0) out.firstTasks = ['Купить кухонные весы.', 'Запланировать 3 дня питания.', 'Сделать 2 короткие тренировки на неделе.'];
    if (!isNonEmptyStr(out.mealTemplate.snack)) out.mealTemplate.snack = 'Перекус: творог/йогурт + ягоды или фрукт + 20–30 г орехов.';
    if (!isNonEmptyStr(out.mealTemplate.breakfast)) out.mealTemplate.breakfast = 'Завтрак: каша/йогурт + фрукты + 1–2 яйца/творог.';
    if (!isNonEmptyStr(out.mealTemplate.lunch)) out.mealTemplate.lunch = 'Обед: белок + гарнир + овощи (например, курица + рис/гречка + салат).';
    if (!isNonEmptyStr(out.mealTemplate.dinner)) out.mealTemplate.dinner = 'Ужин: белок + овощи (рыба/мясо/творог + овощи).';
    return out as AIPlan;
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

  const basePrompt = `Ты — фитнес-коуч и нутрициолог.\nСоздай персональный план питания и активности для пользователя: ${JSON.stringify(user)}.\n\nФормат ответа:\n- Верни ТОЛЬКО валидный JSON без пояснений/markdown.\n- Строго по схеме AIPlan.\n- Будь очень кратким: strategySummary 3–5 предложений, weeklyFocus 1–2 предложения.\n- rules: 5–8 коротких пунктов. firstTasks: 3–5 коротких пунктов.\n- mealTemplate (breakfast/lunch/dinner/snack): 1 строка, максимум ~2 предложения каждое.\n`;

  const repairPrompt = (badJson: any) => `Ниже JSON плана, но он слишком длинный/"простыня".\nПерепиши его КОРОТКО и ЧИСТО.\n\nПравила:\n- Верни ТОЛЬКО валидный JSON (без текста, без markdown).\n- Сохрани смысл и числа (ккал/БЖУ), но укороти текст.\n- strategySummary 3–5 предложений, weeklyFocus 1–2 предложения.\n- mealTemplate — по 1 строке на приём пищи, максимум ~2 предложения.\n- rules максимум ${LIMITS.maxRules}, firstTasks максимум ${LIMITS.maxTasks}.\n\nВходной JSON: ${JSON.stringify(badJson)}\n`;

  // Attempt 1 (schema-enforced)
  const r1 = await callAiProxy('gemini-2.5-pro', basePrompt, 'personal_plan', {
    responseMimeType: "application/json",
    responseSchema: schema
  });

  let parsed: any;
  try { parsed = JSON.parse(r1.text || "{}"); } catch { parsed = {}; }
  let plan = normalizePlan(parsed);

  // FIX B: если модель вернула нули/пустые KPI, берём из профиля, чтобы не было "0 ккал".
  const targets = calculateDailyTargets(user as any);
  plan.dailyKpi = plan.dailyKpi || ({} as any);
  if (!(plan.dailyKpi.calories > 0)) plan.dailyKpi.calories = targets.calories;
  if (!(plan.dailyKpi.protein > 0)) plan.dailyKpi.protein = targets.protein;
  if (!(plan.dailyKpi.fat > 0)) plan.dailyKpi.fat = targets.fat;
  if (!(plan.dailyKpi.carbs > 0)) plan.dailyKpi.carbs = targets.carbs;

  // Attempt 2: repair if model returned huge strings
  if (looksTooLong(plan)) {
    const r2 = await callAiProxy('gemini-2.5-pro', repairPrompt(plan), 'personal_plan', {
      responseMimeType: "application/json",
      responseSchema: schema
    });
    let parsed2: any;
    try { parsed2 = JSON.parse(r2.text || "{}"); } catch { parsed2 = plan; }
    plan = normalizePlan(parsed2);
  }

  return plan;
}

/**
 * Объяснение причин плато и рекомендации
 */
export async function generatePlateauExplanation(data: any): Promise<string> {
  const response = await callAiProxy('gemini-2.5-flash', 
    `Объясни пользователю причину плато и дай рекомендации. Данные: ${JSON.stringify(data)}. Ответ должен быть на русском языке, дружелюбным и профессиональным.`,
    'plateau'
  );
  return response.text || "Не удалось получить объяснение от AI.";
}

/**
 * Интерпретация еженедельных показателей прогресса
 */
export async function getWeeklyIntelligenceInterpretation(data: any): Promise<string> {
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
      { text: 'Напиши пошаговый рецепт этого блюда. Верни JSON с полями: title, servings, timeMinutes, ingredients (массив объектов name, amount), steps (массив объектов n, text, timeMin), tips (массив строк).' }
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
  return JSON.parse(response.text || "{}");
}