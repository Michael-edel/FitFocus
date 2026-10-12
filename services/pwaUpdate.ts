export type PwaUpdateState = Readonly<{ visible: boolean; applying: boolean; error: boolean }>;
const idle: PwaUpdateState = Object.freeze({ visible: false, applying: false, error: false });
let state = idle;
let activate: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();

export const getPwaUpdateState = () => state;
export const getInitialPwaUpdateState = () => idle;
export const subscribePwaUpdate = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(value: PwaUpdateState) { state = Object.freeze(value); for (const listener of listeners) listener(); }

/** Registration may announce availability, but only the visible action activates it. */
export function offerPwaUpdate(update: () => Promise<void>) {
  activate = update;
  if (!state.applying) publish({ visible: true, applying: false, error: false });
}
export function dismissPwaUpdate() { if (!state.applying) publish({ ...state, visible: false }); }

export async function applyPwaUpdate() {
  if (!activate || state.applying) return;
  const update = activate;
  publish({ visible: true, applying: true, error: false });
  const worker = navigator.serviceWorker;
  let finished = false;
  const cleanup = () => { clearTimeout(timer); worker.removeEventListener('controllerchange', changed); };
  const changed = () => { finished = true; cleanup(); };
  const failed = () => {
    if (finished) return;
    finished = true; cleanup(); publish({ visible: true, applying: false, error: true });
  };
  const timer = setTimeout(failed, 10_000);
  // Subscribe before messaging: activation can be quicker than update() resolves.
  worker.addEventListener('controllerchange', changed, { once: true });
  try { await update(); }
  catch { failed(); }
}
