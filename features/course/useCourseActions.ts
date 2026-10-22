import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CourseLesson, LessonQuizOption, UserProfile } from '../../types';
import type { OutboxOperation, OutboxWriteGuard } from '../../storage/durableOutbox';
import { completeCourseLesson, recordCourseQuizAnswer } from './courseProgress';
import type { ProfilePersistOptions } from '../profile/useProfilePersistence';

type PersistUser = (updated: UserProfile, guard?: OutboxWriteGuard, options?: ProfilePersistOptions) => Promise<OutboxOperation | null>;

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
  writeGuard,
  isCurrentSession,
  setIsLessonViewOpen,
  setIsQuizActive,
  setSelectedQuizOption,
  toDayKey,
}: {
  currentUser: UserProfile | null;
  currentLesson: CourseLesson | null;
  selectedQuizOption: LessonQuizOption | null;
  persistUser: PersistUser;
  writeGuard?: OutboxWriteGuard;
  isCurrentSession: () => boolean;
  setIsLessonViewOpen: Dispatch<SetStateAction<boolean>>;
  setIsQuizActive: Dispatch<SetStateAction<boolean>>;
  setSelectedQuizOption: Dispatch<SetStateAction<LessonQuizOption | null>>;
  toDayKey: (date: Date) => string;
}) {
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [lessonSaveError, setLessonSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const closeLessonView = useCallback(() => {
    setIsQuizActive(false);
    setIsLessonViewOpen(false);
    setSelectedQuizOption(null);
  }, [setIsLessonViewOpen, setIsQuizActive, setSelectedQuizOption]);

  const persistLessonProgress = useCallback(async (updated: UserProfile) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSavingLesson(true);
    setLessonSaveError(null);
    try {
      const operation = await persistUser(updated, writeGuard, { durable: true });
      if (!isCurrentSession() || (writeGuard && !writeGuard.canCommit())) return;
      if (operation?.status === 'pending') {
        closeLessonView();
      } else {
        setLessonSaveError('Не удалось сохранить прогресс урока. Попробуйте ещё раз.');
      }
    } catch {
      if (isCurrentSession() && (!writeGuard || writeGuard.canCommit())) {
        setLessonSaveError('Не удалось сохранить прогресс урока. Попробуйте ещё раз.');
      }
    } finally {
      savingRef.current = false;
      setIsSavingLesson(false);
    }
  }, [closeLessonView, isCurrentSession, persistUser, writeGuard]);

  const handleMarkLessonRead = useCallback(async () => {
    if (!currentUser || !currentLesson) return;
    const updated = markCourseLessonRead(currentUser, currentLesson.id, toDayKey(new Date()));
    if (updated) await persistLessonProgress(updated);
    else closeLessonView();
  }, [closeLessonView, currentUser, currentLesson, persistLessonProgress, toDayKey]);

  const handleStartLessonQuiz = useCallback(() => {
    if (!currentLesson?.quiz) return;
    setLessonSaveError(null);
    setSelectedQuizOption(null);
    setIsQuizActive(true);
  }, [currentLesson, setIsQuizActive, setLessonSaveError, setSelectedQuizOption]);

  const handleQuizSubmit = useCallback(async () => {
    if (!currentUser || !currentLesson || !selectedQuizOption) return;
    await persistLessonProgress(submitCourseLessonQuiz(currentUser, currentLesson.id, selectedQuizOption.id, toDayKey(new Date())));
  }, [currentUser, currentLesson, persistLessonProgress, selectedQuizOption, toDayKey]);

  return { closeLessonView, handleMarkLessonRead, handleStartLessonQuiz, handleQuizSubmit, isSavingLesson, lessonSaveError };
}
