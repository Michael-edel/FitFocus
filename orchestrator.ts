import { AIAgent, AIAgentRole, CouncilResponse, UserProfile, FoodItem, UserHabit } from './types';
import { sanitizeWeightHistory, getEffectiveWeight } from './weight';

const AGENTS: AIAgent[] = [
  {
    id: 'architect',
    name: 'Архитектор стратегии',
    specialization: 'Долгосрочное планирование и метаболические циклы',
    systemPrompt: 'Ты - главный архитектор фитнес-стратегии. Твоя задача - смотреть на общую картину: динамику веса за 30 дней, адаптацию и цели. Предлагай системные изменения.'
  },
  {
    id: 'nutritionist',
    name: 'Нутрициолог-биохимик',
    specialization: 'КБЖУ, микронутриенты и гормональный отклик',
    systemPrompt: 'Ты - эксперт по питанию. Твоя задача - анализировать рацион пользователя, баланс белков, жиров и углеводов. Ищи ошибки в выборе продуктов и предлагай замены.'
  },
  {
    id: 'physiologist',
    name: 'Спортивный физиолог',
    specialization: 'Активность, NEAT и тренировочный объем',
    systemPrompt: 'Ты эксперт по движению. Анализируй шаги, тренировки и расход энергии. Предлагай способы оптимизации активности без перетренированности.'
  },
  {
    id: 'psychologist',
    name: 'Психолог поведения',
    specialization: 'Привычки, мотивация и борьба со срывами',
    systemPrompt: 'Ты эксперт по формированию привычек. Анализируй комплаенс (выполнение плана). Ищи психологические триггеры и предлагай мягкие способы закрепления привычек.'
  }
];

export async function runCouncil(
  query: string,
  user: UserProfile,
  history: { diary: FoodItem[], habits: UserHabit[] },
  callModel: (prompt: string, role: AIAgentRole) => Promise<string>
): Promise<CouncilResponse> {
  
  const sanitized = sanitizeWeightHistory(user.weightHistory, user.weight);
  const effectiveWeight = getEffectiveWeight(user.weightHistory, user.weight);
  const goalDelta = user.targetWeight ? Number((user.targetWeight - effectiveWeight).toFixed(1)) : null;

  const context = `
    Пользователь: ${user.name}
    Пол: ${user.gender}, Возраст: ${user.age} лет, Рост: ${user.height} см, Текущий вес для расчётов: ${effectiveWeight} кг.
    Цель: ${user.goal}${user.targetWeight ? `, целевой вес: ${user.targetWeight} кг` : ''}${goalDelta !== null ? `, осталось до цели: ${goalDelta > 0 ? '+' : ''}${goalDelta} кг` : ''}.
    Уровень активности: ${user.activityLevel}.
    Интенсивность: ${user.goal === 'LOSS' ? `дефицит ${user.lossDeficit ?? ''} ккал/день` : user.goal === 'GAIN' ? `профицит ${user.gainSurplus ?? ''} ккал/день` : 'поддержание'}.
    Исключения/ограничения (если есть): ${user.exclusions || 'нет'}.
    Санитизированная история веса (последние 14 записей): ${JSON.stringify(sanitized.history.slice(-14))}.
    Подозрительные записи веса: ${sanitized.anomalies.length ? JSON.stringify(sanitized.anomalies.slice(-6)) : 'не обнаружены'}.
    Привычки: ${JSON.stringify((history.habits || []).slice(-12))}.
    Дневник питания (последние 10 записей): ${JSON.stringify((history.diary || []).slice(-10))}.
    Запрос: "${query}"
  `;

  // 1. ROUTING
  const routerPrompt = `Проанализируй запрос пользователя: "${query}". Выбери ровно 2 агентов из списка [architect, nutritionist, physiologist, psychologist], чья помощь наиболее важна. Верни только ID через запятую.`;
  const selectedRolesRaw = await callModel(routerPrompt, 'chairman');
  const selectedRoles = selectedRolesRaw.split(',').map(s => s.trim() as AIAgentRole).filter(r => AGENTS.find(a => a.id === r));
  
  const activeAgents = AGENTS.filter(a => selectedRoles.includes(a.id));

  // 2. EXPERT THOUGHTS
  const thoughts = await Promise.all(activeAgents.map(async agent => {
    const text = await callModel(`${agent.systemPrompt}\nКонтекст: ${context}\nДай краткое экспертное мнение по запросу. НЕ спрашивай рост/вес/возраст — они уже есть в контексте. Если есть аномальная запись веса, считай её вероятной ошибкой ввода, не ставь диагнозов и не делай жёстких выводов по одной точке. Если данных не хватает, спрашивай только то, чего нет.`, agent.id);
    return { agentId: agent.id, agentName: agent.name, text };
  }));

  // 3. PEER REVIEW
  const peerReviews = await Promise.all(thoughts.map(async (t, i) => {
    const otherThought = thoughts[(i + 1) % thoughts.length];
    const reviewText = await callModel(
      `Ты ${t.agentName}. Проверь мнение коллеги ${otherThought.agentName}: "${otherThought.text}". Есть ли в нем ошибки или противоречия с твоей областью? Ответь кратко.`,
      t.agentId
    );
    return { agentId: t.agentId, agentName: t.agentName, text: reviewText, isReview: true };
  }));

  // 4. SYNTHESIS (Chairman)
  const synthesisPrompt = `
    Ты Председатель Совета. Твоя задача - синтезировать финальный ответ.
    Запрос пользователя: "${query}"
    
    Мнения экспертов:
    ${thoughts.map(t => `[${t.agentName}]: ${t.text}`).join('\n')}
    
    Результаты рецензирования:
    ${peerReviews.map(r => `[${r.agentName} о коллеге]: ${r.text}`).join('\n')}
    
    Сформируй итоговый ответ на русском языке. Ответ должен быть структурированным, дружелюбным и содержать конкретные шаги. Если в истории веса есть аномальная точка, мягко попроси перепроверить запись и не драматизируй. Не используй формулировки вроде «срочно», «опасно», «медицинская проблема» без нескольких подтверждающих фактов. Для расчётов и выводов опирайся на санитизированную историю и текущую цель по весу.
    В конце добавь "Agreement Score: X/100", где X - уровень согласия экспертов.
  `;

  const finalAnswer = await callModel(synthesisPrompt, 'chairman');
  
  const agreementMatch = finalAnswer.match(/Agreement Score: (\d+)/);
  const agreementScore = agreementMatch ? parseInt(agreementMatch[1]) : 85;

  return {
    finalAnswer: finalAnswer.replace(/Agreement Score: \d+\/100/, '').trim(),
    decisionReason: `Запрос обработан агентами: ${activeAgents.map(a => a.name).join(', ')}.`,
    thoughts: [...thoughts, ...peerReviews],
    agreementScore
  };
}