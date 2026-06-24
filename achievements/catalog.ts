export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type AchievementCategory =
  | 'onboarding'
  | 'food'
  | 'ai'
  | 'streak'
  | 'habits'
  | 'progress'
  | 'wis'
  | 'family'
  | 'shopping'
  | 'reports'
  | 'wearable'
  | 'subscription';

export type AchievementDefinition = {
  key: string;
  tier: AchievementTier;
  category: AchievementCategory;
  title: string;
  description: string;
  hidden?: boolean;
};

export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    key: 'welcome',
    tier: 'bronze',
    category: 'onboarding',
    title: 'Первый вход',
    description: 'Профиль FitFocus создан и готов к работе.',
  },
  {
    key: 'first_food_manual',
    tier: 'bronze',
    category: 'food',
    title: 'Первая запись еды',
    description: 'Первый прием пищи добавлен в дневник вручную.',
  },
  {
    key: 'first_ai_photo',
    tier: 'bronze',
    category: 'ai',
    title: 'AI увидел блюдо',
    description: 'Первое блюдо распознано по фото.',
  },
  {
    key: 'first_weight',
    tier: 'bronze',
    category: 'progress',
    title: 'Стартовый вес',
    description: 'Первая запись веса сохранена в истории.',
  },
  {
    key: 'first_measurement',
    tier: 'bronze',
    category: 'progress',
    title: 'Первый замер',
    description: 'Первый замер тела добавлен в прогресс.',
  },
  {
    key: 'first_ai_coach',
    tier: 'bronze',
    category: 'ai',
    title: 'Первый совет AI',
    description: 'AI-коуч подготовил первую рекомендацию.',
  },
  {
    key: 'first_ai_plan',
    tier: 'bronze',
    category: 'ai',
    title: 'AI-план готов',
    description: 'Персональный AI-план создан.',
  },
  {
    key: 'profile_details_completed',
    tier: 'silver',
    category: 'onboarding',
    title: 'Профиль уточнен',
    description: 'Дополнительные параметры профиля заполнены.',
  },
  {
    key: 'food_streak_3',
    tier: 'silver',
    category: 'streak',
    title: 'Три дня контроля',
    description: 'Дневник питания ведется 3 дня подряд.',
  },
  {
    key: 'food_streak_7',
    tier: 'gold',
    category: 'streak',
    title: 'Неделя контроля',
    description: 'Дневник питания ведется 7 дней подряд.',
  },
  {
    key: 'first_wis',
    tier: 'bronze',
    category: 'wis',
    title: 'Первая недельная оценка',
    description: 'WIS рассчитан для первой недели.',
  },
  {
    key: 'wis_share_first',
    tier: 'silver',
    category: 'wis',
    title: 'Поделились прогрессом',
    description: 'Первая WIS-карточка подготовлена для отправки.',
  },
  {
    key: 'first_weekly_menu',
    tier: 'silver',
    category: 'food',
    title: 'Меню на неделю',
    description: 'Первое недельное меню сгенерировано.',
  },
  {
    key: 'first_shopping_item_checked',
    tier: 'bronze',
    category: 'shopping',
    title: 'Покупки начались',
    description: 'Первый продукт отмечен в списке покупок.',
  },
  {
    key: 'first_pdf_report',
    tier: 'bronze',
    category: 'reports',
    title: 'Первый отчет',
    description: 'Первый PDF-отчет сформирован.',
  },
  {
    key: 'first_family_join_or_create',
    tier: 'silver',
    category: 'family',
    title: 'Семейный режим',
    description: 'Семья создана или пользователь присоединился к семье.',
  },
  {
    key: 'ai_photo_10',
    tier: 'gold',
    category: 'ai',
    title: '10 AI-разборов',
    description: '10 блюд разобраны с помощью фото.',
  },
  {
    key: 'weight_loss_1kg',
    tier: 'gold',
    category: 'progress',
    title: 'Минус 1 кг',
    description: 'Вес снизился минимум на 1 кг от стартовой точки.',
  },
  {
    key: 'water_first',
    tier: 'bronze',
    category: 'habits',
    title: 'Вода отмечена',
    description: 'Привычка пить воду отмечена впервые.',
  },
  {
    key: 'sleep_8h_first',
    tier: 'silver',
    category: 'wearable',
    title: '8 часов сна',
    description: 'Сон 8 часов или больше зафиксирован впервые.',
  },
];

export const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENT_CATALOG.map((item) => [item.key, item]));
