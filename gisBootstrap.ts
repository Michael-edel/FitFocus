// Ensures global callback exists before Google GIS can call it (prevents ReferenceError)
// NOTE: this file must be imported as early as possible (first import in index.tsx)
type GoogleSessionGlobal = typeof globalThis & {
  setGoogleSessionId?: (sessionId: string | null) => void;
  __googleSessionId?: string | null;
};

const globalScope = globalThis as GoogleSessionGlobal;

globalScope.setGoogleSessionId =
  globalScope.setGoogleSessionId ||
  function (sessionId: string | null) {
    try { globalScope.__googleSessionId = sessionId } catch {}
  };
