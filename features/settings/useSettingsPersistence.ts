import { useEffect, useRef, useState } from 'react';
import type { UserStateRepository } from '../../storage/userStateRepository';
import type { AppSettings } from '../../types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'ru',
  soundEnabled: false,
  musicEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAppSettings(value: unknown): value is AppSettings {
  return isRecord(value)
    && (value.theme === 'dark' || value.theme === 'light' || value.theme === 'violet' || value.theme === 'calm' || value.theme === 'premium')
    && value.language === 'ru'
    && typeof value.soundEnabled === 'boolean'
    && typeof value.musicEnabled === 'boolean';
}

type SettingsRepository = Pick<UserStateRepository, 'readJsonAsync' | 'writeJson'>;

export function readStoredSettings(repository: SettingsRepository): Promise<AppSettings | null> {
  return repository.readJsonAsync<AppSettings | null>('settings', null, isAppSettings);
}

/** Keeps settings scoped to the active profile without writing stale state during hydration. */
export function useSettingsPersistence({
  userId,
  repository,
}: {
  userId: string | null | undefined;
  repository: SettingsRepository | null;
}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const hydratedUserIdRef = useRef<string | null>(null);
  const loadedSettingsRef = useRef<AppSettings | null>(null);

  useEffect(() => {
    if (!userId || !repository) {
      hydratedUserIdRef.current = null;
      loadedSettingsRef.current = null;
      setSettings(DEFAULT_APP_SETTINGS);
      return;
    }
    hydratedUserIdRef.current = null;
    loadedSettingsRef.current = null;
    let active = true;
    void readStoredSettings(repository).then((stored) => {
      if (!active) return;
      hydratedUserIdRef.current = userId;
      const next = stored ?? DEFAULT_APP_SETTINGS;
      loadedSettingsRef.current = next;
      setSettings(next);
    }).catch(() => { /* The shared storage notice reports the failure; do not save defaults. */ });
    return () => { active = false; };
  }, [repository, userId]);

  useEffect(() => {
    if (!userId || !repository || hydratedUserIdRef.current !== userId) return;
    if (loadedSettingsRef.current === settings) return;
    loadedSettingsRef.current = settings;
    repository.writeJson('settings', settings);
  }, [repository, settings, userId]);

  return { settings, setSettings };
}
