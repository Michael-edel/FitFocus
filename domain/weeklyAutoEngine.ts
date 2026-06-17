import { WeeklyIntelligenceResult } from "./weeklyIntelligence";

export interface WeeklyStoredReport {
  weekKey: string; // YYYY-WW
  createdAt: string;
  data: WeeklyIntelligenceResult;
  aiText?: string;
}

/**
 * Получение ключа текущей недели в формате ГГГГ-НН
 */
function getWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

function storageKey(userId: string) {
  return `fitfocus_data_${userId}_weekly_reports`;
}

const lastAttemptKey = (userId: string) => `ff_last_weekly_ai_attempt_${userId}`;
const inFlightKey = (userId: string) => `ff_weekly_ai_inflight_${userId}`;

function getInFlight(userId: string) {
  try {
    const raw = localStorage.getItem(inFlightKey(userId));
    return raw ? (JSON.parse(raw) as { weekKey: string; startedAt: number }) : null;
  } catch {
    return null;
  }
}

function setInFlight(userId: string, weekKey: string) {
  localStorage.setItem(inFlightKey(userId), JSON.stringify({ weekKey, startedAt: Date.now() }));
}

function clearInFlight(userId: string) {
  localStorage.removeItem(inFlightKey(userId));
}

export function loadWeeklyReports(userId: string): WeeklyStoredReport[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWeeklyReports(userId: string, reports: WeeklyStoredReport[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(reports.slice(-4)));
}

/**
 * Гарантирует наличие отчёта для текущей недели с AI-интерпретацией.
 */
export async function ensureWeeklyReportWithAI(
  userId: string,
  weeklyData: WeeklyIntelligenceResult,
  generateAI: () => Promise<string>
): Promise<{ report: WeeklyStoredReport; isNew: boolean }> {
  const currentWeek = getWeekKey();
  const reports = loadWeeklyReports(userId);

  const existingIdx = reports.findIndex(r => r.weekKey === currentWeek);
  
  if (existingIdx !== -1) {
    const existing = reports[existingIdx];
    // Обновляем данные WIS если они значительно изменились, но не перегенерируем AI текст без нужды
    if (Math.abs(existing.data.wis - weeklyData.wis) > 5) {
      existing.data = weeklyData;
      saveWeeklyReports(userId, reports);
    }
    return { report: existing, isNew: false };
  }

  // Защита от дубля в dev (React StrictMode запускает эффекты дважды)
  const inFlight = getInFlight(userId);
  if (inFlight?.weekKey === currentWeek) {
    // Если генерация стартовала недавно — просто пропускаем, не считаем это ошибкой
    if (Date.now() - inFlight.startedAt < 2 * 60 * 1000) {
      throw new Error("Weekly AI generation already in progress");
    }
    // Если зависло давно — разрешаем перезапуск
    clearInFlight(userId);
  }

  // Проверка на cooldown при прошлых ошибках
  const lastAttempt = Number(localStorage.getItem(lastAttemptKey(userId)) || 0);
  const now = Date.now();
  if (now - lastAttempt < 5 * 60 * 1000) { // 5 минут паузы при ошибках
    throw new Error("Generation on cooldown to prevent API spam");
  }

  try {
    setInFlight(userId, currentWeek);
    const aiText = await generateAI();

    const newReport: WeeklyStoredReport = {
      weekKey: currentWeek,
      createdAt: new Date().toISOString(),
      data: weeklyData,
      aiText
    };

    const updated = [...reports, newReport];
    saveWeeklyReports(userId, updated);
    localStorage.removeItem(lastAttemptKey(userId));
    clearInFlight(userId);

    return { report: newReport, isNew: true };
  } catch (err) {
    // Не ставим cooldown для "мягких" ситуаций (дубль/нет ключа и т.п.)
    const msg = String((err as any)?.message || err || "").toLowerCase();
    const soft = msg.includes("already in progress") || msg.includes("api key") || msg.includes("key") || msg.includes("missing");
    if (!soft) {
      localStorage.setItem(lastAttemptKey(userId), String(Date.now()));
    }
    clearInFlight(userId);
    throw err;
  }
}
