import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CourseLesson, LessonQuizOption, UserProfile } from '../../types';
import { completeCourseLesson, recordCourseQuizAnswer } from './courseProgress';

type PersistUser = (updated: UserProfile) => void;

export function markCourseLessonRead(user: UserProfile, lessonId: string, date: string): UserProfile | null {
  const completion = completeCourseLesson(user.courseProgress, lessonId, date);
  return completion.kind === 'completed' ? { ...user, courseProgress: completion.progress } : null;
}

export function submitCourseLessonQuiz(user: UserProfile, lessonId: string, optionId: string, date: string): UserProfile {
  return {
    ...user,
    lessonQuizAnswers: recordCourseQuizAnswer(user.lessonQuizAnswers, lessonId, optionId, date),
  };
}

/** Contains the course-view workflow so the application shell only composes it. */
export function useCourseActions({
  currentUser,
  currentLesson,
  selectedQuizOption,
  persistUser,
  setIsLessonViewOpen,
  setIsQuizActive,
  setSelectedQuizOption,
  toDayKey,
}: {
  currentUser: UserProfile | null;
  currentLesson: CourseLesson | null;
  selectedQuizOption: LessonQuizOption | null;
  persistUser: PersistUser;
  setIsLessonViewOpen: Dispatch<SetStateAction<boolean>>;
  setIsQuizActive: Dispatch<SetStateAction<boolean>>;
  setSelectedQuizOption: Dispatch<SetStateAction<LessonQuizOption | null>>;
  toDayKey: (date: Date) => string;
}) {
  const closeLessonView = useCallback(() => {
    setIsQuizActive(false);
    setIsLessonViewOpen(false);
    setSelectedQuizOption(null);
  }, [setIsLessonViewOpen, setIsQuizActive, setSelectedQuizOption]);

  const handleMarkLessonRead = useCallback(() => {
    if (!currentUser || !currentLesson) return;
    const updated = markCourseLessonRead(currentUser, currentLesson.id, toDayKey(new Date()));
    if (updated) persistUser(updated);
    closeLessonView();
  }, [closeLessonView, currentUser, currentLesson, persistUser, toDayKey]);

  const handleStartLessonQuiz = useCallback(() => {
    if (!currentLesson?.quiz) return;
    setSelectedQuizOption(null);
    setIsQuizActive(true);
  }, [currentLesson, setIsQuizActive, setSelectedQuizOption]);

  const handleQuizSubmit = useCallback(() => {
    if (!currentUser || !currentLesson || !selectedQuizOption) return;
    persistUser(submitCourseLessonQuiz(currentUser, currentLesson.id, selectedQuizOption.id, toDayKey(new Date())));
    closeLessonView();
  }, [closeLessonView, currentUser, currentLesson, persistUser, selectedQuizOption, toDayKey]);

  return { closeLessonView, handleMarkLessonRead, handleStartLessonQuiz, handleQuizSubmit };
}
