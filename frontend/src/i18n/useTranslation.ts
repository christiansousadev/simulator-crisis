import { useGameStore } from "../store/useGameStore";
import { TRANSLATIONS, Translations } from "./translations";

// RESOLVE THE ACTIVE TRANSLATION DICTIONARY FOR THE CURRENTLY SELECTED LANGUAGE
export function useTranslation(): Translations {
  const language = useGameStore((s) => s.language);
  return TRANSLATIONS[language];
}
