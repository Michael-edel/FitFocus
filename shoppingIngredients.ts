export interface NormalizedIngredient {
  name: string;
  key: string;
  grams: number;
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:кг|kg|г|гр|g|мл|ml|л|l)\b/gi, " ")
    .replace(/[.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGramsFromText(value: string): number {
  const text = String(value || "").toLowerCase().replace(/,/g, ".");
  const match = text.match(/(\d+(?:\.\d+)?)\s*(кг|kg|г|гр|g)\b/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const unit = match[2].toLowerCase();
  return Math.round(unit === "кг" || unit === "kg" ? amount * 1000 : amount);
}

function titleizeUnknown(value: string): string {
  const cleaned = normalizeText(value);
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function canonicalName(text: string, original: string): string {
  const t = normalizeText(text);

  if ((t.includes("кур") && t.includes("груд")) || (t.includes("кур") && t.includes("филе"))) return "Куриная грудка";
  if (t.includes("индей")) return "Индейка";
  if (t.includes("говяд")) return "Говядина";
  if (t.includes("свинин")) return "Свинина";
  if (t.includes("треск")) return "Треска";
  if (t.includes("минтай")) return "Минтай";
  if (t.includes("лосос") || t.includes("семг")) return "Лосось";

  if (t.includes("греч")) return "Гречка";
  if (t.includes("рис")) return "Рис";
  if (t.includes("овся")) return "Овсянка";
  if (t.includes("макарон")) return "Макароны";
  if (t.includes("киноа")) return "Киноа";

  if (t.includes("твор")) return "Творог";
  if (t.includes("кефир")) return "Кефир";
  if (t.includes("йогур")) return "Йогурт";
  if (t.includes("яиц") || t.includes("яйц")) return "Яйца";

  if (t.includes("картоф")) return "Картофель";
  if (t.includes("морков")) return "Морковь";
  if (t.includes("помид") || t.includes("томат")) return "Помидоры";
  if (t.includes("огур")) return "Огурцы";
  if (t.includes("брокк")) return "Брокколи";
  if (t.includes("капуст")) return "Капуста";
  if (t.includes("салат")) return "Листовой салат";
  if (t.includes("перец")) return "Перец сладкий";
  if (t.includes("лук")) return "Лук";

  if (t.includes("яблок")) return "Яблоки";
  if (t.includes("банан")) return "Бананы";
  if (t.includes("ягод")) return "Ягоды";
  if (t.includes("орех") || t.includes("миндал")) return "Орехи";

  if (t.includes("оливк") && t.includes("масл")) return "Оливковое масло";
  if (t.includes("раститель") && t.includes("масл")) return "Растительное масло";

  return titleizeUnknown(original);
}

export function ingredientKey(name: string): string {
  return normalizeText(canonicalName(name, name));
}

export function normalizeShoppingIngredient(rawName: unknown, rawGrams: unknown): NormalizedIngredient {
  const original = String(rawName || "").trim();
  const name = canonicalName(original, original);
  const providedGrams = Math.round(Number(rawGrams || 0));
  const grams = Math.max(0, Number.isFinite(providedGrams) && providedGrams > 0 ? providedGrams : extractGramsFromText(original));
  return {
    name,
    key: normalizeText(name),
    grams,
  };
}

export function aggregateShoppingRows(rows: Array<{ name?: unknown; grams?: unknown; checked?: unknown }>) {
  const byKey = new Map<string, { name: string; grams: number; checked: boolean }>();

  for (const row of rows || []) {
    const normalized = normalizeShoppingIngredient(row.name, row.grams);
    if (!normalized.name || normalized.grams <= 0) continue;
    const prev = byKey.get(normalized.key);
    if (prev) {
      prev.grams += normalized.grams;
      prev.checked = prev.checked || Boolean(row.checked);
    } else {
      byKey.set(normalized.key, {
        name: normalized.name,
        grams: normalized.grams,
        checked: Boolean(row.checked),
      });
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
