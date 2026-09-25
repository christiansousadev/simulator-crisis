export type Language = "en" | "pt-BR" | "es";

export const SUPPORTED_LANGUAGES: Language[] = ["en", "pt-BR", "es"];
export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "incidentzero.language";

// DETECT A SUPPORTED LANGUAGE FROM THE BROWSER LOCALE, FALLING BACK TO ENGLISH
export function detectBrowserLanguage(): Language {
  if (typeof navigator === "undefined") return DEFAULT_LANGUAGE;
  const locale = navigator.language?.toLowerCase() ?? "";
  if (locale.startsWith("pt")) return "pt-BR";
  if (locale.startsWith("es")) return "es";
  return DEFAULT_LANGUAGE;
}

// READ A PERSISTED LANGUAGE CHOICE, FALLING BACK TO BROWSER DETECTION
export function loadStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored as Language)) {
      return stored as Language;
    }
  } catch {
    // localStorage unavailable (private mode, ssr); fall through to detection
  }
  return detectBrowserLanguage();
}

// PERSIST A LANGUAGE CHOICE, IGNORING STORAGE FAILURES
export function persistLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // best-effort only
  }
}
