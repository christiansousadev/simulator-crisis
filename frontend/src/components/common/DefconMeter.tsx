import { memo } from "react";
import { useChangeSeq } from "../../hooks/useChangeSeq";
import { useTranslation } from "../../i18n/useTranslation";
import { Translations } from "../../i18n/translations";
import { useGameStore } from "../../store/useGameStore";
import { DefconLevel, selectDefconLevel } from "../../utils/defcon";

const LEVEL_STYLE: Record<DefconLevel, { text: string; ring: string; pulse: boolean; glitch: boolean }> = {
  5: { text: "text-emerald-400", ring: "border-emerald-500/50 bg-emerald-500/10", pulse: false, glitch: false },
  4: { text: "text-sky-400", ring: "border-sky-500/50 bg-sky-500/10", pulse: false, glitch: false },
  3: { text: "text-amber-400", ring: "border-amber-500/50 bg-amber-500/10", pulse: false, glitch: false },
  2: { text: "text-rose-400", ring: "border-rose-500/60 bg-rose-500/10", pulse: true, glitch: false },
  1: { text: "text-rose-300", ring: "border-rose-400 bg-rose-600/20", pulse: true, glitch: true },
};

function levelLabel(t: Translations, level: DefconLevel): string {
  switch (level) {
    case 5:
      return t.defcon.level5;
    case 4:
      return t.defcon.level4;
    case 3:
      return t.defcon.level3;
    case 2:
      return t.defcon.level2;
    case 1:
      return t.defcon.level1;
  }
}

// MILITARY-STYLE TACTICAL THREAT BADGE: DEFCON 5 (NOMINAL, NEON GREEN) DOWN TO DEFCON 1
// (IMMINENT COLLAPSE, PULSING RED WITH A GLITCH JITTER), DERIVED PURELY FROM LIVE TELEMETRY.
// Fixed width (the long level names truncate) so a level change never re-centers the kpi cluster;
// a change slides the digit in and flashes the badge once.
export default memo(function DefconMeter() {
  const t = useTranslation();
  const level = useGameStore(selectDefconLevel);
  const style = LEVEL_STYLE[level];
  const changeSeq = useChangeSeq(level);

  return (
    <div
      role="status"
      title={`${t.defcon.label} ${level} :: ${levelLabel(t, level)}`}
      className={`flex w-[5.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1.5 py-1 transition-colors duration-slow ${style.ring} ${style.text} ${
        style.pulse ? "animate-pulse" : ""
      }`}
    >
      <span className="font-heading text-micro font-bold uppercase leading-none tracking-widest opacity-80">{t.defcon.label}</span>
      <span
        key={changeSeq}
        className={`rounded font-heading text-lg font-extrabold leading-none tabular-nums ${
          changeSeq > 0 ? "animate-slide-down-in" : ""
        } ${style.glitch ? "animate-defcon-glitch" : ""}`}
      >
        {level}
      </span>
      <span className="hidden w-full truncate text-center text-micro font-semibold uppercase leading-none tracking-wide opacity-90 hd:block">
        {levelLabel(t, level)}
      </span>
    </div>
  );
});
