import { calculateTDEE } from './profileMath';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS } from './constants';
import { buildFallbackAiPlan } from './aiPlanFallback';
import { toLocalDayKey } from './dateUtils';
import { clearOAuthContinuationState } from './authSession';
import { persistAllUsersSnapshot } from './storage/hybrid';
import { Goal, type UserProfile } from './types';

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
  setLastAiAction: (value: { feature: string; type: 'plan'; userId: string }) => void;
  setDevPlanOverride: (plan: UserProfile['plan'] | '', userId?: string | null) => void;
  generatePersonalPlan: (user: UserProfile) => Promise<UserProfile['aiPlan']>;
  loginAsUser: (user: UserProfile) => Promise<void>;
  persistUser?: (user: UserProfile) => void;
  setAllUsers: (value: UserProfile[] | ((prev: UserProfile[]) => UserProfile[])) => void;
  setCurrentUser: (value: UserProfile | null) => void;
  setAuthState: (value: 'auth_choice' | 'register' | 'app') => void;
  setActiveTab: (value: 'dashboard' | 'council' | 'plan' | 'nutrition' | 'recipes' | 'workouts' | 'course' | 'family' | 'settings' | 'pro' | 'admin') => void;
  setPlanIntroOpen: (value: boolean) => void;
  fetchImpl?: typeof fetch;
};

export async function runRegistrationFlow(deps: RegisterFlowDeps): Promise<void> {
  if (!deps.googleMe?.sub) {
    deps.setPlanError('Для создания cloud-профиля нужен вход через Google.');
    return;
  }

  if (deps.allUsersCount >= 5) {
    deps.setPlanError('Лимит Family: максимум 5 профилей на одном устройстве.');
    return;
  }

  try {
    const tdee = calculateTDEE({ ...deps.regData, adaptationMultiplier: 1.0 });
    if (isFinite(tdee)) {
      const limit = deps.regData.goal === Goal.LOSS ? Math.min(AGGRESSIVE_DEFICIT, Math.round(tdee * 0.3)) : AGGRESSIVE_SURPLUS;
      const val = deps.regData.goal === Goal.LOSS ? Number(deps.regData.lossDeficit ?? DEFAULT_DEFICIT) : Number(deps.regData.gainSurplus ?? DEFAULT_SURPLUS);
      const isAggressive = (deps.regData.goal === Goal.LOSS && val > limit) || (deps.regData.goal === Goal.GAIN && val > limit);
      const ack = (deps.regData as any).riskAckLoss || (deps.regData as any).riskAckGain;
      if (isAggressive && !ack) {
        deps.setPlanError('Для выбранной интенсивности требуется подтверждение «Я понимаю риски».');
        return;
      }
    }
  } catch {}

  deps.setPlanError(null);

  const safeName =
    deps.regData.name.trim()
    || deps.googleMe?.name?.trim()
    || deps.googleMe?.email?.split('@')[0]?.trim()
    || 'Пользователь';
  let newUser: UserProfile = {
    id: `user-${Date.now()}`,
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
    riskAcknowledgedLoss: !!(deps.regData as any).riskAckLoss,
    riskAcknowledgedGain: !!(deps.regData as any).riskAckGain,
    weightHistory: [{ date: toLocalDayKey(new Date()), weight: deps.regData.weight }],
    progressPhotos: [],
    tasks: [],
    plan: deps.regData.plan,
    onboardingVersion: 2,
    profileDetailsCompleted: false,
  } as UserProfile;

  deps.setDevPlanOverride(deps.regData.plan, newUser.id);

  try {
    deps.setLastAiAction({ feature: 'personal_plan', type: 'plan', userId: newUser.id });
    const aiPlan = await deps.generatePersonalPlan(newUser);
    newUser = { ...newUser, aiPlan };
  } catch {
    deps.setPlanError('Не удалось создать AI-план. Используем базовый план.');
    newUser = { ...newUser, aiPlan: buildFallbackAiPlan(newUser) };
  }

  if (deps.requireInvite && deps.googleMe?.sub) {
    const code = String(deps.inviteCode || '').trim();
    if (!code) {
      deps.setPlanError('Требуется код приглашения.');
      return;
    }
    try {
      const fetchFn = deps.fetchImpl ?? fetch;
      const rr = await fetchFn('/api/invite/redeem', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const rj = await rr.json().catch(() => null);
      if (!rr.ok || rj?.ok !== true) {
        deps.setPlanError(rj?.error === 'INVITE_INVALID' ? 'Код приглашения недействителен или уже использован.' : 'Не удалось активировать приглашение.');
        return;
      }
    } catch {
      deps.setPlanError('Не удалось связаться с сервером для проверки приглашения.');
      return;
    }
  }

  try {
    const fetchFn = deps.fetchImpl ?? fetch;
    const r = await fetchFn('/api/profile', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    const pj = await r.json().catch(() => null);
    if (!r.ok) {
      deps.setPlanError(
        pj?.error === 'ACCESS_REQUIRED'
          ? 'Сервер не разрешил облачное сохранение. Проверьте beta-доступ и повторите вход через Google.'
          : 'Не удалось сохранить профиль в облако. Проверьте соединение и попробуйте ещё раз.',
      );
      return;
    }
    if (pj?.profile) newUser = pj.profile;
  } catch {
    deps.setPlanError('Не удалось сохранить профиль в облако. Проверьте соединение и попробуйте ещё раз.');
    return;
  }

  deps.setCurrentUser(newUser);
  deps.setAllUsers([newUser]);
  deps.persistUser?.(newUser);
  persistAllUsersSnapshot(newUser.id, [newUser]);
  clearOAuthContinuationState();
  deps.setAuthState('app');
  deps.setActiveTab('plan');
  deps.setPlanIntroOpen(true);

  try {
    await deps.loginAsUser(newUser);
  } catch {
    // Keep the freshly created local session if background hydration fails.
    deps.setPlanError('План создан. Вход выполнен локально, облачная синхронизация догрузится автоматически.');
  }
}
