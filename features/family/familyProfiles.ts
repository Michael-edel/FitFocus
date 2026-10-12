import { ActivityLevel, Gender, Goal, type UserProfile } from '../../types';
import { isRecord, parseJson } from '../../safeJson';
import type { CloudFamilyMember } from './familyApi';

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join(', ') : '';

/** Shared members are constructed exclusively from the family API, never the account cache. */
export function familyProfiles(owner: UserProfile, members: CloudFamilyMember[] | null): UserProfile[] {
  const other = members === null ? owner.familyMembers.map(member => ({
    id: member.id, name: member.name, gender: member.gender, age: member.age, weight: member.weight,
    height: member.height, activityLevel: member.activityLevel, goal: member.goal, exclusions: member.exclusions ?? '',
  })) : members.filter(member => member.user_id !== owner.id && (!member.status || member.status === 'active')).map(member => {
    const raw = member.restrictions_json ? parseJson(member.restrictions_json) : null;
    const restrictions = isRecord(raw) ? raw : {};
    return { id: member.user_id, name: member.name || 'Участник семьи', gender: member.sex as Gender,
      age: member.age ?? 0, weight: member.weight_kg ?? 0, height: member.height_cm ?? 0,
      activityLevel: member.activity as ActivityLevel, goal: member.goal as Goal,
      exclusions: [member.exclusions, strings(member.dietary?.allergens), strings(member.dietary?.intolerances),
        strings(member.dietary?.excludedFoods), strings(restrictions.allergens), strings(restrictions.intolerances),
        strings(restrictions.excludedFoods), strings(restrictions.forbidden),
        typeof restrictions.notes === 'string' ? restrictions.notes : '', typeof restrictions.exclusions === 'string' ? restrictions.exclusions : ''].filter(Boolean).join('; '),
    };
  });
  return [owner, ...other.filter(member => member.id !== owner.id).map(member => ({ ...member,
    weightHistory: [], targetWeight: member.weight, adaptationMultiplier: 1, familyMembers: [],
  }))];
}

export function usableFamilyProfile(profile: UserProfile): boolean {
  return [Gender.MALE, Gender.FEMALE].includes(profile.gender) && Object.values(Goal).includes(profile.goal)
    && Object.values(ActivityLevel).includes(profile.activityLevel)
    && [profile.age, profile.weight, profile.height].every(value => Number.isFinite(value) && value > 0);
}
