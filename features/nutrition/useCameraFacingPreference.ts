import { useEffect, useMemo, useState } from 'react';
import { getAccountScopedUiValue, useAccountScopedUiSetter } from '../state/accountScopedUi';

export type CameraFacing = 'user' | 'environment';

export function parseCameraFacing(value: string | null): CameraFacing {
  return value === 'user' ? 'user' : 'environment';
}

/** Restores the per-profile camera direction before allowing a new save. */
export function useCameraFacingPreference(userId: string | null | undefined, allowCachedUiStateRestore = true) {
  const storageKey = useMemo(
    () => `fitfocus.nutrition.camera-facing.v1:${userId ?? 'anon'}`,
    [userId],
  );
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('environment');

  useEffect(() => {
    if (!allowCachedUiStateRestore) {
      setCameraFacing('environment');
      setHydratedStorageKey(null);
      return;
    }
    try {
      setCameraFacing(parseCameraFacing(localStorage.getItem(storageKey)));
    } catch {
      setCameraFacing('environment');
    }
    setHydratedStorageKey(storageKey);
  }, [allowCachedUiStateRestore, storageKey]);

  useEffect(() => {
    if (!allowCachedUiStateRestore || hydratedStorageKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, cameraFacing);
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [allowCachedUiStateRestore, cameraFacing, hydratedStorageKey, storageKey]);

  const setCameraFacingForScope = useAccountScopedUiSetter(storageKey, setCameraFacing, allowCachedUiStateRestore);
  return {
    cameraFacing: getAccountScopedUiValue(storageKey, hydratedStorageKey, cameraFacing, 'environment', allowCachedUiStateRestore),
    setCameraFacing: setCameraFacingForScope,
  };
}
