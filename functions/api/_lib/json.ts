export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function safeJsonParseObject(text: string): JsonObject | null {
  const parsed = safeJsonParse(text);
  return isJsonObject(parsed) ? parsed : null;
}

export function asString(value: unknown, fallback = ""): string {
  const next = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return next || fallback;
}

export function asOptionalString(value: unknown): string | null {
  const next = asString(value);
  return next || null;
}

export function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function asFiniteNumber(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}
