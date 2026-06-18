import { calculateTDEE } from './profileMath';
import { DEFAULT_DEFICIT, DEFAULT_SURPLUS, AGGRESSIVE_DEFICIT, AGGRESSIVE_SURPLUS } from './constants';
import { buildFallbackAiPlan } from './aiPlanFallback';
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
  lossDeficit?: number;
  gainSurplus?: number;
};

type RegisterFlowDeps = {
  regData: RegDataLike;
  regNameValid: boolean;
  allUsersCount: number;
  requireInvite: boolean;
  inviteCode: string;
  googleMe: { email?: string; sub?: string; picture?: string } | null;
  setPlanError: (message: string | null) => void;
  setLastAiAction: (value: { feature: string; type: 'plan'; userId: string }) => void;
  setDevPlanOverride: (plan: UserProfile['plan'] | '', userId?: string | null) => void;
  generatePersonalPlan: (user: UserProfile) => Promise<UserProfile['aiPlan']>;
  loginAsUser: (user: UserProfile) => Promise<void>;
  setAllUsers: (value: UserProfile[] | ((prev: UserProfile[]) => UserProfile[])) => void;
  setActiveTab: (value: 'dashboard' | 'council' | 'plan' | 'nutrition' | 'recipes' | 'workouts' | 'course' | 'family' | 'settings' | 'pro' | 'admin') => void;
  setPlanIntroOpen: (value: boolean) => void;
  fetchImpl?: typeof fetch;
};

export async function runRegistrationFlow(deps: RegisterFlowDeps): Promise<void> {
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

  if (!deps.regNameValid) return;
  deps.setPlanError(null);

  const safeName = deps.regData.name.trim();
  let newUser: UserProfile = {
    id: `user-${Date.now()}`,
    name: safeName.length ? safeName : 'Пользователь',
    email: deps.googleMe?.email,
    googleSub: deps.googleMe?.sub,
    picture: deps.googleMe?.picture,
    gender: deps.regData.gender,
    weight: Math.max(0, deps.regData.weight || 0),
    height: Math.max(0, deps.regData.height || 0),
    age: Math.max(0, Math.floor(deps.regData.age || 0)),
    activityLevel: deps.regData.activityLevel,
    goal: deps.regData.goal,
    targetWeight: deps.regData.targetWeight,
    adaptationMultiplier: 1.0,
    familyMembers: [],
    exclusions: '',
    medicalRestrictions: deps.regData.medicalRestrictions?.trim() || '',
    lossDeficit: Number(deps.regData.lossDeficit ?? DEFAULT_DEFICIT),
    gainSurplus: Number(deps.regData.gainSurplus ?? DEFAULT_SURPLUS),
    riskAcknowledgedLoss: !!(deps.regData as any).riskAckLoss,
    riskAcknowledgedGain: !!(deps.regData as any).riskAckGain,
    weightHistory: [{ date: new Date().toISOString().slice(0, 10), weight: deps.regData.weight }],
    tasks: [],
    plan: deps.regData.plan,
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

  try {
    const fetchFn = deps.fetchImpl ?? fetch;
    const r = await fetchFn('/api/profile', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    if (r.ok) {
      const pj = await r.json();
      if (pj?.profile) newUser = pj.profile;
    }
  } catch {}

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

  deps.setAllUsers([newUser]);
  await deps.loginAsUser(newUser);
  deps.setActiveTab('plan');
  deps.setPlanIntroOpen(true);
}
