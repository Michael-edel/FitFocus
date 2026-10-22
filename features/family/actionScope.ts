/** Concurrent family actions own their controllers; only a newer action of the same kind supersedes one. */
export class FamilyActionScope {
  private active = false;
  private epoch = 0;
  private controllers = new Map<string, AbortController>();
  private beforeUnloadTarget?: Window;
  private beforeUnloadHandler?: () => void;
  constructor(private readonly isCurrentSession: () => boolean) {}
  private removeBeforeUnload(): void {
    if (this.beforeUnloadTarget && this.beforeUnloadHandler) {
      this.beforeUnloadTarget.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    this.beforeUnloadTarget = undefined;
    this.beforeUnloadHandler = undefined;
  }
  isCurrent() { return this.active && this.isCurrentSession(); }
  activate() { this.invalidate(); this.active = true; }
  invalidate() {
    this.active = false; this.epoch += 1;
    this.removeBeforeUnload();
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
  begin(key: string) {
    if (!this.active || !this.isCurrentSession()) return null;
    const wasIdle = this.controllers.size === 0;
    this.controllers.get(key)?.abort();
    const epoch = this.epoch, controller = new AbortController();
    this.controllers.set(key, controller);
    if (wasIdle && typeof window !== 'undefined') {
      const target = window;
      const onBeforeUnload = () => this.invalidate();
      this.beforeUnloadTarget = target;
      this.beforeUnloadHandler = onBeforeUnload;
      target.addEventListener('beforeunload', onBeforeUnload, { once: true });
    }
    return {
      controller,
      isCurrent: () => this.active && epoch === this.epoch && !controller.signal.aborted
        && this.controllers.get(key) === controller && this.isCurrentSession(),
      finish: () => {
        if (this.controllers.get(key) !== controller) return;
        this.controllers.delete(key);
        if (this.controllers.size === 0) this.removeBeforeUnload();
      },
    };
  }
}
