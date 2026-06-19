import React, { useRef } from 'react';

type TouchPoint = {
  x: number;
  y: number;
};

type ModalDismissGestureHandlers = {
  onTouchStart: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
};

export function useModalDismissGestures(onClose: () => void): ModalDismissGestureHandlers {
  const startRef = useRef<TouchPoint | null>(null);
  const lastRef = useRef<TouchPoint | null>(null);

  const reset = () => {
    startRef.current = null;
    lastRef.current = null;
  };

  const onTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const point = { x: touch.clientX, y: touch.clientY };
    startRef.current = point;
    lastRef.current = point;
  };

  const onTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    if (!startRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    lastRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = () => {
    const start = startRef.current;
    const last = lastRef.current;
    if (!start || !last) {
      reset();
      return;
    }

    const deltaX = last.x - start.x;
    const deltaY = last.y - start.y;
    const isHorizontalSwipe = Math.abs(deltaX) > 70 && Math.abs(deltaY) < 120;
    if (isHorizontalSwipe) onClose();

    reset();
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}
