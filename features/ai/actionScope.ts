/** Each login/page lifetime owns its attempts; reactivation never revives an older one. */
export class AiActionScope {
  private active = false;
  private version = 0;
  private controller?: AbortController;
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
  invalidate(): void {
    this.active = false; this.version += 1;
    this.removeBeforeUnload();
    this.controller?.abort(); this.controller = undefined;
  }
  activate(): void { this.invalidate(); this.active = true; }
  begin(options: { abortOnBeforeUnload?: boolean } = {}) {
    if (!this.active || !this.isCurrentSession()) return null;
    this.removeBeforeUnload();
    this.controller?.abort();
    const version = ++this.version;
    const controller = this.controller = new AbortController();
    if (options.abortOnBeforeUnload !== false && typeof window !== 'undefined') {
      const target = window;
      const onBeforeUnload = () => {
        if (this.version === version && this.controller === controller) this.invalidate();
      };
      this.beforeUnloadTarget = target;
      this.beforeUnloadHandler = onBeforeUnload;
      target.addEventListener('beforeunload', onBeforeUnload, { once: true });
    }
    return {
      controller,
      isCurrent: () => this.active && this.version === version && !controller.signal.aborted && this.isCurrentSession(),
      finish: () => {
        if (this.version !== version) return;
        this.removeBeforeUnload();
        this.controller = undefined;
      },
    };
  }
}
