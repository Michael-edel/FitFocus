import { describe, expect, it } from 'vitest';
import { Goal, type CourseLesson, type UserProfile } from '../types';
import {
  parseCourseUiSnapshot,
  pickLessonForToday,
} from '../features/course/useCourseUiState';

const lessons = [
  { id: 'l1', title: 'Первый урок' },
  { id: 'l2', title: 'Второй урок' },
] as CourseLesson[];

describe('course UI feature', () => {
  it('accepts only complete persisted course UI state', () => {
    expect(parseCourseUiSnapshot(JSON.stringify({
      lessonId: 'l2',
      isLessonViewOpen: true,
      isQuizActive: false,
      selectedQuizOptionId: null,
    }))).toEqual({
      lessonId: 'l2',
      isLessonViewOpen: true,
      isQuizActive: false,
      selectedQuizOptionId: null,
    });
    expect(parseCourseUiSnapshot('{"lessonId":"l2"}')).toBeNull();
    expect(parseCourseUiSnapshot('{not-json')).toBeNull();
  });

  it('chooses the first unfinished lesson and cycles safely after completion', () => {
    const user = { id: 'user-1', goal: Goal.LOSS, courseProgress: { completedLessonIds: ['l1'], streak: 1 } } as UserProfile;
    expect(pickLessonForToday(user, lessons)?.id).toBe('l2');

    const completed = { ...user, courseProgress: { completedLessonIds: ['l1', 'l2'], streak: 2 } };
    expect(pickLessonForToday(completed, lessons)?.id).toBe('l1');
  });
});
