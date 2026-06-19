/**
 * PWA регистрация должна работать ТОЛЬКО в среде Vite (dev/build),
 * потому что virtual:pwa-register — виртуальный модуль Vite.
 *
 * В Google AI Studio (native ESM через importmap) import.meta.env отсутствует,
 * поэтому мы просто ничего не делаем.
 */
export async function initPWA() {
  const env = (import.meta as any)?.env;
  if (!env) return;

  try {
    const storedBuildId = localStorage.getItem('fitfocus.build.id');
    if (storedBuildId !== __FITFOCUS_BUILD_ID__) {
      const keysToDrop: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (/^fitfocus_data_.*_all_users$/.test(key)) keysToDrop.push(key);
      }
      for (const key of keysToDrop) {
        localStorage.removeItem(key);
      }
      localStorage.setItem('fitfocus.build.id', __FITFOCUS_BUILD_ID__);
    }
  } catch {}

  try {
    const mod = await import('virtual:pwa-register');
    const registerSW = mod.registerSW as (opts: any) => void;
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        void ((updateSW as unknown as (reloadPage?: boolean) => Promise<void>)?.(true));
      },
      onRegisteredSW(_swScriptUrl: string, registration?: ServiceWorkerRegistration) {
        // Показываем новую сборку при следующем обновлении, не оставляя старые чанки висеть.
        if (registration) {
          void registration.update?.();
        }
      },
      onRegisterError(error: unknown) {
        console.error('SW registration error', error);
      },
    });

  } catch (e) {
    // В dev-среде без плагина или при проблемах с билдом — не валим приложение.
    console.warn('PWA registration skipped:', e);
  }
}
