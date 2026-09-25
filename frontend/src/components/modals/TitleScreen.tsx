import { Award, Building2, Gamepad2, Info, Play, Settings } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { startAmbientMusic } from "../../utils/sound";

// FULL-SCREEN MAIN MENU: THE FIRST THING A PLAYER SEES BEFORE THE OFFICE LOADS
export default function TitleScreen() {
  const t = useTranslation();
  const hideTitleScreen = useGameStore((s) => s.hideTitleScreen);
  const openScenarioSelect = useGameStore((s) => s.openScenarioSelect);
  const openSettings = useGameStore((s) => s.openSettings);
  const openCredits = useGameStore((s) => s.openCredits);
  const openHallOfFame = useGameStore((s) => s.openHallOfFame);

  // the title screen's first click is also the browser-required gesture that unlocks audio
  const withMusicStart = (action: () => void) => () => {
    startAmbientMusic();
    action();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 text-white overflow-hidden">
      {/* faint animated grid backdrop, purely decorative */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.15) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative flex flex-col items-center gap-2 mb-10">
        <div className="p-4 rounded-2xl bg-sky-500/15 text-sky-400 border border-sky-500/30 animate-pop-in">
          <Building2 className="w-12 h-12" />
        </div>
        <h1 className="font-heading font-bold text-4xl sm:text-5xl tracking-wide mt-2">IncidentZero Corp.</h1>
        <p className="text-slate-400 text-sm tracking-[0.2em] uppercase">{t.titleScreen.tagline}</p>
      </div>

      <div className="relative flex flex-col gap-2.5 w-full max-w-xs px-4">
        <button
          onClick={withMusicStart(hideTitleScreen)}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-colors"
        >
          <Play className="w-4 h-4" />
          {t.titleScreen.continue}
        </button>
        <button
          onClick={withMusicStart(() => {
            hideTitleScreen();
            openScenarioSelect();
          })}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm font-bold transition-colors"
        >
          <Gamepad2 className="w-4 h-4" />
          {t.titleScreen.newGame}
        </button>
        <button
          onClick={withMusicStart(openHallOfFame)}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm font-bold transition-colors"
        >
          <Award className="w-4 h-4" />
          {t.titleScreen.hallOfFame}
        </button>
        <button
          onClick={withMusicStart(openSettings)}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm font-bold transition-colors"
        >
          <Settings className="w-4 h-4" />
          {t.titleScreen.settings}
        </button>
        <button
          onClick={withMusicStart(openCredits)}
          className="flex items-center justify-center gap-2 px-3 py-2 text-slate-500 hover:text-slate-300 text-xs font-semibold transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
          {t.titleScreen.credits}
        </button>
      </div>

      <p className="absolute bottom-4 text-[10px] text-slate-600">{t.titleScreen.footer}</p>
    </div>
  );
}
