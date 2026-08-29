import { Goal, Gender, type UserProfile } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isWeightHistory(value: unknown): value is UserProfile['weightHistory'] {
  return Array.isArray(value) && value.every((item) => (
    isRecord(item)
    && typeof item.date === 'string'
    && isFiniteNumber(item.weight)
  ));
}

function isFamilyMemberList(value: unknown): value is UserProfile['familyMembers'] {
  return Array.isArray(value) && value.every((item) => (
    isRecord(item)
    && typeof item.id === 'string'
    && typeof item.name === 'string'
    && (item.gender === Gender.MALE || item.gender === Gender.FEMALE)
    && isFiniteNumber(item.age)
    && isFiniteNumber(item.weight)
    && isFiniteNumber(item.height)
    && isFiniteNumber(item.activityLevel)
    && (item.goal === Goal.LOSS || item.goal === Goal.MAINTAIN || item.goal === Goal.GAIN)
  ));
}

export function isUserProfilePayload(value: unknown): value is UserProfile {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && value.id.trim().length > 0
    && typeof value.name === 'string'
    && (value.gender === Gender.MALE || value.gender === Gender.FEMALE)
    && isFiniteNumber(value.weight)
    && isFiniteNumber(value.height)
    && isFiniteNumber(value.age)
    && isFiniteNumber(value.activityLevel)
    && (value.goal === Goal.LOSS || value.goal === Goal.MAINTAIN || value.goal === Goal.GAIN)
    && isFiniteNumber(value.targetWeight)
    && isFiniteNumber(value.adaptationMultiplier)
    && isWeightHistory(value.weightHistory)
    && isFamilyMemberList(value.familyMembers)
    && typeof value.exclusions === 'string';
}
