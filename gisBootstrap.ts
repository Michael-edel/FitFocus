// Ensures global callback exists before Google GIS can call it (prevents ReferenceError)
// NOTE: this file must be imported as early as possible (first import in index.tsx)
;(globalThis as any).setGoogleSessionId =
  (globalThis as any).setGoogleSessionId ||
  function (sessionId: string | null) {
    try { (globalThis as any).__googleSessionId = sessionId } catch {}
  };
