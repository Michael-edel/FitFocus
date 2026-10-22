import { DEFAULT_DEFICIT, DEFAULT_SURPLUS } from './constants';
import { registrationError, registrationRisk } from './registrationValidation';
import { buildFallbackAiPlan } from './aiPlanFallback';
import { toLocalDayKey } from './dateUtils';
import { clearOAuthContinuationState } from './authSession';
import { UserStateRepository } from './storage/userStateRepository';
import { createProfileIntent } from './storage/profileState';
import { Goal, type UserProfile } from './types';
import { isRecord } from './safeJson';
import { assertAiSession, prepareAiSession, type AiSession } from './services/aiSession';
import { isOutboxWriteSessionChanged, type OutboxLocalCommitGuard, type OutboxReadGuard } from './storage/durableOutbox';
import { SessionReadError } from './storage/sessionRead';
import { requestJson } from './storage/sessionTransport';

const REGISTRATION_REQUEST_TIMEOUT_MS = 12_000;

type RegDataLike = {
  name: string;
  gender: UserProfile['gender'];
  weight: number;
  height: number;
  age: number;
  activityLevel: UserProfile['activityLevel'];
  goal: UserProfile['goal'];
  targetWeight: number;
  plan: UserProfile['plan'];
  medicalRestrictions?: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  restingPulse?: number;
  bloodGlucoseMmolL?: number;
  waistCm?: number;
  chestCm?: number;
  hipsCm?: number;
  lossDeficit?: number;
  gainSurplus?: number;
  riskAckLoss?: boolean;
  riskAckGain?: boolean;
};

function deriveTargetWeight(weight: number, goal: UserProfile['goal']): number {
  const baseWeight = Number.isFinite(weight) && weight > 0 ? weight : 0;
  if (!baseWeight) return 0;
  if (goal === Goal.LOSS) return Number(Math.max(40, baseWeight * 0.9).toFixed(1));
  if (goal === Goal.GAIN) return Number(Math.max(baseWeight + 1, baseWeight * 1.05).toFixed(1));
  return Number(baseWeight.toFixed(1));
}

type RegisterFlowDeps = {
  regData: RegDataLike;
  regNameValid: boolean;
  allUsersCount: number;
  requireInvite: boolean;
  inviteCode: string;
  googleMe: { email?: string; name?: string; sub?: string; picture?: string } | null;
  setPlanError: (message: string | null) => void;
  setLastAiAction: (value: { feature: string; type: 'plan'; userId: string; actionId?: string }) => void;
  setDevPlanOverride: (plan: UserProfile['plan'] | '', userId?: string | null) => void;
  generatePersonalPlan: (user: UserProfile, session: AiSession) => Promise<UserProfile['aiPlan']>;
  prepareSession?: typeof prepareAiSession;
  controller?: AbortController;
  loginAsUser: (user: UserProfile, readGuard?: OutboxReadGuard) => Promise<void>;
  isCurrentSession: () => boolean;
  getProfileWriteGuard: () => Promise<OutboxLocalCommitGuard | null>;
  setActiveTab: (value: 'dashboard' | 'council' | 'plan' | 'nutrition' | 'recipes' | 'workouts' | 'course' | 'family' | 'settings' | 'pro' | 'admin') => void;
  setPlanIntroOpen: (value: boolean) => void;
  fetchImpl?: typeof fetch;
};

export async function runRegistrationFlow(deps: RegisterFlowDeps): Promise<void> {
  const isCurrent = deps.isCurrentSession;
  if (!isCurrent()) return;
  if (!deps.googleMe?.sub) {
    deps.setPlanError('Для создания cloud-профиля нужен вход через Google.');
    return;
  }

  if (deps.allUsersCount >= 5) {
    deps.setPlanError('Лимит Family: максимум 5 профилей на одном устройстве.');
    return;
  }

  const invalid = registrationError(deps.regData);
  if (invalid) { deps.setPlanError(invalid); return; }
  const risk = registrationRisk(deps.regData);
  if (risk && !risk.acknowledged) {
    deps.setPlanError('Для выбранной интенсивности требуется подтверждение «Я понимаю риски».');
    return;
  }

  deps.setPlanError(null);

  const safeName =
    deps.regData.name.trim()
    || deps.googleMe?.name?.trim()
    || deps.googleMe?.email?.split('@')[0]?.trim()
    || 'Пользователь';
  let newUser: UserProfile = {
    id: deps.googleMe.sub,
    version: 0,
    name: safeName,
    email: deps.googleMe?.email,
    googleSub: deps.googleMe?.sub,
    picture: deps.googleMe?.picture,
    gender: deps.regData.gender,
    weight: Math.max(0, deps.regData.weight || 0),
    height: Math.max(0, deps.regData.height || 0),
    age: Math.max(0, Math.floor(deps.regData.age || 0)),
    activityLevel: deps.regData.activityLevel,
    goal: deps.regData.goal,
    targetWeight: Number(deps.regData.targetWeight) > 0
      ? Number(Number(deps.regData.targetWeight).toFixed(1))
      : deriveTargetWeight(deps.regData.weight, deps.regData.goal),
    adaptationMultiplier: 1.0,
    familyMembers: [],
    exclusions: '',
    medicalRestrictions: deps.regData.medicalRestrictions?.trim() || '',
    bloodPressureSystolic: Number(deps.regData.bloodPressureSystolic || 0) > 0 ? Math.floor(Number(deps.regData.bloodPressureSystolic)) : undefined,
    bloodPressureDiastolic: Number(deps.regData.bloodPressureDiastolic || 0) > 0 ? Math.floor(Number(deps.regData.bloodPressureDiastolic)) : undefined,
    bloodPressureMeasuredAt: Number(deps.regData.bloodPressureSystolic || 0) > 0 && Number(deps.regData.bloodPressureDiastolic || 0) > 0 ? new Date().toISOString() : undefined,
    bloodGlucoseMmolL: Number(deps.regData.bloodGlucoseMmolL || 0) > 0 ? Number(Number(deps.regData.bloodGlucoseMmolL).toFixed(1)) : undefined,
    bloodGlucoseMeasuredAt: Number(deps.regData.bloodGlucoseMmolL || 0) > 0 ? new Date().toISOString() : undefined,
    waistCm: Number(deps.regData.waistCm || 0) > 0 ? Math.floor(Number(deps.regData.waistCm)) : undefined,
    chestCm: Number(deps.regData.chestCm || 0) > 0 ? Math.floor(Number(deps.regData.chestCm)) : undefined,
    hipsCm: Number(deps.regData.hipsCm || 0) > 0 ? Math.floor(Number(deps.regData.hipsCm)) : undefined,
    bodyMeasurementsMeasuredAt: Number(deps.regData.waistCm || 0) > 0 || Number(deps.regData.chestCm || 0) > 0 || Number(deps.regData.hipsCm || 0) > 0 ? new Date().toISOString() : undefined,
    restingPulse: Number(deps.regData.restingPulse || 0) > 0 ? Math.floor(Number(deps.regData.restingPulse)) : undefined,
    restingPulseMeasuredAt: Number(deps.regData.restingPulse || 0) > 0 ? new Date().toISOString() : undefined,
    measurementsHistory: [{
      date: new Date().toISOString(),
      weight: Math.max(0, deps.regData.weight || 0),
      waistCm: Number(deps.regData.waistCm || 0) > 0 ? Math.floor(Number(deps.regData.waistCm)) : undefined,
      chestCm: Number(deps.regData.chestCm || 0) > 0 ? Math.floor(Number(deps.regData.chestCm)) : undefined,
      hipsCm: Number(deps.regData.hipsCm || 0) > 0 ? Math.floor(Number(deps.regData.hipsCm)) : undefined,
      bloodPressureSystolic: Number(deps.regData.bloodPressureSystolic || 0) > 0 ? Math.floor(Number(deps.regData.bloodPressureSystolic)) : undefined,
      bloodPressureDiastolic: Number(deps.regData.bloodPressureDiastolic || 0) > 0 ? Math.floor(Number(deps.regData.bloodPressureDiastolic)) : undefined,
      restingPulse: Number(deps.regData.restingPulse || 0) > 0 ? Math.floor(Number(deps.regData.restingPulse)) : undefined,
      bloodGlucoseMmolL: Number(deps.regData.bloodGlucoseMmolL || 0) > 0 ? Number(Number(deps.regData.bloodGlucoseMmolL).toFixed(1)) : undefined,
    }],
    lossDeficit: Number(deps.regData.lossDeficit ?? DEFAULT_DEFICIT),
    gainSurplus: Number(deps.regData.gainSurplus ?? DEFAULT_SURPLUS),
    riskAcknowledgedLoss: !!deps.regData.riskAckLoss,
    riskAcknowledgedGain: !!deps.regData.riskAckGain,
    weightHistory: [{ date: toLocalDayKey(new Date()), weight: deps.regData.weight }],
    progressPhotos: [],
    tasks: [],
    plan: deps.regData.plan,
    onboardingVersion: 2,
    profileDetailsCompleted: false,
  } as UserProfile;

  newUser = { ...newUser, aiPlan: buildFallbackAiPlan(newUser) };
  const controller = deps.controller ?? new AbortController();
  const target = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : undefined;
  let pageHidden = false;
  const hide = () => { pageHidden = true; controller.abort(); };

  if (deps.requireInvite && deps.googleMe?.sub) {
    const code = String(deps.inviteCode || '').trim();
    if (!code) {
      deps.setPlanError('Требуется код приглашения.');
      return;
    }
    target?.addEventListener('beforeunload', hide, { once: true });
    target?.addEventListener('pagehide', hide, { once: true });
    try {
      const fetchFn = deps.fetchImpl ?? fetch;
      const meResult = await requestJson(fetchFn, '/api/me', { method: 'GET' }, controller, REGISTRATION_REQUEST_TIMEOUT_MS);
      const me = meResult.body;
      if (!isCurrent() || controller.signal.aborted) return;
      const proof = isRecord(me) ? me.stateSync : null;
      const capability = isRecord(me) ? me.inviteSync : null;
      if (!meResult.response.ok || !isRecord(me) || !isRecord(me.user) || me.user.sub !== newUser.id
        || !isRecord(proof) || proof.accountId !== newUser.id || proof.protocol !== 2 || proof.guard !== 1
        || typeof proof.sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(proof.sessionId)
        || !isRecord(capability) || capability.protocol !== 1 || capability.guard !== 1) {
        deps.setPlanError('Сессия или безопасная активация приглашений недоступна. Повторите вход.');
        return;
      }
      const redeem = await requestJson(fetchFn, '/api/invite/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-FitFocus-State-Account': newUser.id, 'X-FitFocus-State-Session': proof.sessionId },
        body: JSON.stringify({ code }),
      }, controller, REGISTRATION_REQUEST_TIMEOUT_MS);
      if (!isCurrent() || controller.signal.aborted) return;
      const redeemResponse = redeem.body ?? {};
      if (!redeem.response.ok || redeemResponse.ok !== true || redeem.response.headers.get('X-FitFocus-Invite-Guard') !== '1'
        || redeem.response.headers.get('X-FitFocus-State-Account') !== newUser.id
        || redeem.response.headers.get('X-FitFocus-State-Session') !== proof.sessionId) {
        deps.setPlanError(redeemResponse.error === 'INVITE_INVALID' ? 'Код приглашения недействителен или уже использован.' : 'Не удалось активировать приглашение.');
        return;
      }
    } catch {
      if (isCurrent() && !pageHidden) deps.setPlanError('Не удалось связаться с сервером для проверки приглашения.');
      return;
    } finally {
      target?.removeEventListener('beforeunload', hide);
      target?.removeEventListener('pagehide', hide);
    }
  }

  if (!isCurrent() || controller.signal.aborted) return;
  target?.addEventListener('beforeunload', hide, { once: true });
  target?.addEventListener('pagehide', hide, { once: true });
  const repository = new UserStateRepository(newUser.id);
  try {
    const profileWriteGuard = await deps.getProfileWriteGuard();
    if (!isCurrent() || controller.signal.aborted) {
      target?.removeEventListener('beforeunload', hide);
      target?.removeEventListener('pagehide', hide);
      return;
    }
    if (!profileWriteGuard) {
      deps.setPlanError('Сессия изменилась. Повторите вход перед созданием профиля.');
      target?.removeEventListener('beforeunload', hide);
      target?.removeEventListener('pagehide', hide);
      return;
    }
    await createProfileIntent(newUser, repository, profileWriteGuard);
  } catch (error) {
    if (isCurrent() && !pageHidden) deps.setPlanError(isOutboxWriteSessionChanged(error)
      ? 'Сессия изменилась. Повторите вход перед созданием профиля.'
      : error instanceof Error && error.message.startsWith('PROFILE_')
        ? 'На устройстве уже есть профиль или конфликт создания. Повторите вход, чтобы восстановить его.'
        : 'Не удалось сохранить профиль на устройстве. Освободите место и повторите сохранение.');
    target?.removeEventListener('beforeunload', hide);
    target?.removeEventListener('pagehide', hide);
    return;
  }
  if (!isCurrent() || controller.signal.aborted) {
    target?.removeEventListener('beforeunload', hide);
    target?.removeEventListener('pagehide', hide);
    return;
  }
  deps.setDevPlanOverride(deps.regData.plan, newUser.id);
  const aiIsCurrent = () => isCurrent() && !controller.signal.aborted;
  let aiSession: AiSession | undefined;
  let aiPlan: UserProfile['aiPlan'];
  try {
    try {
      aiSession = await (deps.prepareSession ?? prepareAiSession)(newUser.id, controller, aiIsCurrent, { allowInitialSession: true });
      if (!aiIsCurrent()) return;
      deps.setLastAiAction({ feature: 'personal_plan', type: 'plan', userId: newUser.id, actionId: crypto.randomUUID() });
      aiPlan = await deps.generatePersonalPlan(newUser, aiSession);
    } catch (error) {
      if (!aiIsCurrent()) return;
      if (aiSession) {
        try {
          await assertAiSession(aiSession);
        } catch {
          if (aiIsCurrent()) deps.setPlanError('Сессия изменилась или больше не подтверждена. Повторите вход перед генерацией плана.');
          return;
        }
        if (!aiIsCurrent()) return;
      } else if (error instanceof SessionReadError) {
        deps.setPlanError('Не удалось подтвердить AI-сессию. Повторите вход перед генерацией плана.');
        return;
      }
      deps.setPlanError('Не удалось создать AI-план. Используется ранее сохранённый базовый план.');
    }
    if (!aiIsCurrent()) return;
    if (aiPlan && aiSession) {
      try {
        const generated = { ...newUser, aiPlan };
        const operation = await repository.writeJson('profile', generated, {
          readGuard: { ...aiSession.guard }, canCommit: aiIsCurrent,
        });
        if (!aiIsCurrent()) return;
        if (operation.status !== 'pending') deps.setPlanError('AI-план не сохранён. Базовый профиль остался на устройстве.');
        else newUser = generated;
      } catch {
        if (!aiIsCurrent()) return;
        deps.setPlanError('AI-план не удалось сохранить. Базовый профиль сохранён на устройстве.');
      }
    }
  } finally {
    target?.removeEventListener('beforeunload', hide);
    target?.removeEventListener('pagehide', hide);
  }
  if (!isCurrent()) return;
  try {
    await deps.loginAsUser(newUser, aiSession?.guard);
  } catch {
    if (isCurrent()) deps.setPlanError('Профиль сохранён на устройстве. Повторите вход для его восстановления.');
    return;
  }
  if (!isCurrent()) return;
  clearOAuthContinuationState();
  deps.setActiveTab('plan');
  deps.setPlanIntroOpen(true);
}
