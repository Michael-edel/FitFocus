import { useEffect, useRef, useState } from 'react';
import type { UserStateRepository } from '../../storage/userStateRepository';
import type { OutboxLocalCommitGuard, OutboxReadGuard } from '../../storage/durableOutbox';
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
type ScopedSettingsRepository = SettingsRepository & Pick<UserStateRepository, 'accountId' | 'isLocalCommitSessionCurrent' | 'writeLocalJson'>;

export function readStoredSettings(repository: SettingsRepository): Promise<AppSettings | null> {
  return repository.readJsonAsync<AppSettings | null>('settings', null, isAppSettings);
}

/** Keeps settings scoped to the active profile without writing stale state during hydration. */
export function useSettingsPersistence({
  userId,
  repository,
  loginGuard,
  isCurrentSession,
}: {
  userId: string | null | undefined;
  repository: ScopedSettingsRepository | null;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const hydratedUserIdRef = useRef<string | null>(null);
  const loadedSettingsRef = useRef<AppSettings | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const scopeRef = useRef({ userId, repository, generation: 0 });
  if (scopeRef.current.userId !== userId || scopeRef.current.repository !== repository) {
    scopeRef.current = { userId, repository, generation: scopeRef.current.generation + 1 };
  }

  useEffect(() => {
    if (!userId || !repository) {
      hydratedUserIdRef.current = null;
      loadedSettingsRef.current = null;
      setSettings(DEFAULT_APP_SETTINGS);
      return;
    }
    if (repository.accountId !== userId || !isCurrentSession()
      || (loginGuard !== null && loginGuard.accountId !== userId)) return;
    hydratedUserIdRef.current = null;
    loadedSettingsRef.current = null;
    let active = true;
    const capturedScope = scopeRef.current;
    const scopeIsCurrent = () => active && scopeRef.current.generation === capturedScope.generation
      && scopeRef.current.userId === userId && scopeRef.current.repository === repository && isCurrentSession();
    void readStoredSettings(repository).then((stored) => {
      if (!scopeIsCurrent()) return;
      hydratedUserIdRef.current = userId;
      const next = stored ?? DEFAULT_APP_SETTINGS;
      loadedSettingsRef.current = next;
      setSettings(next);
    }).catch(() => { /* The shared storage notice reports the failure; do not save defaults. */ });
    return () => { active = false; };
  }, [isCurrentSession, loginGuard, repository, userId]);

  useEffect(() => {
    if (!userId || !repository || hydratedUserIdRef.current !== userId) return;
    if (repository.accountId !== userId || !isCurrentSession()
      || (loginGuard !== null && loginGuard.accountId !== userId)) return;
    if (loadedSettingsRef.current === settings) return;
    const capturedScope = scopeRef.current;
    const attemptedSettings = settings;
    const scopeIsCurrent = () => scopeRef.current.generation === capturedScope.generation
      && scopeRef.current.userId === userId && scopeRef.current.repository === repository && isCurrentSession();
    void (async () => {
      try {
        let localGuard: OutboxLocalCommitGuard | undefined;
        if (loginGuard) {
          if (loginGuard.accountId !== userId) return;
          // Settings are user-authored intent. Keep the write valid through an
          // auth/access pause, while still fencing a logout or account switch.
          const localCommitGuard = {
            accountId: loginGuard.accountId,
            serverSessionId: loginGuard.serverSessionId,
            sessionEpoch: loginGuard.sessionEpoch,
          };
          if (!await repository.isLocalCommitSessionCurrent(localCommitGuard)) return;
          localGuard = { localCommitGuard, canCommit: isCurrentSession };
        }
        if (!scopeIsCurrent()) return;
        if (localGuard) await repository.writeLocalJson('settings', attemptedSettings, localGuard);
        else await repository.writeJson('settings', attemptedSettings);
        if (scopeIsCurrent()) loadedSettingsRef.current = attemptedSettings;
      } catch {
        if (!scopeIsCurrent() || settingsRef.current !== attemptedSettings) return;
        // Keep the last locally committed value selected. The repository notice
        // exposes the storage failure, and another user choice can retry it.
        setSettings(loadedSettingsRef.current ?? DEFAULT_APP_SETTINGS);
      }
    })();
  }, [isCurrentSession, loginGuard, repository, settings, userId]);

  return { settings, setSettings };
}
