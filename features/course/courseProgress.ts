import type { CourseProgress, LessonQuizAnswer } from '../../types';

export type LessonCompletion = { kind: 'already-complete' } | { kind: 'completed'; progress: CourseProgress };

/** Builds the persisted course progress update without coupling lesson completion to a screen. */
export function completeCourseLesson(
  progress: CourseProgress | undefined,
  lessonId: string,
  date: string,
): LessonCompletion {
  const current = progress || { completedLessonIds: [], streak: 0 };
  if (current.completedLessonIds.includes(lessonId)) return { kind: 'already-complete' };
  return {
    kind: 'completed',
    progress: {
      completedLessonIds: [...current.completedLessonIds, lessonId],
      lastLessonDate: date,
      lastLessonId: lessonId,
      streak: (current.streak || 0) + 1,
    },
  };
}

/** Appends an answer in the existing course profile format. */
export function recordCourseQuizAnswer(
  answers: LessonQuizAnswer[] | undefined,
  lessonId: string,
  optionId: string,
  date: string,
): LessonQuizAnswer[] {
  return [...(answers || []), { lessonId, optionId, date }];
}