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
    const mod = await import('virtual:pwa-register');
    const registerSW = mod.registerSW as (opts: any) => void;

    registerSW({
      immediate: true,
      onRegistered() {
        // console.log('SW registered');
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