/** Concurrent family actions own their controllers; only a newer action of the same kind supersedes one. */
export class FamilyActionScope {
  private active = false;
  private epoch = 0;
  private controllers = new Map<string, AbortController>();
  constructor(private readonly isCurrentSession: () => boolean) {}
  isCurrent() { return this.active && this.isCurrentSession(); }
  activate() { this.invalidate(); this.active = true; }
  invalidate() {
    this.active = false; this.epoch += 1;
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
  begin(key: string) {
    if (!this.active || !this.isCurrentSession()) return null;
    this.controllers.get(key)?.abort();
    const epoch = this.epoch, controller = new AbortController();
    this.controllers.set(key, controller);
    return {
      controller,
      isCurrent: () => this.active && epoch === this.epoch && !controller.signal.aborted
        && this.controllers.get(key) === controller && this.isCurrentSession(),
      finish: () => { if (this.controllers.get(key) === controller) this.controllers.delete(key); },
    };
  }
}
