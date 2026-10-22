/** Cached drafts seed a scope once; later profile publications cannot revive them. */
export class ProfileDraftHydration {
  private readonly consumed = new Set<string>();

  consume(scope: string | null): void {
    if (scope) this.consumed.add(scope);
  }

  take(scope: string, allowed: boolean, dirty: boolean): boolean {
    if (dirty) this.consume(scope);
    if (!allowed || this.consumed.has(scope)) return false;
    // Consume before applying setters, including under repeated effects.
    this.consume(scope);
    return true;
  }
}
