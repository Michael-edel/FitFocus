export const MACRO_RATIOS = {
  LOSS: { protein: 0.3, fat: 0.3, carbs: 0.4 },
  MAINTAIN: { protein: 0.25, fat: 0.25, carbs: 0.5 },
  GAIN: { protein: 0.3, fat: 0.2, carbs: 0.5 }
};

export const EQUIPMENT = [
  'Беговая дорожка',
  'Велотренажер',
  'Шведская стенка',
  'Турник'
];

export const INITIAL_USERS = [
  {
    id: 'user-1',
    name: 'Мужчина',
    gender: 'MALE',
    weight: 99,
    height: 185,
    age: 35,
    activityLevel: 1.375,
    goal: 'LOSS',
    targetWeight: 90,
    weightHistory: [
      { date: '2023-10-01', weight: 112 },
      { date: '2024-01-15', weight: 95 },
      { date: '2024-05-20', weight: 99 }
    ]
  },
  {
    id: 'user-2',
    name: 'Женщина',
    gender: 'FEMALE',
    weight: 70,
    height: 165,
    age: 30,
    activityLevel: 1.375,
    goal: 'LOSS',
    targetWeight: 60,
    weightHistory: [
      { date: '2024-05-01', weight: 75 },
      { date: '2024-05-20', weight: 70 }
    ]
  }
];

export const APP_NAME = "FitFocus";

// Настраиваемые смещения по умолчанию
export const DEFAULT_DEFICIT = 500;
export const DEFAULT_SURPLUS = 300;

// Smart Deficit Engine safety bounds (kcal/day)
export const MIN_DEFICIT = 100;
export const MAX_DEFICIT = 1000;
export const MIN_SURPLUS = 50;
export const MAX_SURPLUS = 800;

// Soft thresholds for warnings (kcal/day)
export const AGGRESSIVE_DEFICIT = 750;
export const AGGRESSIVE_SURPLUS = 500;

// Ссылки оплаты (замени на реальные)
export const PAYMENT_LINKS = {
  pro: null,
  family: null,
  kaspi: null as null | string,
  card: null as null | string,
};