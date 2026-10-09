import { useEffect, useMemo, useRef, useState } from 'react';

export type CameraFacing = 'user' | 'environment';

export function parseCameraFacing(value: string | null): CameraFacing {
  return value === 'user' ? 'user' : 'environment';
}

/** Restores the per-profile camera direction before allowing a new save. */
export function useCameraFacingPreference(userId: string | null | undefined) {
  const storageKey = useMemo(
    () => `fitfocus.nutrition.camera-facing.v1:${userId ?? 'anon'}`,
    [userId],
  );
  const skipNextSaveRef = useRef(false);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('environment');

  useEffect(() => {
    skipNextSaveRef.current = true;
    try {
      setCameraFacing(parseCameraFacing(localStorage.getItem(storageKey)));
    } catch {
      setCameraFacing('environment');
    }
  }, [storageKey]);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, cameraFacing);
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [cameraFacing, storageKey]);

  return { cameraFacing, setCameraFacing };
}
