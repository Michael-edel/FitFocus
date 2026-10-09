import type { UserProfile } from '../../types';
import { addWeight } from '../../weight';

const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 500;

/** Validates a dashboard weight draft against the server profile contract before appending history. */
export function recordDashboardWeight(profile: UserProfile, rawWeight: string): { kind: 'invalid' } | { kind: 'recorded'; profile: UserProfile; weight: number } {
  const weight = Number(rawWeight.trim().replace(',', '.'));
  if (!Number.isFinite(weight) || weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) return { kind: 'invalid' };
  return { kind: 'recorded', profile: addWeight(profile, weight), weight };
}