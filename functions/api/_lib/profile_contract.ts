import { asBoolean, asFiniteNumber, isJsonObject, type JsonObject } from './json';

type NumericRule = readonly [minimum: number, maximum: number];

const NUMERIC_FIELDS: Record<string, NumericRule> = {
  weight: [20, 500],
  targetWeight: [20, 500],
  height: [50, 300],
  age: [0, 130],
  activityLevel: [0, 10],
  bloodPressureSystolic: [30, 300],
  bloodPressureDiastolic: [20, 200],
  bloodGlucoseMmolL: [0.5, 50],
  waistCm: [10, 300],
  chestCm: [10, 300],
  hipsCm: [10, 300],
  restingPulse: [10, 300],
  wearableStepsToday: [0, 200_000],
  wearableActiveMinutesToday: [0, 1_440],
  wearableSleepHoursLastNight: [0, 24],
};

const BOOLEAN_FIELDS = new Set([
  'wearableEnabled',
  'profileDetailsCompleted',
  'riskAcknowledgedLoss',
  'riskAcknowledgedGain',
]);

const SHORT_TEXT_FIELDS = new Set([
  'name',
  'gender',
  'goal',
  'wearableProvider',
  'wearableMetricsDayKey',
]);

/**
 * Keeps legacy and feature-owned fields intact while making critical health and
 * wearable values predictable for every profile reader and writer.
 */
export function normalizeProfileRecord(input: unknown): JsonObject {
  if (!isJsonObject(input)) return {};
  const profile: JsonObject = { ...input };

  for (const [field, [minimum, maximum]] of Object.entries(NUMERIC_FIELDS)) {
    if (!(field in profile)) continue;
    const number = asFiniteNumber(profile[field]);
    if (number === null || number < minimum || number > maximum) delete profile[field];
    else profile[field] = number;
  }

  for (const field of BOOLEAN_FIELDS) {
    if (field in profile) profile[field] = asBoolean(profile[field]);
  }

  for (const field of SHORT_TEXT_FIELDS) {
    if (!(field in profile)) continue;
    if (typeof profile[field] !== 'string') {
      delete profile[field];
      continue;
    }
    const text = profile[field].trim();
    if (!text || text.length > 160) delete profile[field];
    else profile[field] = text;
  }

  return profile;
}
