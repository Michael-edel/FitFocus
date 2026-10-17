import { Gender, Goal, type UserProfile } from '../../types';

export const userProfile = (id = 'account-a', extra: Partial<UserProfile> = {}): UserProfile => ({
  id, name: 'Тест', version: 2, gender: Gender.FEMALE, weight: 70, height: 170,
  age: 35, activityLevel: 1.2, goal: Goal.LOSS, targetWeight: 65, adaptationMultiplier: 1,
  weightHistory: [], familyMembers: [], exclusions: '', ...extra,
} as UserProfile);
