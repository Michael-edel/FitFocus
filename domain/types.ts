export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE'
}

export enum ActivityLevel {
  SEDENTARY = 1.2,
  LIGHTLY_ACTIVE = 1.375,
  MODERATELY_ACTIVE = 1.55,
  VERY_ACTIVE = 1.725,
  EXTRA_ACTIVE = 1.9
}

export enum Goal {
  LOSS = 'LOSS',
  MAINTAIN = 'MAINTAIN',
  GAIN = 'GAIN'
}

export type AppTheme = 'dark' | 'light' | 'violet' | 'calm' | 'premium';
export type AppLanguage = 'ru';

export type TariffPlan = 'free' | 'pro' | 'family';

export type AppSettings = {
  theme: AppTheme;
  language: AppLanguage;
  soundEnabled: boolean;
  musicEnabled: boolean;
};

export interface AIPlan {
  /** короткое название плана, напр. "Дефицит + белок" */
  title: string;
  /** 1-2 предложения: что делаем и зачем */
  strategySummary: string;
  /** что фокусируем на этой неделе (1 строка) */
  weeklyFocus: string;
  /** дневные KPI (ккал/БЖУ) */
  dailyKpi: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  /** 3–6 правил поведения/питания (короткие) */
  rules: string[];
  /** первые 3 задачи (микро, на 1 день) */
  firstTasks: string[];
  /** шаблон дня питания (примеры, коротко) */
  mealTemplate: {
    breakfast: string;
    lunch: string;
    dinner: string;
    snack: string;
  };
  /** служебное */
  createdAt: string;
  model?: string;
  weeklyMenu?: WeeklyMenu;
  /** семейное меню (единая готовка + порции по людям) */
  familyWeeklyMenu?: FamilyWeeklyMenu;
}


export type WeeklyMenuDay = {
  day: string; // "Понедельник" etc
  breakfast: string;
  lunch: string;
  dinner: string;
  snack: string;
};

export type ShoppingListItem = { name: string; grams: number };

export type WeeklyMenu = {
  days: WeeklyMenuDay[];
  shoppingList: string[];
  shoppingListItems?: ShoppingListItem[];
  weekStart?: string;
};

export type FavoriteRecipe = {
  id: string;
  title: string;
  createdAt: string; // ISO
  photo?: string;
  recipe: Recipe;
  sourceFoodName?: string;
};

export interface FamilyMember {
  id: string;
  name: string;
  gender: Gender;
  age: number;
  weight: number;
  height: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  /** индивидуальные исключения (аллергии/не люблю) */
  exclusions?: string;
}

export type FamilyMenuCookingMode = "all_meals" | "once_per_day";

export type FamilyMenuPrefs = {
  /** каких членов семьи учитывать (включая user.id для владельца) */
  includeIds: string[];
  /** готовка: каждый приём или 1 раз в день (ужин + остатки/контейнеры) */
  cookingMode: FamilyMenuCookingMode;
  /** бюджет на неделю (опционально) */
  budgetPerWeek?: number;
  currency?: string;
};

export type FamilyWeeklyMenuMeal = {
  /** базовое блюдо для всех */
  base: string;
  /** порции/вариации по членам семьи: id -> строка */
  portions: Record<string, string>;
};

export type FamilyWeeklyMenuDay = {
  day: string;
  breakfast: FamilyWeeklyMenuMeal;
  lunch: FamilyWeeklyMenuMeal;
  dinner: FamilyWeeklyMenuMeal;
  snack: FamilyWeeklyMenuMeal;
};

export type FamilyWeeklyMenu = {
  prefs: FamilyMenuPrefs;
  days: FamilyWeeklyMenuDay[];
  shoppingList: string[];
};

export type CourseLessonTag = "protein" | "calories" | "habits" | "plateau" | "evening" | "mindset" | "sleep" | "water" | "steps";

export type LessonQuizOption = {
  id: string;
  text: string;
  tag?: "protein" | "habits" | "calories" | "evening" | "mindset";
};

export type LessonQuiz = {
  question: string;
  options: LessonQuizOption[];
};

export type LessonQuizAnswer = {
  lessonId: string;
  optionId: string;
  date: string; // YYYY-MM-DD
};

export interface CourseLesson {
  id: string;
  week: number;
  title: string;
  readTimeSec: number;
  tags: CourseLessonTag[];
  content: string[];
  takeaway: string;
  action: string;
  quiz?: LessonQuiz;
}

export interface CourseProgress {
  completedLessonIds: string[];
  lastLessonDate?: string;
  lastLessonId?: string;
  streak: number;
}

export type PlanTier = "free" | "pro";

export interface UsageStats {
  dayKey?: string;                 // YYYY-MM-DD
  aiFoodPhotoCount?: number;
  aiCoachCount?: number;
  weekKey?: string;                // YYYY-WW
  familyMenuCount?: number;
}

export type DietaryRestrictions = {
  allergens: string[];
  intolerances: string[];
  excludedFoods: string[];
  severity: "strict" | "avoid";
  notes?: string;
};

export interface UserProfile {
  id: string;
  name: string;
  gender: Gender;
  weight: number;
  height: number;
  age: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  weightHistory: { date: string; weight: number }[];
  targetWeight: number;
  adaptationMultiplier: number; 
  lastAdaptationDate?: string;
  lastCheckInDate?: string; 
  familyMembers: FamilyMember[];
  exclusions: string; 
  /** общие семейные исключения (аллергены/запреты, влияет на общую готовку) */
  familyExclusions?: string;
  dietary?: DietaryRestrictions;
  /** пользовательский дефицит для похудения (ккал/день) */
  lossDeficit?: number;
  /** пользовательский профицит для набора (ккал/день) */
  gainSurplus?: number;

  /** подтверждение рисков при агрессивной интенсивности */
  riskAcknowledgedLoss?: boolean;
  riskAcknowledgedGain?: boolean;

  courseProgress?: CourseProgress;
  lessonQuizAnswers?: LessonQuizAnswer[];
  planTier?: PlanTier;
  proUnlockedAt?: string;
  usage?: UsageStats;
  dailyHabits?: Record<string, {
    water: boolean;
    steps: boolean;
    breakfast: boolean;
    sleep: boolean;
  }>;
  tasks?: {
    date: string;
    text: string;
    completed: boolean;
  }[];
  /** тариф: free/pro/family */
  plan?: TariffPlan;
  aiPlan?: AIPlan;
}

export interface NutritionIntake {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export type HighlightArea = {
  /** x в процентах (0..100) относительно изображения */
  x: number;
  /** y в процентах (0..100) относительно изображения */
  y: number;
  /** r в процентах (0..100) относительно min(width,height) */
  r: number;
};

export type FoodIngredient = {
  name: string;
  percent: number; // 0-100
  note?: string;
  highlightArea?: HighlightArea;
};

export type RecipeStep = {
  n: number;
  text: string;
  timeMin?: number;
};

export type Recipe = {
  title: string;
  servings?: number;
  timeMinutes?: number;
  ingredients: Array<{ name: string; amount?: string }>;
  steps: RecipeStep[];
  tips?: string[];
};

export type FoodInsight = {
  calories: number;
  macros: {
    protein: number;
    fat: number;
    carbs: number;
  };
  ingredients: FoodIngredient[];
  notes?: string[];
  recipe?: Recipe;
};

export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  timestamp: string; // ISO datetime
  photo?: string; // data URL
    photoThumb?: string; // small data URL (cropped/resized)
insight?: FoodInsight;
  mealType?: MealType;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodEntry = FoodItem;

export interface WorkoutPlan {
  id: string;
  type: 'CARDIO' | 'STRENGTH' | 'HIIT';
  exercises: {
    name: string;
    sets?: number;
    reps?: number;
    duration?: number;
    intensity?: string;
  }[];
  date: string;
}

export interface Meal {
  name: string;
  description: string;
  caloriesApprox: number;
}

export interface DayPlan {
  day: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  snack: Meal;
}

export interface FamilyMealPlan {
  weekPlan: DayPlan[];
}

export interface CoachLesson {
  id: string;
  title: string;
  content: string;
  duration: string;
}

export interface CoachTask {
  id: string;
  title: string;
  reason: string;
  actionHint: string;
  category?: 'protein' | 'activity' | 'discipline' | 'nutrition';
}

export interface UserHabit {
  id: string;
  title: string;
  goal: number;
  current: number;
  unit: string;
  streak: number;
  lastCompletedDate: string | null;
}

export type UsageCounters = {
  /** ISO дата начала недели (понедельник) */
  weekStart: string;
  /** сколько раз сгенерировали рецепт на этой неделе */
  recipes: number;
};
// === AI Council (Orchestrator v2) ===
export type AIAgentRole = 'architect' | 'nutritionist' | 'physiologist' | 'psychologist' | 'chairman';

export interface AIAgent {
  id: AIAgentRole;
  name: string;
  specialization: string;
  systemPrompt: string;
}

export interface CouncilThought {
  agentId: AIAgentRole;
  agentName: string;
  text: string;
  isReview?: boolean;
}

export interface CouncilResponse {
  finalAnswer: string;
  decisionReason: string;
  thoughts: CouncilThought[];
  agreementScore: number; // 0-100
  contradictions?: string[];
  nextSteps?: string[];
}
