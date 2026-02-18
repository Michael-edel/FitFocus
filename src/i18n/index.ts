import { ru } from "./ru";

export type Locale = "ru";
export const defaultLocale: Locale = "ru";

export function t(path: string, locale: Locale = defaultLocale): string {
  const dict: any = { ru }[locale];
  return path.split(".").reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), dict) ?? path;
}
