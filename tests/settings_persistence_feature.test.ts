import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  isAppSettings,
  readStoredSettings,
} from '../features/settings/useSettingsPersistence';

describe('settings persistence feature', () => {
  it('accepts only complete settings records', () => {
    expect(isAppSettings({
      theme: 'premium',
      language: 'ru',
      soundEnabled: true,
      musicEnabled: false,
    })).toBe(true);
    expect(isAppSettings({ theme: 'dark' })).toBe(false);
    expect(isAppSettings({ ...DEFAULT_APP_SETTINGS, language: 'en' })).toBe(false);
  });

  it('uses the typed repository fallback for invalid stored settings', async () => {
    const repository = {
      readJsonAsync: async <T,>(_key: string, fallback: T) => fallback,
      writeJson: async () => ({} as never),
    };

    expect(await readStoredSettings(repository)).toBeNull();
  });
});
