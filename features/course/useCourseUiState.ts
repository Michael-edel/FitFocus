import { useEffect, useRef, useState } from 'react';
import { parseJson } from '../../safeJson';
import type { CourseLesson, LessonQuizOption, UserProfile } from '../../types';

export type CourseUiSnapshot = {
  lessonId: string | null;
  isLessonViewOpen: boolean;
  isQuizActive: boolean;
  selectedQuizOptionId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCourseUiSnapshot(raw: string | null): CourseUiSnapshot | null {
  if (!raw) return null;
  const parsed = parseJson(raw);
  if (
    !isRecord(parsed)
    || (typeof parsed.lessonId !== 'string' && parsed.lessonId !== null)
    || typeof parsed.isLessonViewOpen !== 'boolean'
    || typeof parsed.isQuizActive !== 'boolean'
    || (typeof parsed.selectedQuizOptionId !== 'string' && parsed.selectedQuizOptionId !== null)
  ) {
    return null;
  }
  return {
    lessonId: typeof parsed.lessonId === 'string' ? parsed.lessonId : null,
    isLessonViewOpen: parsed.isLessonViewOpen,
    isQuizActive: parsed.isQuizActive,
    selectedQuizOptionId: typeof parsed.selectedQuizOptionId === 'string' ? parsed.selectedQuizOptionId : null,
  };
}

export function pickLessonForToday(user: UserProfile, lessons: CourseLesson[]): CourseLesson | null {
  if (!lessons.length) return null;
  const completedIds = user.courseProgress?.completedLessonIds || [];
  return lessons.find((lesson) => !completedIds.includes(lesson.id)) || lessons[0];
}

/** Persists the in-progress course view independently for every user. */
export function useCourseUiState({
  currentUser,
  courseLibrary,
}: {
  currentUser: UserProfile | null;
  courseLibrary: CourseLesson[] | null;
}) {
  const courseUiStorageKey = currentUser?.id ? `fitfocus.course.ui.v1:${currentUser.id}` : null;
  const courseUiHydratedKeyRef = useRef<string | null>(null);
  const [currentLesson, setCurrentLesson] = useState<CourseLesson | null>(null);
  const [isLessonViewOpen, setIsLessonViewOpen] = useState(false);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [selectedQuizOption, setSelectedQuizOption] = useState<LessonQuizOption | null>(null);

  useEffect(() => {
    if (!currentUser || !courseLibrary || !courseUiStorageKey) return;

    if (courseUiHydratedKeyRef.current !== courseUiStorageKey) {
      let savedCourseUi: CourseUiSnapshot | null = null;
      try {
        savedCourseUi = parseCourseUiSnapshot(localStorage.getItem(courseUiStorageKey));
      } catch {
        savedCourseUi = null;
      }

      const savedLesson = savedCourseUi?.lessonId
        ? courseLibrary.find((lesson) => lesson.id === savedCourseUi?.lessonId) || null
        : null;
      const nextLesson = savedLesson || pickLessonForToday(currentUser, courseLibrary);
      if (nextLesson) setCurrentLesson(nextLesson);
      setIsLessonViewOpen(Boolean(savedCourseUi?.isLessonViewOpen));
      setIsQuizActive(Boolean(savedCourseUi?.isQuizActive));
      if (nextLesson?.quiz && savedCourseUi?.selectedQuizOptionId) {
        setSelectedQuizOption(nextLesson.quiz.options.find((option) => option.id === savedCourseUi?.selectedQuizOptionId) || null);
      } else {
        setSelectedQuizOption(null);
      }
      courseUiHydratedKeyRef.current = courseUiStorageKey;
      return;
    }

    if (currentLesson) return;
    const nextLesson = pickLessonForToday(currentUser, courseLibrary);
    if (nextLesson) setCurrentLesson(nextLesson);
  }, [courseLibrary, courseUiStorageKey, currentLesson, currentUser]);

  useEffect(() => {
    if (!courseUiStorageKey || courseUiHydratedKeyRef.current !== courseUiStorageKey) return;
    const payload: CourseUiSnapshot = {
      lessonId: currentLesson?.id || null,
      isLessonViewOpen,
      isQuizActive,
      selectedQuizOptionId: selectedQuizOption?.id || null,
    };
    try {
      localStorage.setItem(courseUiStorageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [courseUiStorageKey, currentLesson?.id, isLessonViewOpen, isQuizActive, selectedQuizOption?.id]);

  return {
    currentLesson,
    setCurrentLesson,
    isLessonViewOpen,
    setIsLessonViewOpen,
    isQuizActive,
    setIsQuizActive,
    selectedQuizOption,
    setSelectedQuizOption,
  };
}
