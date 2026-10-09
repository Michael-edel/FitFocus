import { WeeklyIntelligenceResult } from "./weeklyIntelligence";
import { isRecord, parseJson } from "./safeJson";
import { UserStateRepository } from "./storage/userStateRepository";

export interface WeeklyStoredReport {
  weekKey: string; // YYYY-WW
  createdAt: string;
  data: WeeklyIntelligenceResult;
  aiText?: string;
}

function safeJsonParse(text: string): unknown | null {
  return parseJson(text);
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

const lastAttemptKey = (userId: string) => `ff_last_weekly_ai_attempt_${userId}`;
const inFlightKey = (userId: string) => `ff_weekly_ai_inflight_${userId}`;

function getInFlight(userId: string) {
  try {
    const raw = localStorage.getItem(inFlightKey(userId));
    const parsed = raw ? safeJsonParse(raw) : null;
    return isRecord(parsed) && typeof parsed.weekKey === "string" && typeof parsed.startedAt === "number"
      ? { weekKey: parsed.weekKey, startedAt: parsed.startedAt }
      : null;
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

export async function loadWeeklyReports(userId: string, repository = new UserStateRepository(userId)): Promise<WeeklyStoredReport[]> {
  return repository.readJsonAsync(
    'weekly_reports',
    [],
    (value): value is WeeklyStoredReport[] => Array.isArray(value) && value.every(isWeeklyStoredReport),
  );
}

function isWeeklyIntelligenceResult(value: unknown): value is WeeklyIntelligenceResult {
  if (!isRecord(value)) return false;
  return [value.wis, value.weightDelta7, value.weightDelta30, value.compliance, value.adaptationIndex]
    .every((item) => typeof item === 'number' && Number.isFinite(item))
    && (value.status === 'excellent' || value.status === 'stable' || value.status === 'adjust' || value.status === 'critical');
}

function isWeeklyStoredReport(value: unknown): value is WeeklyStoredReport {
  return isRecord(value)
    && typeof value.weekKey === 'string'
    && typeof value.createdAt === 'string'
    && isWeeklyIntelligenceResult(value.data)
    && (value.aiText === undefined || typeof value.aiText === 'string');
}

async function saveWeeklyReports(repository: UserStateRepository, reports: WeeklyStoredReport[]): Promise<void> {
  const operation = await repository.writeJson('weekly_reports', reports.slice(-4));
  if (operation.status === 'conflicted') throw new Error('WEEKLY_REPORT_STORAGE_CONFLICT');
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
  const repository = new UserStateRepository(userId);
  const reports = await loadWeeklyReports(userId, repository);

  const existingIdx = reports.findIndex(r => r.weekKey === currentWeek);
  
  if (existingIdx !== -1) {
    const existing = reports[existingIdx];
    // Обновляем данные WIS если они значительно изменились, но не перегенерируем AI текст без нужды
    if (Math.abs(existing.data.wis - weeklyData.wis) > 5) {
      existing.data = weeklyData;
      await saveWeeklyReports(repository, reports);
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
    await saveWeeklyReports(repository, updated);
    localStorage.removeItem(lastAttemptKey(userId));
    clearInFlight(userId);

    return { report: newReport, isNew: true };
  } catch (error: unknown) {
    // Не ставим cooldown для "мягких" ситуаций (дубль/нет ключа и т.п.)
    const msg = String(error instanceof Error ? error.message : error || "").toLowerCase();
    const soft = msg.includes("already in progress") || msg.includes("api key") || msg.includes("key") || msg.includes("missing");
    if (!soft) {
      localStorage.setItem(lastAttemptKey(userId), String(Date.now()));
    }
    clearInFlight(userId);
    throw error;
  }
}
