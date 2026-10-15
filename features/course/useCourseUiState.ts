import { useEffect, useState } from 'react';
import { parseJson } from '../../safeJson';
import type { CourseLesson, LessonQuizOption, UserProfile } from '../../types';
import { getAccountScopedUiValue, useAccountScopedUiSetter } from '../state/accountScopedUi';

export type CourseUiSnapshot = {
  lessonId: string | null;
  isLessonViewOpen: boolean;
  isQuizActive: boolean;
  selectedQuizOptionId: string | null;
};

export type CourseUiVisibleState = {
  currentLesson: CourseLesson | null;
  isLessonViewOpen: boolean;
  isQuizActive: boolean;
  selectedQuizOption: LessonQuizOption | null;
};

const EMPTY_COURSE_UI_STATE: CourseUiVisibleState = {
  currentLesson: null,
  isLessonViewOpen: false,
  isQuizActive: false,
  selectedQuizOption: null,
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
  const [courseUiHydratedKey, setCourseUiHydratedKey] = useState<string | null>(null);
  const [currentLesson, setCurrentLesson] = useState<CourseLesson | null>(null);
  const [isLessonViewOpen, setIsLessonViewOpen] = useState(false);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [selectedQuizOption, setSelectedQuizOption] = useState<LessonQuizOption | null>(null);

  useEffect(() => {
    if (!currentUser || !courseLibrary || !courseUiStorageKey) return;

    if (courseUiHydratedKey !== courseUiStorageKey) {
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
      setCourseUiHydratedKey(courseUiStorageKey);
      return;
    }

    if (currentLesson) return;
    const nextLesson = pickLessonForToday(currentUser, courseLibrary);
    if (nextLesson) setCurrentLesson(nextLesson);
  }, [courseLibrary, courseUiHydratedKey, courseUiStorageKey, currentLesson, currentUser]);

  useEffect(() => {
    if (!courseUiStorageKey || courseUiHydratedKey !== courseUiStorageKey) return;
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
  }, [courseUiHydratedKey, courseUiStorageKey, currentLesson?.id, isLessonViewOpen, isQuizActive, selectedQuizOption?.id]);

  const visibleState = getAccountScopedUiValue(courseUiStorageKey, courseUiHydratedKey, {
    currentLesson,
    isLessonViewOpen,
    isQuizActive,
    selectedQuizOption,
  }, EMPTY_COURSE_UI_STATE);
  const setCurrentLessonForScope = useAccountScopedUiSetter(courseUiStorageKey, setCurrentLesson);
  const setLessonViewOpenForScope = useAccountScopedUiSetter(courseUiStorageKey, setIsLessonViewOpen);
  const setQuizActiveForScope = useAccountScopedUiSetter(courseUiStorageKey, setIsQuizActive);
  const setSelectedQuizOptionForScope = useAccountScopedUiSetter(courseUiStorageKey, setSelectedQuizOption);

  return {
    currentLesson: visibleState.currentLesson,
    setCurrentLesson: setCurrentLessonForScope,
    isLessonViewOpen: visibleState.isLessonViewOpen,
    setIsLessonViewOpen: setLessonViewOpenForScope,
    isQuizActive: visibleState.isQuizActive,
    setIsQuizActive: setQuizActiveForScope,
    selectedQuizOption: visibleState.selectedQuizOption,
    setSelectedQuizOption: setSelectedQuizOptionForScope,
  };
}
