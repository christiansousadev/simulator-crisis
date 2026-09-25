import { Language, SUPPORTED_LANGUAGES } from "../../i18n/language";
import { useGameStore } from "../../store/useGameStore";

const FLAG: Record<Language, string> = { en: "🇺🇸", "pt-BR": "🇧🇷", es: "🇪🇸" };
const CODE: Record<Language, string> = { en: "EN", "pt-BR": "PT", es: "ES" };

// COMPACT LANGUAGE PILL SWITCH FOR THE TOPBAR
export default function LanguageSwitcher() {
  const language = useGameStore((s) => s.language);
  const setLanguage = useGameStore((s) => s.setLanguage);

  return (
    <div className="flex items-center gap-0.5 bg-slate-800 p-0.5 rounded-lg">
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          onClick={() => setLanguage(lang)}
          className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 ${
            language === lang ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:bg-slate-700"
          }`}
        >
          <span>{FLAG[lang]}</span>
          {CODE[lang]}
        </button>
      ))}
    </div>
  );
}
