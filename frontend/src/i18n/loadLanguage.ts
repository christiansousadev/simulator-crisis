import { DynamicLocale, registerDynamicLocale } from "./dynamicContent";
import type { Language } from "./language";
import { isLanguageReady, registerTranslations, Translations } from "./translations";

// per-language code splitting: english ships in the main chunk (fallback + tests), pt-BR and es are
// separate chunks fetched with a dynamic import only when that language becomes active
interface LocaleModule {
  translations: Translations;
  dynamic: DynamicLocale;
}

const LOADERS: Record<Exclude<Language, "en">, () => Promise<LocaleModule>> = {
  "pt-BR": () => import("./locales/pt-BR"),
  es: () => import("./locales/es"),
};

const inflight = new Map<Language, Promise<void>>();

// RESOLVES ONCE THE LANGUAGE'S DICTIONARY AND DYNAMIC-CONTENT TABLES ARE REGISTERED. Callers must
// await it before rendering or switching to that language. Rejects (and may be retried) when the
// chunk cannot be fetched, e.g. offline with a cold cache.
export function loadLanguage(language: Language): Promise<void> {
  if (language === "en" || isLanguageReady(language)) return Promise.resolve();
  const pending = inflight.get(language);
  if (pending) return pending;
  const task = LOADERS[language]()
    .then((mod) => {
      registerTranslations(language, mod.translations);
      registerDynamicLocale(language, mod.dynamic);
    })
    .finally(() => inflight.delete(language));
  inflight.set(language, task);
  return task;
}
