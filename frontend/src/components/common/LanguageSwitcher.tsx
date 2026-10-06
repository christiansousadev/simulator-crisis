import { Globe } from "lucide-react";
import { Language, SUPPORTED_LANGUAGES } from "../../i18n/language";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";

const CODE: Record<Language, string> = { en: "EN", "pt-BR": "PT", es: "ES" };

// COMPACT LANGUAGE PILL SWITCH. Language codes with a globe icon (no flag emoji: those render as
// two letters on Windows and carry a political meaning a language does not).
export default function LanguageSwitcher() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const setLanguage = useGameStore((s) => s.setLanguage);

  return (
    <div role="group" aria-label={t.hud.language.label} className="flex items-center gap-0.5 rounded-lg bg-slate-800 p-0.5">
      <Globe className="mx-1 h-3.5 w-3.5 text-slate-400" aria-hidden />
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={language === lang}
          onClick={() => setLanguage(lang)}
          className={`rounded-md px-2 py-1 text-caption font-bold transition-colors ${
            language === lang ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          }`}
        >
          {CODE[lang]}
        </button>
      ))}
    </div>
  );
}
