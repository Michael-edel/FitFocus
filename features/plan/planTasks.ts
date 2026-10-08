import type { UserProfile } from '../../types';

/** Toggles exactly one dated plan task while preserving the stored task order and fields. */
export function togglePlanTask(tasks: UserProfile['tasks'], date: string): UserProfile['tasks'] | null {
  if (!tasks) return null;
  return tasks.map((task) => task.date === date ? { ...task, completed: !task.completed } : task);
}