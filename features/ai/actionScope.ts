/** Each login/page lifetime owns its attempts; reactivation never revives an older one. */
export class AiActionScope {
  private active = false;
  private version = 0;
  private controller?: AbortController;
  constructor(private readonly isCurrentSession: () => boolean) {}
  invalidate(): void {
    this.active = false; this.version += 1;
    this.controller?.abort(); this.controller = undefined;
  }
  activate(): void { this.invalidate(); this.active = true; }
  begin() {
    if (!this.active || !this.isCurrentSession()) return null;
    this.controller?.abort();
    const version = ++this.version;
    const controller = this.controller = new AbortController();
    return {
      controller,
      isCurrent: () => this.active && this.version === version && !controller.signal.aborted && this.isCurrentSession(),
      finish: () => { if (this.version === version) this.controller = undefined; },
    };
  }
}
