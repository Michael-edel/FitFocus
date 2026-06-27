import { ru } from "./ru";

export type Locale = "ru";
export const defaultLocale: Locale = "ru";

type TranslationTree = {
  [key: string]: string | TranslationTree;
};

const dictionaries: Record<Locale, TranslationTree> = { ru };

export function t(path: string, locale: Locale = defaultLocale): string {
  let current: string | TranslationTree | undefined = dictionaries[locale];
  for (const key of path.split(".")) {
    if (!current || typeof current === "string") return path;
    current = current[key];
  }
  return typeof current === "string" ? current : path;
}
