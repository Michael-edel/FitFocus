
import { UserProfile } from './types';

export function addWeight(profile: UserProfile, weight: number): UserProfile {
  const date = new Date().toISOString().slice(0, 10);
  const weightHistory = [...(profile.weightHistory || []), { date, weight }];
  return {
    ...profile,
    weight,
    weightHistory
  };
}

export function weightDelta(log: { date: string; weight: number }[] | undefined, days: number): number {
  if (!log || log.length < 2) return 0;
  const now = log[log.length - 1];
  
  // Ищем запись, которая была как минимум `days` дней назад
  const past = log.slice().reverse().find(
    (e) =>
      new Date(now.date).getTime() - new Date(e.date).getTime() >=
      days * 86400000
  );
  
  if (!past) return 0;
  return now.weight - past.weight;
}
