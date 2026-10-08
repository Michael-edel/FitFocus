import type { CoachTask } from '../../types';

/** Toggles exactly one dated plan task while preserving the stored task order and fields. */
export function togglePlanTask(tasks: CoachTask[] | undefined, date: string): CoachTask[] | null {
  if (!tasks) return null;
  return tasks.map((task) => task.date === date ? { ...task, completed: !task.completed } : task);
}