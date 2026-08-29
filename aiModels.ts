/**
 * AI model IDs used by both the browser client and Pages Functions.
 * Keep provider secrets out of this file: it is bundled into the browser.
 */
export const AI_DEFAULT_MODEL = "gpt-5.6-luna" as const;
export const OPENAI_ALLOWED_MODELS = [AI_DEFAULT_MODEL] as const;

// Legacy Gemini IDs remain accepted for already-open browser sessions and old data.
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash" as const;
export const GEMINI_REASONING_MODEL = "gemini-2.5-pro" as const;
export const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite" as const;

export const GEMINI_ALLOWED_MODELS = [
  GEMINI_DEFAULT_MODEL,
  GEMINI_REASONING_MODEL,
  GEMINI_FALLBACK_MODEL,
] as const;

export const AI_ALLOWED_MODELS = [
  ...OPENAI_ALLOWED_MODELS,
  ...GEMINI_ALLOWED_MODELS,
] as const;

const GEMINI_MODEL_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  [GEMINI_REASONING_MODEL]: [GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL],
  [GEMINI_DEFAULT_MODEL]: [GEMINI_FALLBACK_MODEL],
  [GEMINI_FALLBACK_MODEL]: [GEMINI_DEFAULT_MODEL],
};

export function getGeminiFallbackModels(model: string): string[] {
  return [...(GEMINI_MODEL_FALLBACKS[model] ?? [GEMINI_DEFAULT_MODEL])]
    .filter((candidate, index, candidates) => candidate !== model && candidates.indexOf(candidate) === index);
}

export function getAiFallbackModels(model: string): string[] {
  return model.startsWith("gpt-") ? [] : getGeminiFallbackModels(model);
}
