import type { ImageQualityInfo } from "./imageQuality";

export type AnalysisMeta = {
  confidence: number;             // 0..1
  compressed: boolean;            // messenger-like compression suspected
  enhancedRun: boolean;           // user pressed "Improve analysis"
  quality?: ImageQualityInfo;
  reasons: string[];
};

export type ConfidenceInput = {
  modelConfidence?: number;       // optional from AI, fallback 0.9
  quality: ImageQualityInfo;
  ingredientCount: number;
  calories: number;
};

export function computeConfidence(input: ConfidenceInput): AnalysisMeta {
  let score = typeof input.modelConfidence === "number" && Number.isFinite(input.modelConfidence)
    ? input.modelConfidence
    : 0.9;
  const reasons: string[] = [];

  // Compression penalty
  if (input.quality.suspectedMessengerCompression) {
    score -= 0.08;
    reasons.push("Фото похоже на сжатое мессенджером (детали могли потеряться).");
  }

  // Resolution penalty (even if not messenger)
  if (Math.max(input.quality.width, input.quality.height) < 1200) {
    score -= 0.06;
    reasons.push("Низкое разрешение снижает точность определения ингредиентов.");
  }

  // Ingredient ambiguity
  if (input.ingredientCount < 2) {
    score -= 0.05;
    reasons.push("Слишком мало распознанных ингредиентов — возможно, часть не распознана.");
  }

  // Macro outliers
  if (input.calories < 30 || input.calories > 1200) {
    score -= 0.07;
    reasons.push("Нетипичная калорийность — вероятна ошибка оценки порции или состава.");
  }

  score = Math.max(0.5, Math.min(1, score));

  return {
    confidence: score,
    compressed: input.quality.suspectedMessengerCompression,
    enhancedRun: false,
    quality: input.quality,
    reasons
  };
}

export function confidenceLabel(confidence: number): { label: string; level: "high"|"mid"|"low" } {
  if (confidence >= 0.9) return { label: "Высокая точность", level: "high" };
  if (confidence >= 0.82) return { label: "Средняя точность", level: "mid" };
  return { label: "Низкая точность", level: "low" };
}

export function shouldShowImprove(confidence: number): boolean {
  return confidence < 0.82;
}

export function shouldSuggestPortionAdjust(confidence: number): boolean {
  return confidence < 0.75;
}
