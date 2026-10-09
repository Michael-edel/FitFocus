import { describe, expect, it } from 'vitest';
import { completeCourseLesson, recordCourseQuizAnswer } from '../features/course/courseProgress';
import { markCourseLessonRead, submitCourseLessonQuiz } from '../features/course/useCourseActions';
import { ActivityLevel, Gender, Goal, type UserProfile } from '../types';

const user = (): UserProfile => ({
  id: 'course-user', name: 'Course user', gender: Gender.MALE, weight: 70, height: 175, age: 30,
  activityLevel: ActivityLevel.MODERATELY_ACTIVE, goal: Goal.LOSS, weightHistory: [], targetWeight: 65,
  adaptationMultiplier: 1, familyMembers: [], exclusions: '',
});

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

  it('returns a complete profile update for course actions without mutating the current profile', () => {
    const current = user();
    const completed = markCourseLessonRead(current, 'l1', '2026-10-09');
    expect(completed?.courseProgress).toEqual({ completedLessonIds: ['l1'], lastLessonDate: '2026-10-09', lastLessonId: 'l1', streak: 1 });
    expect(markCourseLessonRead(completed!, 'l1', '2026-10-09')).toBeNull();
    expect(submitCourseLessonQuiz(current, 'l1', 'option-a', '2026-10-09').lessonQuizAnswers).toEqual([
      { lessonId: 'l1', optionId: 'option-a', date: '2026-10-09' },
    ]);
    expect(current.courseProgress).toBeUndefined();
    expect(current.lessonQuizAnswers).toBeUndefined();
  });
});
