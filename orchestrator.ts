import { AIAgent, AIAgentRole, CouncilResponse, UserProfile, FoodItem, UserHabit, CouncilVote } from './types';

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

const formatBloodPressure = (user: UserProfile) => {
  const systolic = Number(user.bloodPressureSystolic || 0);
  const diastolic = Number(user.bloodPressureDiastolic || 0);
  if (!systolic || !diastolic) return 'нет';
  return `${Math.round(systolic)}/${Math.round(diastolic)} мм рт. ст.`;
};

export async function runCouncil(
  query: string,
  user: UserProfile,
  history: { diary: FoodItem[], habits: UserHabit[] },
  callModel: (prompt: string, role: AIAgentRole) => Promise<string>
): Promise<CouncilResponse> {
  
  const context = `
    Пользователь: ${user.name}
    Пол: ${user.gender}, Возраст: ${user.age} лет, Рост: ${user.height} см, Вес: ${user.weight} кг.
    Цель: ${user.goal}${user.targetWeight ? `, целевой вес: ${user.targetWeight} кг` : ''}.
    Уровень активности: ${user.activityLevel}.
    Интенсивность: ${user.goal === 'LOSS' ? `дефицит ${user.lossDeficit ?? ''} ккал/день` : user.goal === 'GAIN' ? `профицит ${user.gainSurplus ?? ''} ккал/день` : 'поддержание'}.
    Исключения/ограничения (если есть): ${user.exclusions || 'нет'}.
    Медицинские ограничения (если есть): ${user.medicalRestrictions || 'нет'}.
    Давление: ${formatBloodPressure(user)}.
    Пульс покоя: ${user.restingPulse ? `${Math.round(Number(user.restingPulse))} уд/мин` : 'нет'}.
    Обхваты тела: ${[
      user.waistCm ? `талия ${Math.round(Number(user.waistCm))} см` : null,
      user.chestCm ? `грудь ${Math.round(Number(user.chestCm))} см` : null,
      user.hipsCm ? `бедра ${Math.round(Number(user.hipsCm))} см` : null,
    ].filter(Boolean).join(', ') || 'нет'}.
    Фото прогресса: ${Array.isArray(user.progressPhotos) ? `${user.progressPhotos.length} шт.` : 'нет'}.
    Последний замер: ${JSON.stringify((user.measurementsHistory || []).slice(0, 1))}.
    История веса (последние 14 записей): ${JSON.stringify((user.weightHistory || []).slice(-14))}.
    Привычки: ${JSON.stringify((history.habits || []).slice(-12))}.
    Дневник питания (последние 10 записей): ${JSON.stringify((history.diary || []).slice(-10))}.
    Запрос: "${query}"
  `;

  // 1. ROUTING / BRIEFING
  // Always involve all 4 experts so the council behaves like a true multi-disciplinary board.
  const routerPrompt = `Проанализируй запрос пользователя: "${query}". Кратко определи приоритеты обсуждения для всех 4 экспертов: architect, nutritionist, physiologist, psychologist. Не выбирай подмножество, а дай короткий бриф по каждому направлению.`;
  const routerBrief = await callModel(routerPrompt, 'chairman');
  const activeAgents = AGENTS;

  // 2. EXPERT THOUGHTS
  const thoughts = await Promise.all(activeAgents.map(async agent => {
    const text = await callModel(`${agent.systemPrompt}\nКонтекст: ${context}\nДай краткое экспертное мнение по запросу. НЕ спрашивай рост/вес/возраст — они уже есть в контексте. Если данных не хватает, спрашивай только то, чего нет.`, agent.id);
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
    
    Сформируй итоговый ответ на русском языке. Ответ должен быть структурированным, дружелюбным и содержать конкретные шаги.
    В конце добавь "Agreement Score: X/100", где X - уровень согласия экспертов.
  `;

  const draftAnswer = await callModel(synthesisPrompt, 'chairman');

  // 5. VOTING
  const voteChecks = await Promise.all(activeAgents.map(async (agent): Promise<CouncilVote> => {
    const votePrompt = `
      Ты ${agent.name}. Оцени финальный черновик ответа председателя для запроса "${query}".
      Черновик:
      ${draftAnswer}

      Верни строго в формате:
      stance: approve|adjust|reject
      score: 0-100
      reason: краткое объяснение одной фразой
    `;
    const raw = await callModel(votePrompt, agent.id);
    const stanceMatch = raw.match(/stance:\s*(approve|adjust|reject)/i);
    const scoreMatch = raw.match(/score:\s*(\d{1,3})/i);
    const reasonMatch = raw.match(/reason:\s*(.+)$/im);
    const score = Math.max(0, Math.min(100, scoreMatch ? parseInt(scoreMatch[1], 10) : 75));
    const stance = (stanceMatch?.[1]?.toLowerCase() as CouncilVote['stance']) || (score >= 80 ? 'approve' : score >= 55 ? 'adjust' : 'reject');
    return {
      agentId: agent.id,
      agentName: agent.name,
      stance,
      score,
      reason: (reasonMatch?.[1] || raw).trim().slice(0, 220),
    };
  }));

  const voteAverage = Math.round(voteChecks.reduce((sum, vote) => sum + vote.score, 0) / Math.max(1, voteChecks.length));
  const approveCount = voteChecks.filter(v => v.stance === 'approve').length;
  const adjustCount = voteChecks.filter(v => v.stance === 'adjust').length;
  const rejectCount = voteChecks.filter(v => v.stance === 'reject').length;
  const votesSummary = `Голоса: ${approveCount} approve, ${adjustCount} adjust, ${rejectCount} reject.`;

  const needsRevision = voteAverage < 70 || rejectCount > 0 || adjustCount >= 3;
  let finalAnswer = draftAnswer.replace(/Agreement Score: \d+\/100/, '').trim();
  let decisionReason = `Запрос обработан всеми 4 экспертами. ${votesSummary} Бриф председателя: ${routerBrief}`;
  let nextSteps: string[] = [];
  let contradictions: string[] = [];

  if (needsRevision) {
    const critiqueSummary = voteChecks
      .map((v) => `${v.agentName}: ${v.stance} (${v.score}) — ${v.reason}`)
      .join('\n');
    const revisionPrompt = `
      Ты Председатель Совета. Перепиши финальный ответ на основе замечаний экспертов.
      Важно:
      - сохрани полезные части ответа;
      - убери или смягчи спорные места;
      - если данных недостаточно, прямо обозначь это;
      - сделай ответ короче и предсказуемее;
      - не добавляй новые не подтверждённые факты;
      - если есть конфликт мнений, выбери более осторожную формулировку.

      Запрос: "${query}"

      Черновик:
      ${draftAnswer}

      Замечания экспертов:
      ${critiqueSummary}

      Верни только обновлённый финальный ответ на русском языке.
    `;
    const revisedAnswer = await callModel(revisionPrompt, 'chairman');
    if (revisedAnswer && revisedAnswer.trim()) {
      finalAnswer = revisedAnswer.trim();
      decisionReason = `Ответ доработан по итогам голосования. ${votesSummary} Бриф председателя: ${routerBrief}`;
      nextSteps = [
        'Использовать более осторожную формулировку при низком согласии экспертов',
        'Снимать спорные рекомендации в пользу ближайших безопасных шагов',
      ];
      contradictions = voteChecks
        .filter((v) => v.stance !== 'approve')
        .map((v) => `${v.agentName}: ${v.reason}`);
    }
  }

  return {
    finalAnswer,
    decisionReason,
    thoughts: [...thoughts, ...peerReviews],
    votes: voteChecks,
    agreementScore: voteAverage,
    contradictions,
    nextSteps
  };
}
