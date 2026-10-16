import { WeeklyIntelligenceResult } from "./weeklyIntelligence";
import { isRecord, parseJson } from "./safeJson";
import { UserStateRepository } from "./storage/userStateRepository";
import type { OutboxCommitGuard } from "./storage/durableOutbox";

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
      ? {
        weekKey: parsed.weekKey,
        startedAt: parsed.startedAt,
        ...(typeof parsed.runId === 'string' ? { runId: parsed.runId } : {}),
        ...(typeof parsed.sessionKey === 'string' ? { sessionKey: parsed.sessionKey } : {}),
      }
      : null;
  } catch {
    return null;
  }
}

function setInFlight(userId: string, weekKey: string, sessionKey?: string) {
  const runId = crypto.randomUUID();
  localStorage.setItem(inFlightKey(userId), JSON.stringify({ weekKey, startedAt: Date.now(), runId, sessionKey }));
  return runId;
}

function clearInFlight(userId: string, expectedRunId?: string) {
  const inFlight = getInFlight(userId);
  if (!inFlight || inFlight.runId !== expectedRunId) return;
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

async function saveWeeklyReports(repository: UserStateRepository, reports: WeeklyStoredReport[], guard?: OutboxCommitGuard): Promise<void> {
  const operation = await repository.writeJson('weekly_reports', reports.slice(-4), guard);
  if (operation.status === 'conflicted') throw new Error('WEEKLY_REPORT_STORAGE_CONFLICT');
}

function commitSessionKey(guard?: OutboxCommitGuard): string | undefined {
  if (!guard) return undefined;
  const { accountId, sessionEpoch, serverSessionId, authFence } = guard.readGuard;
  return JSON.stringify([accountId, sessionEpoch, serverSessionId, authFence]);
}

/**
 * Гарантирует наличие отчёта для текущей недели с AI-интерпретацией.
 */
export async function ensureWeeklyReportWithAI(
  userId: string,
  weeklyData: WeeklyIntelligenceResult,
  generateAI: () => Promise<string>,
  commitGuard?: OutboxCommitGuard,
): Promise<{ report: WeeklyStoredReport; isNew: boolean }> {
  const currentWeek = getWeekKey();
  const repository = new UserStateRepository(userId);
  const assertCurrent = async () => {
    if (!commitGuard) return;
    if (!commitGuard.canCommit() || !await repository.isReadSessionCurrent(commitGuard.readGuard) || !commitGuard.canCommit()) {
      throw new Error('WEEKLY_REPORT_SESSION_CHANGED');
    }
  };
  await assertCurrent();
  const reports = await loadWeeklyReports(userId, repository);
  await assertCurrent();

  const existingIdx = reports.findIndex(r => r.weekKey === currentWeek);
  
  if (existingIdx !== -1) {
    const existing = reports[existingIdx];
    // Обновляем данные WIS если они значительно изменились, но не перегенерируем AI текст без нужды
    if (Math.abs(existing.data.wis - weeklyData.wis) > 5) {
      existing.data = weeklyData;
      await assertCurrent();
      await saveWeeklyReports(repository, reports, commitGuard);
    }
    return { report: existing, isNew: false };
  }

  // Защита от дубля в dev (React StrictMode запускает эффекты дважды)
  const sessionKey = commitSessionKey(commitGuard);
  const inFlight = getInFlight(userId);
  if (inFlight?.weekKey === currentWeek) {
    // A run from an earlier login must not block this session's report generation.
    if (inFlight.sessionKey === sessionKey && Date.now() - inFlight.startedAt < 2 * 60 * 1000) {
      throw new Error("Weekly AI generation already in progress");
    }
    clearInFlight(userId, inFlight.runId);
  }

  // Проверка на cooldown при прошлых ошибках
  const lastAttempt = Number(localStorage.getItem(lastAttemptKey(userId)) || 0);
  const now = Date.now();
  if (now - lastAttempt < 5 * 60 * 1000) { // 5 минут паузы при ошибках
    throw new Error("Generation on cooldown to prevent API spam");
  }

  let runId: string | undefined;
  try {
    await assertCurrent();
    runId = setInFlight(userId, currentWeek, sessionKey);
    const aiText = await generateAI();
    await assertCurrent();

    const newReport: WeeklyStoredReport = {
      weekKey: currentWeek,
      createdAt: new Date().toISOString(),
      data: weeklyData,
      aiText
    };

    const updated = [...reports, newReport];
    await saveWeeklyReports(repository, updated, commitGuard);
    await assertCurrent();
    localStorage.removeItem(lastAttemptKey(userId));
    clearInFlight(userId, runId);

    return { report: newReport, isNew: true };
  } catch (error: unknown) {
    // Не ставим cooldown для "мягких" ситуаций (дубль/нет ключа и т.п.)
    const msg = String(error instanceof Error ? error.message : error || "").toLowerCase();
    const soft = msg.includes("already in progress") || msg.includes("api key") || msg.includes("key") || msg.includes("missing");
    if (!soft && (!commitGuard || (commitGuard.canCommit() && await repository.isReadSessionCurrent(commitGuard.readGuard)))) {
      localStorage.setItem(lastAttemptKey(userId), String(Date.now()));
    }
    if (runId) clearInFlight(userId, runId);
    throw error;
  }
}
