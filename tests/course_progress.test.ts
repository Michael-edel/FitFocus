import { describe, expect, it } from 'vitest';
import { completeCourseLesson, recordCourseQuizAnswer } from '../features/course/courseProgress';

describe('course progress use case', () => {
  it('adds a lesson once and preserves progress metadata', () => {
    expect(completeCourseLesson({ completedLessonIds: ['l1'], streak: 2 }, 'l2', '2026-10-08')).toEqual({
      kind: 'completed', progress: { completedLessonIds: ['l1', 'l2'], streak: 3, lastLessonId: 'l2', lastLessonDate: '2026-10-08' },
    });
    expect(completeCourseLesson({ completedLessonIds: ['l1'], streak: 2 }, 'l1', '2026-10-08')).toEqual({ kind: 'already-complete' });
  });

  it('records quiz answers in their persisted format', () => {
    expect(recordCourseQuizAnswer([{ lessonId: 'l1', optionId: 'a', date: '2026-10-07' }], 'l2', 'b', '2026-10-08')).toEqual([
      { lessonId: 'l1', optionId: 'a', date: '2026-10-07' }, { lessonId: 'l2', optionId: 'b', date: '2026-10-08' },
    ]);
  });
});