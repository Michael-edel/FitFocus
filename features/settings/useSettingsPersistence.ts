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

type SettingsRepository = Pick<UserStateRepository, 'readJson' | 'writeJson'>;

export function readStoredSettings(repository: SettingsRepository): AppSettings | null {
  return repository.readJson<AppSettings | null>('settings', null, isAppSettings);
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
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (!userId || !repository) {
      hydratedUserIdRef.current = null;
      skipNextSaveRef.current = true;
      setSettings(DEFAULT_APP_SETTINGS);
      return;
    }
    if (hydratedUserIdRef.current === userId) return;

    const stored = readStoredSettings(repository);
    const nextSettings = stored || DEFAULT_APP_SETTINGS;
    hydratedUserIdRef.current = userId;
    skipNextSaveRef.current = true;
    setSettings(nextSettings);
    if (!stored) repository.writeJson('settings', nextSettings);
  }, [repository, userId]);

  useEffect(() => {
    if (!userId || !repository || hydratedUserIdRef.current !== userId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    repository.writeJson('settings', settings);
  }, [repository, settings, userId]);

  return { settings, setSettings };
}
