import { safeGetItem, safeSetItem } from "./utils";
import { STORAGE_KEYS } from "./keys";

// Minimal repos (localStorage-backed). Later we can swap implementation to IndexedDB without changing callers.

export class JsonRepo {
  constructor(private keyName: string) {}
  load<T>(fallback: T): T { return safeGetItem<T>(this.keyName, fallback); }
  save(value: unknown): void { safeSetItem(this.keyName, value); }
  clear(): void { localStorage.removeItem(this.keyName); }
}

export class ProfileRepo {
  constructor(private userId: string) {}
  private key() { return `${STORAGE_KEYS.dataPrefix}${this.userId}`; }
  load<T>(fallback: T): T { return safeGetItem<T>(this.key(), fallback); }
  save(value: unknown): void { safeSetItem(this.key(), value); }
}

export class SettingsRepo {
  constructor(private userId: string) {}
  private key() { return `fitfocus_settings_${this.userId}`; }
  load<T>(fallback: T): T { return safeGetItem<T>(this.key(), fallback); }
  save(value: unknown): void { safeSetItem(this.key(), value); }
}

export class FoodLogRepo {
  constructor(private userId: string) {}
  private key() { return `fitfocus_foodlog_${this.userId}`; }
  load<T>(fallback: T): T { return safeGetItem<T>(this.key(), fallback); }
  save(value: unknown): void { safeSetItem(this.key(), value); }
}
