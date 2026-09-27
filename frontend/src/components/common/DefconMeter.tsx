import { useTranslation } from "../../i18n/useTranslation";
import { Translations } from "../../i18n/translations";
import { TelemetryState } from "../../types/game";
import { computeDefconLevel, DefconLevel } from "../../utils/defcon";

interface DefconMeterProps {
  telemetry: TelemetryState;
}

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
// (IMMINENT COLLAPSE, PULSING RED WITH A GLITCH JITTER), DERIVED PURELY FROM LIVE TELEMETRY
export default function DefconMeter({ telemetry }: DefconMeterProps) {
  const t = useTranslation();
  const level = computeDefconLevel(telemetry);
  const style = LEVEL_STYLE[level];

  return (
    <div
      title={`${t.defcon.label} ${level} :: ${levelLabel(t, level)}`}
      className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-md border shrink-0 ${style.ring} ${
        style.pulse ? "animate-pulse" : ""
      }`}
    >
      <span className={`text-[9px] font-bold uppercase tracking-widest opacity-70 ${style.text}`}>{t.defcon.label}</span>
      <span
        className={`font-heading font-extrabold text-lg leading-none tabular-nums ${style.text} ${
          style.glitch ? "animate-defcon-glitch" : ""
        }`}
      >
        {level}
      </span>
      <span className={`hidden hd:inline text-[8px] font-semibold uppercase tracking-wide opacity-80 ${style.text}`}>
        {levelLabel(t, level)}
      </span>
    </div>
  );
}
